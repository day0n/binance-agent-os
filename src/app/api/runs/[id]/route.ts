import {
  getRun,
  getArtifact,
  terminateRun,
} from "@/adapters/persistence/store";
import { terminalStatuses, type AnalysisReport } from "@/domain/contracts";
import { AppError } from "@/domain/errors";
import { requireUser, apiError } from "@/adapters/http/session";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId: user } = await requireUser();
    let run = await getRun((await params).id, user);
    if (
      !terminalStatuses.includes(run.status) &&
      Date.now() > Date.parse(run.deadlineAt)
    ) {
      await terminateRun(
        run._id,
        "failed",
        new AppError("RUN_TIMEOUT", "任务已超出时间预算。", 408),
      );
      run = await getRun(run._id, user);
    }
    const report =
      run.status === "completed" && run.reportId
        ? await getArtifact<AnalysisReport>(run.reportId, user)
        : undefined;
    return Response.json(
      {
        run: {
          id: run._id,
          sessionId: run.sessionId,
          input: run.input,
          status: run.status,
          createdAt: run.createdAt,
          finishedAt: run.finishedAt,
          modelCalls: run.modelCalls,
          toolCalls: run.toolCalls,
          tokens: run.tokens,
          error: run.error,
        },
        report,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
