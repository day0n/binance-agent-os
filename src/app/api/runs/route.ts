import { start } from "workflow/api";
import { runInputSchema } from "@/domain/contracts";
import { AppError } from "@/domain/errors";
import { config, modelConfig } from "@/platform/config";
import {
  requireUser,
  requireWrite,
  jsonBody,
  apiError,
} from "@/adapters/http/session";
import { database } from "@/adapters/persistence/mongo";
import { rateLimit, withLease } from "@/adapters/persistence/redis";
import {
  bindWorkflow,
  claimDispatch,
  createRun,
  getRun,
  terminateRun,
  type RunRecord,
} from "@/adapters/persistence/store";
import { accessToken } from "@/adapters/binance/oauth";
import { researchWorkflow } from "@/workflows/research";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const { userId: id } = await requireWrite(request);
    const input = runInputSchema.safeParse(await jsonBody(request));
    if (!input.success)
      throw new AppError(
        "INVALID_INPUT",
        "请检查交易对、时间范围、风险限额和策略参数。",
        422,
      );
    modelConfig(input.data.provider);
    await accessToken(id);
    const result = await withLease(`create:${id}`, async () => {
      const { run } = await createRun(id, input.data, () =>
        rateLimit(
          `runs:${id}:${new Date().toISOString().slice(0, 10)}`,
          config().OWNER_DAILY_RUN_LIMIT,
          90000,
        ),
      );
      if (await claimDispatch(run._id)) {
        try {
          const workflow = await start(researchWorkflow, [run._id]);
          await bindWorkflow(run._id, workflow.runId);
        } catch {
          await terminateRun(
            run._id,
            "failed",
            new AppError(
              "DISPATCH_FAILED",
              "工作流启动未确认，请使用新的请求重试。",
              503,
              true,
            ),
          );
          throw new AppError(
            "DISPATCH_FAILED",
            "工作流启动未确认，请重新发起任务。",
            503,
            true,
          );
        }
      }
      const current = await getRun(run._id, id);
      return {
        runId: run._id,
        sessionId: run.sessionId,
        status: current.status,
      };
    });
    return Response.json(result, {
      status: 202,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function GET() {
  try {
    const { userId: id } = await requireUser();
    const runs = await (
      await database()
    )
      .collection<RunRecord>("runs")
      .find({ ownerId: id })
      .sort({ createdAt: -1 })
      .limit(50)
      .project({
        _id: 1,
        sessionId: 1,
        "input.prompt": 1,
        "input.mode": 1,
        "input.symbol": 1,
        status: 1,
        createdAt: 1,
      })
      .toArray();
    return Response.json(
      { runs },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
