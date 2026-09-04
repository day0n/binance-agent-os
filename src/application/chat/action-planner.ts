import Decimal from "decimal.js";
import { actionDraftSchema, type ActionDraft, type ActionKind } from "@/domain/actions";
import { HARD_ACTION_MAX_USDT } from "@/platform/config";
import { AppError } from "@/domain/errors";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_DOWN });

const required: Record<ActionKind, (keyof ActionDraft)[]> = {
  "spot.marketOrder": ["symbol", "side"],
  "spot.limitOrder": ["symbol", "side", "quantity", "price"],
  "spot.cancelOrder": ["symbol"],
  "wallet.internalTransfer": ["transferType", "amount"],
};

export function parseActionDraft(value: unknown): ActionDraft {
  const parsed = actionDraftSchema.safeParse(value);
  if (!parsed.success)
    throw new AppError("ACTION_DRAFT_INVALID", "动作草案格式无效。", 422);
  return parsed.data;
}

export function missingActionFields(draft: ActionDraft) {
  const fields = required[draft.kind].filter((field) => !draft[field]);
  if (draft.kind === "spot.marketOrder" && !draft.quoteOrderQty && !draft.quantity)
    fields.push("quoteOrderQty");
  if (draft.kind === "spot.cancelOrder" && !draft.orderId && !draft.origClientOrderId)
    fields.push("orderId");
  if (draft.kind === "wallet.internalTransfer" && draft.asset && draft.asset !== "USDT")
    fields.push("asset");
  return [...new Set(fields.map(String))];
}

export function estimatedNotional(draft: ActionDraft) {
  if (draft.kind === "spot.cancelOrder") return new Decimal(0);
  if (draft.quoteOrderQty) return new Decimal(draft.quoteOrderQty);
  if (draft.amount) return new Decimal(draft.amount);
  if (draft.quantity && draft.price)
    return new Decimal(draft.quantity).times(draft.price);
  return null;
}

export function assertDraftLimits(draft: ActionDraft, maxUsdt = HARD_ACTION_MAX_USDT) {
  const missing = missingActionFields(draft);
  if (missing.length)
    throw new AppError(
      "ACTION_INCOMPLETE",
      `还缺少：${missing.join("、")}。不能猜测交易参数。`,
      422,
    );
  if (draft.kind === "wallet.internalTransfer" && draft.asset !== "USDT")
    throw new AppError("ACTION_FORBIDDEN", "内部划转仅允许 USDT。", 422);
  const notional = estimatedNotional(draft);
  if (!notional)
    throw new AppError("ACTION_INCOMPLETE", "无法在缺少数量或价格时估价。", 422);
  if (draft.kind !== "spot.cancelOrder" && notional.gt(maxUsdt))
    throw new AppError(
      "ACTION_LIMIT",
      `单笔不超过 ${maxUsdt} USDT 等值。`,
      422,
    );
  if (notional.lte(0) && draft.kind !== "spot.cancelOrder")
    throw new AppError("ACTION_LIMIT", "金额必须大于 0。", 422);
  return notional.toFixed(8);
}
