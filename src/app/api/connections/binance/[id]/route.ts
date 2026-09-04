import { z } from "zod";
import { AppError } from "@/domain/errors";
import { apiError, jsonBody, requireUser, requireWrite } from "@/adapters/http/session";
import { getConnection } from "@/adapters/persistence/connection-store";
import { removeConnection } from "@/application/connections/service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireUser();
    const connection = await getConnection((await params).id, userId);
    return Response.json(
      {
        connection: {
          id: connection.id,
          role: connection.role,
          environment: connection.environment,
          apiKeyFingerprint: connection.apiKeyFingerprint,
          permissions: connection.permissions,
          status: connection.status,
          lastVerifiedAt: connection.lastVerifiedAt,
          createdAt: connection.createdAt,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireWrite(request);
    const parsed = z
      .object({ password: z.string().min(1).max(256) })
      .strict()
      .safeParse(await jsonBody(request));
    if (!parsed.success)
      throw new AppError("INVALID_INPUT", "删除连接需要当前账号密码。", 422);
    await removeConnection((await params).id, userId, parsed.data.password);
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
