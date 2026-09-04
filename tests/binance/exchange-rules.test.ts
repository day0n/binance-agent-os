import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  assertLotAndNotional,
  parseSymbolFilters,
  roundToStep,
} from "@/application/finance/exchange-rules";
import {
  assertMarketDrift,
  assertOrderPolicy,
} from "@/application/finance/action-policy";

const info = {
  symbols: [
    {
      symbol: "BTCUSDT",
      filters: [
        { filterType: "PRICE_FILTER", tickSize: "0.01" },
        { filterType: "LOT_SIZE", stepSize: "0.00001", minQty: "0.00001", maxQty: "1000" },
        { filterType: "NOTIONAL", minNotional: "5" },
        { filterType: "MARKET_LOT_SIZE", stepSize: "0.00001" },
      ],
    },
  ],
};

describe("exchange filters and action policy", () => {
  it("rounds by LOT_SIZE and rejects oversized notionals", () => {
    const filters = parseSymbolFilters(info, "BTCUSDT");
    expect(roundToStep(new Decimal("0.000019"), filters.stepSize).toString()).toBe(
      "0.00001",
    );
    const ok = assertLotAndNotional(
      filters,
      new Decimal("0.001"),
      new Decimal("50000"),
      false,
    );
    expect(ok.notional.toString()).toBe("50");
    expect(() =>
      assertOrderPolicy(
        {
          kind: "spot.marketOrder",
          side: "BUY",
          symbol: "BTCUSDT",
          quoteOrderQty: "5.01",
          missingFields: [],
        },
        filters,
        undefined,
        5,
      ),
    ).toThrow(/5/);
    expect(
      assertOrderPolicy(
        {
          kind: "spot.marketOrder",
          side: "BUY",
          symbol: "BTCUSDT",
          quoteOrderQty: "5",
          missingFields: [],
        },
        filters,
        undefined,
        5,
      ),
    ).toBe("5.00000000");
  });
  it("invalidates market sells when bid drifts more than 1%", () => {
    expect(() => assertMarketDrift("spot.marketOrder", "100", "98.9")).toThrow(
      /漂移/,
    );
    expect(() => assertMarketDrift("spot.marketOrder", "100", "99.2")).not.toThrow();
  });
});
