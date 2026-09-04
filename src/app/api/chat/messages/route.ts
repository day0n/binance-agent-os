import { apiError, jsonBody, requireWrite } from "@/adapters/http/session";
import { sendChatMessage } from "@/application/chat/service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { userId } = await requireWrite(request);
    const result = await sendChatMessage(userId, await jsonBody(request));
    return Response.json(result, {
      status: 202,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
