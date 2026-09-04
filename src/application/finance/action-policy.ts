import Decimal from "decimal.js";
import type { ActionDraft, ActionKind } from "@/domain/actions";
import { AppError } from "@/domain/errors";
import {
  HARD_ACTION_DAILY_MAX_USDT,
  HARD_ACTION_MAX_USDT,
} from "@/platform/config";
import {
  assertLotAndNotional,
  assertPriceFilter,
  type SymbolFilters,
} from "./exchange-rules";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_DOWN });

export const MARKET_DRIFT_LIMIT = new Decimal("0.01");

export function cappedLimits(maxUsdt: number, dailyUsdt: number) {
  return {
    maxUsdt: Math.min(maxUsdt, HARD_ACTION_MAX_USDT),
    dailyUsdt: Math.min(dailyUsdt, HARD_ACTION_DAILY_MAX_USDT),
  };
}

export function assertTransfer(draft: ActionDraft) {
  if (draft.kind !== "wallet.internalTransfer") return;
  if (draft.asset !== "USDT")
    throw new AppError("ACTION_FORBIDDEN", "内部划转仅允许 USDT。", 422);
  if (
    draft.transferType !== "MAIN_FUNDING" &&
    draft.transferType !== "FUNDING_MAIN"
  )
    throw new AppError("ACTION_FORBIDDEN", "只允许 Spot 与 Funding 互转。", 422);
}

export function assertOrderPolicy(
  draft: ActionDraft,
  filters: SymbolFilters | undefined,
  market: { bid?: string; ask?: string; at: string } | undefined,
  maxUsdt: number,
) {
  const cap = new Decimal(Math.min(maxUsdt, HARD_ACTION_MAX_USDT));
  if (draft.kind === "spot.limitOrder") {
    if (!draft.quantity || !draft.price)
      throw new AppError("ACTION_INCOMPLETE", "限价单需要数量和价格。", 422);
    const price = new Decimal(draft.price);
    const qty = new Decimal(draft.quantity);
    if (filters) {
      const aligned = assertPriceFilter(filters, price);
      const checked = assertLotAndNotional(filters, qty, aligned, false);
      if (checked.notional.gt(cap))
        throw new AppError("ACTION_LIMIT", `单笔不超过 ${cap.toFixed()} USDT。`, 422);
      return checked.notional.toFixed(8);
    }
    const notional = qty.mul(price);
    if (notional.gt(cap))
      throw new AppError("ACTION_LIMIT", `单笔不超过 ${cap.toFixed()} USDT。`, 422);
    return notional.toFixed(8);
  }
  if (draft.kind === "spot.marketOrder") {
    if (draft.side === "BUY") {
      if (!draft.quoteOrderQty)
        throw new AppError("ACTION_INCOMPLETE", "市价买单必须使用 quoteOrderQty。", 422);
      const quote = new Decimal(draft.quoteOrderQty);
      if (quote.gt(cap))
        throw new AppError("ACTION_LIMIT", `单笔不超过 ${cap.toFixed()} USDT。`, 422);
      return quote.toFixed(8);
    }
    if (!draft.quantity || !market?.bid)
      throw new AppError("ACTION_INCOMPLETE", "市价卖单需要数量和最新买一价。", 422);
    const estimate = new Decimal(draft.quantity).mul(market.bid);
    if (estimate.gt(cap))
      throw new AppError("ACTION_LIMIT", `单笔不超过 ${cap.toFixed()} USDT。`, 422);
    return estimate.toFixed(8);
  }
  if (draft.kind === "wallet.internalTransfer") {
    assertTransfer(draft);
    const amount = new Decimal(draft.amount ?? "0");
    if (amount.gt(cap))
      throw new AppError("ACTION_LIMIT", `单笔不超过 ${cap.toFixed()} USDT。`, 422);
    return amount.toFixed(8);
  }
  return "0";
}

export function assertMarketDrift(
  kind: ActionKind,
  proposed: string,
  currentBid: string,
) {
  if (kind !== "spot.marketOrder") return;
  const proposedPx = new Decimal(proposed);
  const live = new Decimal(currentBid);
  if (proposedPx.lte(0) || live.lte(0))
    throw new AppError("ACTION_EXPIRED", "行情无效，提案失效。", 409);
  const drift = proposedPx.minus(live).abs().div(proposedPx);
  if (drift.gt(MARKET_DRIFT_LIMIT))
    throw new AppError(
      "ACTION_EXPIRED",
      "市价估值漂移超过 1%，提案已失效。",
      409,
    );
}

export function quotaForKind(kind: ActionKind, notional: string) {
  return kind === "spot.cancelOrder" ? "0" : notional;
}
