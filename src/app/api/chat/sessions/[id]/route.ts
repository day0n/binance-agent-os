import { z } from "zod";
import { AppError } from "@/domain/errors";
import {
  apiError,
  jsonBody,
  requireUser,
  requireWrite,
} from "@/adapters/http/session";
import {
  deleteChatSession,
  getChatSession,
  patchChatSession,
} from "@/adapters/persistence/chat-store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireUser();
    const session = await getChatSession((await params).id, userId);
    return Response.json(
      { session },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireWrite(request);
    const parsed = z
      .object({ title: z.string().trim().min(1).max(80) })
      .strict()
      .safeParse(await jsonBody(request, 2000));
    if (!parsed.success)
      throw new AppError("INVALID_INPUT", "会话标题无效。", 422);
    const session = await patchChatSession((await params).id, userId, parsed.data);
    return Response.json(
      { session },
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
    await deleteChatSession((await params).id, userId);
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
