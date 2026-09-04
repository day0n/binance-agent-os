import { getRun as getWorkflow } from "workflow/api";
import { getRun, terminateRun } from "@/adapters/persistence/store";
import { requireWrite, apiError } from "@/adapters/http/session";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireWrite(request);
    const run = await getRun((await params).id, userId);
    await terminateRun(run._id, "cancelled");
    const current = await getRun(run._id, run.ownerId);
    if (current.status === "cancelled" && run.workflowId)
      await getWorkflow(run.workflowId)
        .cancel()
        .catch(() => undefined);
    return Response.json(
      { status: current.status },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
