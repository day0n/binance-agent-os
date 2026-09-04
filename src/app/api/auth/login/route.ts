import { z } from "zod";
import { AppError } from "@/domain/errors";
import {
  apiError,
  clientIp,
  jsonBody,
  requireSameOrigin,
  setAuthCookie,
} from "@/adapters/http/session";
import { loginAccount } from "@/application/auth/service";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    username: z.string().min(1).max(64),
    password: z.string().min(1).max(256),
  })
  .strict();

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const parsed = bodySchema.safeParse(await jsonBody(request));
    if (!parsed.success)
      throw new AppError("AUTH_FAILED", "用户名或密码不正确。", 401);
    const result = await loginAccount(
      parsed.data.username,
      parsed.data.password,
      clientIp(request),
    );
    await setAuthCookie(result.sessionToken, result.expiresAt);
    return Response.json(
      { user: result.user, csrfToken: result.csrfToken },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
