import { z } from "zod";

export const actionKindSchema = z.enum([
  "spot.marketOrder",
  "spot.limitOrder",
  "spot.cancelOrder",
  "wallet.internalTransfer",
]);
export type ActionKind = z.infer<typeof actionKindSchema>;

export const actionStatusSchema = z.enum([
  "awaiting_confirmation",
  "confirmed",
  "executing",
  "succeeded",
  "failed",
  "uncertain",
  "expired",
  "rejected",
]);
export type ActionStatus = z.infer<typeof actionStatusSchema>;

export const actionDraftSchema = z
  .object({
    kind: actionKindSchema,
    symbol: z
      .string()
      .regex(/^[A-Z0-9]{2,15}USDT$/)
      .optional(),
    side: z.enum(["BUY", "SELL"]).optional(),
    quantity: z.string().optional(),
    quoteOrderQty: z.string().optional(),
    price: z.string().optional(),
    orderId: z.string().optional(),
    origClientOrderId: z.string().optional(),
    transferType: z.enum(["MAIN_FUNDING", "FUNDING_MAIN"]).optional(),
    asset: z.literal("USDT").optional(),
    amount: z.string().optional(),
    missingFields: z.array(z.string().min(1).max(40)).max(12).default([]),
  })
  .strict();
export type ActionDraft = z.infer<typeof actionDraftSchema>;

export type ActionProposalPreview = {
  environment: "spot_testnet" | "production";
  apiKeyFingerprint: string;
  kind: ActionKind;
  symbol?: string;
  side?: "BUY" | "SELL";
  orderType?: "MARKET" | "LIMIT";
  timeInForce?: "GTC";
  quantity?: string;
  quoteOrderQty?: string;
  price?: string;
  estimatedNotionalUsdt: string;
  marketPrice?: string;
  marketPriceAt?: string;
  feeAssumption: string;
  availableBalance?: string;
  actionQuotaUsdt: string;
  dailyUsedUsdt: string;
  dailyReservedUsdt: string;
  dailyLimitUsdt: string;
  expiresAt: string;
  irreversibleWarning: string;
};

export type ActionRecord = {
  id: string;
  userId: string;
  sessionId: string;
  runId: string;
  kind: ActionKind;
  status: ActionStatus;
  draft: ActionDraft;
  proposal?: ActionProposalPreview;
  proposalHash?: string;
  clientOrderId?: string;
  environment?: "spot_testnet" | "production";
  connectionId?: string;
  reservedUsdt: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  result?: unknown;
};

export const actionConfirmBodySchema = z
  .object({
    proposalHash: z.string().regex(/^[a-f0-9]{64}$/),
    password: z.string().min(1).max(256),
  })
  .strict();

export function proposalTtlMs(kind: ActionKind) {
  if (kind === "spot.marketOrder") return 60_000;
  if (kind === "spot.limitOrder") return 5 * 60_000;
  return 2 * 60_000;
}

export const confirmationTtlMs = 2 * 60_000;
