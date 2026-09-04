import { FatalError } from "workflow";
import { AppError, publicError } from "@/domain/errors";
import { config } from "@/platform/config";
import { consumeConfirmation, casActionStatus, getAction } from "@/adapters/persistence/action-store";
import { appendSessionEvent } from "@/adapters/persistence/chat-store";

function fail(error: unknown): never {
  throw new FatalError(JSON.stringify(publicError(error)));
}

export async function executeConfirmedActionStep(actionId: string, userId: string) {
  "use step";
  try {
    const action = await getAction(actionId, userId);
    if (action.status !== "confirmed")
      throw new AppError("ACTION_STATE", "动作尚未处于可执行状态。", 409);
    if (!action.proposalHash)
      throw new AppError("ACTION_STATE", "缺少提案指纹。", 409);
    await consumeConfirmation(actionId, userId, action.proposalHash);
    await casActionStatus(actionId, userId, "confirmed", "executing");
    const c = config();
    if (!c.BINANCE_WRITES_ENABLED)
      throw new AppError(
        "WRITES_DISABLED",
        "写入开关未打开，未向交易所发送请求。",
        503,
      );
    if (action.environment === "production" && !c.BINANCE_PRODUCTION_WRITES_ENABLED)
      throw new AppError(
        "PRODUCTION_WRITES_DISABLED",
        "生产写入开关未打开，未向交易所发送请求。",
        503,
      );
    if (!c.EXECUTOR_URL)
      throw new AppError(
        "EXECUTOR_UNCONFIGURED",
        "执行器尚未配置，不能伪造成交。",
        503,
      );
    throw new AppError(
      "EXECUTOR_UNCONFIGURED",
      "执行器调用将在独立 Cloud Run 服务接通后启用。",
      503,
    );
  } catch (error) {
    try {
      const failed = await casActionStatus(
        actionId,
        userId,
        ["confirmed", "executing"],
        "failed",
        { result: publicError(error) },
      );
      await appendSessionEvent(failed.sessionId, userId, "action.updated", {
        actionId,
        status: "failed",
      }).catch(() => undefined);
    } catch {
      /* already terminal */
    }
    fail(error);
  }
}
