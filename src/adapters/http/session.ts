import { cookies } from "next/headers";
import { AUTH_COOKIE, AUTH_SESSION_MS, type PublicUser } from "@/domain/auth";
import { AppError, publicError } from "@/domain/errors";
import { currentUserFromToken } from "@/application/auth/service";
import { config } from "@/platform/config";
import { constantTimeEqual } from "@/platform/crypto";
import { touchAuthSession } from "@/adapters/persistence/auth-store";

export type RequestAuth = {
  user: PublicUser;
  sessionId: string;
  userId: string;
  csrfToken: string;
};

async function rawAuthToken() {
  return (await cookies()).get(AUTH_COOKIE)?.value ?? null;
}

export async function optionalUser(): Promise<RequestAuth | null> {
  const token = await rawAuthToken();
  if (!token) return null;
  const found = await currentUserFromToken(token);
  if (!found) return null;
  await touchAuthSession(found.session.id, found.user.id).catch(() => undefined);
  return {
    user: {
      id: found.user.id,
      username: found.user.usernameDisplay,
      status: found.user.status,
      createdAt: found.user.createdAt,
      updatedAt: found.user.updatedAt,
    },
    sessionId: found.session.id,
    userId: found.user.id,
    csrfToken: found.csrfToken,
  };
}

export async function requireUser(): Promise<RequestAuth> {
  const auth = await optionalUser();
  if (!auth) throw new AppError("SESSION_REQUIRED", "请先登录。", 401);
  return auth;
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(config().APP_ORIGIN).origin)
    throw new AppError("ORIGIN_REJECTED", "请求来源不受信任。", 403);
}

export const requireOrigin = requireSameOrigin;

export async function requireCsrf(request: Request) {
  const auth = await requireUser();
  const header = request.headers.get("x-csrf-token") ?? "";
  if (!header || !constantTimeEqual(header, auth.csrfToken))
    throw new AppError("CSRF_REJECTED", "安全校验失败。", 403);
  return auth;
}

export async function requireWrite(request: Request) {
  requireSameOrigin(request);
  return requireCsrf(request);
}

export async function setAuthCookie(sessionToken: string, expiresAt: Date) {
  (await cookies()).set(AUTH_COOKIE, sessionToken, {
    httpOnly: true,
    secure: config().APP_ORIGIN.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    maxAge: Math.floor(AUTH_SESSION_MS / 1000),
  });
}

export async function clearAuthCookie() {
  (await cookies()).set(AUTH_COOKIE, "", {
    httpOnly: true,
    secure: config().APP_ORIGIN.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
  return ip && /^[0-9a-fA-F.:]+$/.test(ip) ? ip : "0.0.0.0";
}

export async function jsonBody(request: Request, max = 16000) {
  const text = await request.text();
  if (text.length > max)
    throw new AppError("INPUT_TOO_LARGE", "请求内容过大。", 413);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError("INVALID_JSON", "请求格式无效。", 400);
  }
}

export function apiError(error: unknown) {
  return Response.json(
    { error: publicError(error) },
    {
      status: error instanceof AppError ? error.status : 500,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
