import { getRun as getWorkflow } from "workflow/api";
import { apiError, requireWrite } from "@/adapters/http/session";
import {
  appendSessionEvent,
  finishChatRun,
  getChatSession,
} from "@/adapters/persistence/chat-store";
import { getChatRun } from "@/adapters/persistence/chat-store";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireWrite(request);
    const session = await getChatSession((await params).id, userId);
    if (!session.activeRunId)
      return Response.json(
        { status: "idle" },
        { headers: { "Cache-Control": "no-store" } },
      );
    const run = await getChatRun(session.activeRunId, userId);
    await finishChatRun(run.id, "cancelled");
    await appendSessionEvent(session.id, userId, "run.failed", {
      runId: run.id,
      cancelled: true,
    });
    if (run.workflowId)
      await getWorkflow(run.workflowId)
        .cancel()
        .catch(() => undefined);
    return Response.json(
      { status: "cancelled" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
