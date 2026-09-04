import { FatalError } from "workflow";
import { AppError, publicError } from "@/domain/errors";
import { config } from "@/platform/config";
import {
  consumeConfirmation,
  casActionStatus,
  getAction,
  settleDailyQuota,
} from "@/adapters/persistence/action-store";
import { appendSessionEvent } from "@/adapters/persistence/chat-store";
import { executorExecute } from "@/adapters/binance/executor-client";
import { fetchBookTicker } from "@/adapters/binance/public-rest";
import { assertMarketDrift } from "@/application/finance/action-policy";
import {
  executorPayload,
  hashProposal,
} from "@/application/actions/proposal";

function fail(error: unknown): never {
  throw new FatalError(JSON.stringify(publicError(error)));
}

export async function executeConfirmedActionStep(actionId: string, userId: string) {
  "use step";
  try {
    let action = await getAction(actionId, userId);
    if (action.status === "succeeded" || action.status === "uncertain")
      return { actionId, status: action.status, result: action.result };
    if (action.status === "confirmed") {
      if (!action.proposal || !action.proposalHash)
        throw new AppError("ACTION_STATE", "缺少提案指纹。", 409);
      if (hashProposal(action.proposal) !== action.proposalHash)
        throw new AppError("PROPOSAL_MISMATCH", "提案已被修改。", 403);
      await consumeConfirmation(actionId, userId, action.proposalHash);
      action = await casActionStatus(actionId, userId, "confirmed", "executing");
    }
    if (action.status !== "executing")
      throw new AppError("ACTION_STATE", "动作尚未处于可执行状态。", 409);
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
    if (!c.EXECUTOR_URL || !action.connectionId)
      throw new AppError(
        "EXECUTOR_UNCONFIGURED",
        "执行器或交易连接尚未配置，不能伪造成交。",
        503,
      );
    if (
      action.kind === "spot.marketOrder" &&
      action.draft.side === "SELL" &&
      action.draft.symbol &&
      action.proposal?.marketPrice
    ) {
      const book = (await fetchBookTicker(action.draft.symbol)) as {
        bidPrice?: string;
      };
      if (!book.bidPrice)
        throw new AppError("ACTION_EXPIRED", "无法复核最新买一价。", 409);
      assertMarketDrift(action.kind, action.proposal.marketPrice, book.bidPrice);
    }
    const executed = await executorExecute({
      userId,
      actionId,
      proposalHash: action.proposalHash ?? "",
      kind: action.kind,
      environment: action.environment ?? "spot_testnet",
      connectionId: action.connectionId,
      payload: executorPayload(action.draft),
      clientOrderId: action.clientOrderId,
    });
    if (executed.status === "uncertain") {
      const uncertain = await casActionStatus(
        actionId,
        userId,
        "executing",
        "uncertain",
        { result: executed.data },
      );
      await appendSessionEvent(uncertain.sessionId, userId, "action.updated", {
        actionId,
        status: "uncertain",
      });
      return { actionId, status: "uncertain" as const, result: executed.data };
    }
    const succeeded = await casActionStatus(
      actionId,
      userId,
      "executing",
      "succeeded",
      { result: executed.data },
    );
    await settleDailyQuota(userId, action.reservedUsdt, true);
    await appendSessionEvent(succeeded.sessionId, userId, "action.updated", {
      actionId,
      status: "succeeded",
    });
    return { actionId, status: "succeeded" as const, result: executed.data };
  } catch (error) {
    try {
      const failed = await casActionStatus(
        actionId,
        userId,
        ["confirmed", "executing"],
        "failed",
        { result: publicError(error) },
      );
      if (failed.status === "failed")
        await settleDailyQuota(userId, failed.reservedUsdt, false);
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
