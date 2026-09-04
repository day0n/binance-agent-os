import { apiError, requireUser } from "@/adapters/http/session";
import { listChatMessages } from "@/adapters/persistence/chat-store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireUser();
    const messages = await listChatMessages((await params).id, userId);
    return Response.json(
      { messages },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
