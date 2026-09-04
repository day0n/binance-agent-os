import { z } from "zod";
import { AppError } from "@/domain/errors";
import {
  apiError,
  jsonBody,
  requireUser,
  requireWrite,
} from "@/adapters/http/session";
import { createChatSession, listChatSessions } from "@/adapters/persistence/chat-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { userId } = await requireUser();
    return Response.json(
      { sessions: await listChatSessions(userId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireWrite(request);
    const parsed = z
      .object({ title: z.string().trim().max(80).optional() })
      .strict()
      .safeParse(await jsonBody(request, 2000));
    if (!parsed.success)
      throw new AppError("INVALID_INPUT", "会话标题无效。", 422);
    const session = await createChatSession(userId, parsed.data.title);
    return Response.json(
      { session },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
