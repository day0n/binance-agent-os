import type { ActionDraft, ActionKind, ActionProposalPreview } from "@/domain/actions";
import type { BinanceEnvironment } from "@/domain/connections";
import { sha256 } from "@/platform/crypto";

export function hashProposal(proposal: ActionProposalPreview) {
  return sha256(proposal);
}

export function proposalMatches(proposal: ActionProposalPreview, expected: string) {
  return hashProposal(proposal) === expected;
}

export function newClientOrderId(actionId: string) {
  return `bao${actionId.replace(/-/g, "").slice(0, 33)}`;
}

export function inferEnvironment(content: string): BinanceEnvironment {
  return /production|生产|实盘/i.test(content) ? "production" : "spot_testnet";
}

export function executorPayload(draft: ActionDraft): Record<string, string> {
  const payload: Record<string, string> = {};
  if (draft.symbol) payload.symbol = draft.symbol;
  if (draft.side) payload.side = draft.side;
  if (draft.quantity) payload.quantity = draft.quantity;
  if (draft.quoteOrderQty) payload.quoteOrderQty = draft.quoteOrderQty;
  if (draft.price) payload.price = draft.price;
  if (draft.orderId) payload.orderId = draft.orderId;
  if (draft.origClientOrderId) payload.origClientOrderId = draft.origClientOrderId;
  if (draft.transferType) payload.type = draft.transferType;
  if (draft.asset) payload.asset = draft.asset;
  if (draft.amount) {
    payload.amount = draft.amount;
    payload.notional = draft.amount;
  }
  if (draft.quoteOrderQty) payload.notional = draft.quoteOrderQty;
  if (draft.quantity && draft.price)
    payload.notional = payload.notional ?? `${draft.quantity}*${draft.price}`;
  return payload;
}

export function eventsAfterSeq<T extends { seq: number }>(events: T[], after: number) {
  return events.filter((event) => event.seq > after).sort((a, b) => a.seq - b.seq);
}

export function classifyExecutorHttp(status: number, body: { error?: string }) {
  if (status === 202 || body.error === "uncertain") return "uncertain" as const;
  if (status >= 200 && status < 300) return "succeeded" as const;
  return "failed" as const;
}

export function orderTypeOf(kind: ActionKind) {
  if (kind === "spot.limitOrder") return "LIMIT" as const;
  if (kind === "spot.marketOrder") return "MARKET" as const;
  return undefined;
}
