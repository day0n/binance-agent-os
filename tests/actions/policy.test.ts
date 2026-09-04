import { describe, expect, it } from "vitest";
import {
  assertMarketDrift,
  assertOrderPolicy,
  assertTransfer,
  quotaForKind,
} from "@/application/finance/action-policy";
import {
  classifyExecutorHttp,
  hashProposal,
  inferEnvironment,
  newClientOrderId,
  proposalMatches,
} from "@/application/actions/proposal";
import { nextReservedUsdt, nextSettledLedger } from "@/application/finance/daily-quota";
import { proposalTtlMs } from "@/domain/actions";
import type { ActionProposalPreview } from "@/domain/actions";

const proposal = (extra: Partial<ActionProposalPreview> = {}): ActionProposalPreview => ({
  environment: "spot_testnet",
  apiKeyFingerprint: "abc123",
  kind: "spot.marketOrder",
  symbol: "BTCUSDT",
  side: "BUY",
  orderType: "MARKET",
  quoteOrderQty: "5",
  estimatedNotionalUsdt: "5.00000000",
  feeAssumption: "fee",
  actionQuotaUsdt: "5.00000000",
  dailyUsedUsdt: "0",
  dailyReservedUsdt: "5.00000000",
  dailyLimitUsdt: "20",
  expiresAt: "2026-01-01T00:01:00.000Z",
  irreversibleWarning: "不可撤销",
  ...extra,
});

describe("action policy and proposal integrity", () => {
  it("caps market buys, limit notionals, and USDT transfers at 5", () => {
    expect(
      assertOrderPolicy(
        {
          kind: "spot.marketOrder",
          side: "BUY",
          quoteOrderQty: "5",
          missingFields: [],
        },
        undefined,
        undefined,
        5,
      ),
    ).toBe("5.00000000");
    expect(() =>
      assertOrderPolicy(
        {
          kind: "spot.marketOrder",
          side: "BUY",
          quoteOrderQty: "5.01",
          missingFields: [],
        },
        undefined,
        undefined,
        5,
      ),
    ).toThrow(/5/);
    expect(() =>
      assertOrderPolicy(
        {
          kind: "spot.limitOrder",
          quantity: "1",
          price: "6",
          missingFields: [],
        },
        undefined,
        undefined,
        5,
      ),
    ).toThrow(/5/);
    expect(() =>
      assertTransfer({
        kind: "wallet.internalTransfer",
        asset: "BTC" as "USDT",
        transferType: "MAIN_FUNDING",
        missingFields: [],
      }),
    ).toThrow(/USDT/);
    expect(quotaForKind("spot.cancelOrder", "5")).toBe("0");
  });
  it("expires a market sell when live bid drifts more than 1%", () => {
    expect(() => assertMarketDrift("spot.marketOrder", "100", "98.9")).toThrow(
      /1%/,
    );
    expect(() => assertMarketDrift("spot.marketOrder", "100", "99.2")).not.toThrow();
  });
  it("rejects a modified or replayed proposal hash", () => {
    const original = proposal();
    const hash = hashProposal(original);
    expect(proposalMatches(original, hash)).toBe(true);
    expect(proposalMatches(proposal({ quoteOrderQty: "4.9" }), hash)).toBe(false);
    expect(proposalTtlMs("spot.marketOrder")).toBe(60_000);
    expect(proposalTtlMs("spot.limitOrder")).toBe(5 * 60_000);
    expect(proposalTtlMs("wallet.internalTransfer")).toBe(2 * 60_000);
  });
  it("keeps daily reserve within 20 USDT under concurrent additions", () => {
    let reserved = "0.00000000";
    const used = "10.00000000";
    reserved = nextReservedUsdt(used, reserved, "5", "20");
    reserved = nextReservedUsdt(used, reserved, "5", "20");
    expect(reserved).toBe("10.00000000");
    expect(() => nextReservedUsdt(used, reserved, "0.01", "20")).toThrow(/自然日/);
    expect(nextSettledLedger(used, reserved, "5", false).reservedUsdt).toBe(
      "5.00000000",
    );
    expect(nextSettledLedger(used, reserved, "5", true).usedUsdt).toBe(
      "15.00000000",
    );
  });
  it("classifies transfer timeouts as uncertain and never as auto-retry success", () => {
    expect(classifyExecutorHttp(202, { error: "uncertain" })).toBe("uncertain");
    expect(classifyExecutorHttp(200, {})).toBe("succeeded");
    expect(classifyExecutorHttp(502, { error: "failed" })).toBe("failed");
    expect(inferEnvironment("实盘划转 1 USDT")).toBe("production");
    expect(newClientOrderId("11111111-2222-4333-8444-555555555555").startsWith("bao")).toBe(
      true,
    );
  });
});
