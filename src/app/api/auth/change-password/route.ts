import { z } from "zod";
import { AppError } from "@/domain/errors";
import {
  apiError,
  clearAuthCookie,
  jsonBody,
  requireWrite,
} from "@/adapters/http/session";
import { changeAccountPassword } from "@/application/auth/service";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    currentPassword: z.string().min(1).max(256),
    newPassword: z.string().min(1).max(256),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const auth = await requireWrite(request);
    const parsed = bodySchema.safeParse(await jsonBody(request));
    if (!parsed.success)
      throw new AppError("INVALID_INPUT", "请检查当前密码和新密码。", 422);
    await changeAccountPassword(
      auth.userId,
      parsed.data.currentPassword,
      parsed.data.newPassword,
    );
    await clearAuthCookie();
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
