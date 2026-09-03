import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { config } from "@/platform/config";
import { signSession, verifySession } from "@/platform/crypto";
import { AppError, publicError } from "@/domain/errors";

const COOKIE = "bao_session";
export async function owner(create = false) {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  const existing = token ? verifySession(token) : null;
  if (existing) return existing;
  if (!create)
    throw new AppError("SESSION_REQUIRED", "请刷新页面以建立安全会话。", 401);
  const id = randomUUID();
  const days = 30;
  jar.set(COOKIE, signSession(id, Date.now() + days * 86400000), {
    httpOnly: true,
    secure: config().APP_ORIGIN.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: days * 86400,
  });
  return id;
}
export function requireOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(config().APP_ORIGIN).origin)
    throw new AppError("ORIGIN_REJECTED", "请求来源不受信任。", 403);
}
export async function jsonBody(request: Request) {
  const text = await request.text();
  if (text.length > 16000)
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
