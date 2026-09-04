import { describe, expect, it } from "vitest";
import {
  parseCandles,
  rsi,
  candleWarnings,
  INTERVAL_MS,
  marketMetrics,
} from "@/domain/finance/market";
import {
  applyLimits,
  assessRisk,
  normalizePortfolio,
} from "@/domain/finance/risk";
import { runBacktest } from "@/domain/finance/backtest";
import { composeMarketResearchFinding } from "@/domain/finance/research-brief";
import { backtestConfigSchema, type MarketSnapshot } from "@/domain/contracts";

const step = INTERVAL_MS["1d"];
const base = Date.UTC(2025, 0, 1);
function snapshot(count = 100): MarketSnapshot {
  return {
    symbol: "BTCUSDT",
    interval: "1d",
    asOf: new Date(base + count * step).toISOString(),
    evidenceId: "test-source",
    candles: Array.from({ length: count }, (_, i) => {
      const price = 100 + 20 * Math.sin(i / 5) + i / 10;
      return {
        openTime: base + i * step,
        closeTime: base + (i + 1) * step - 1,
        open: price,
        high: price + 2,
        low: price - 2,
        close: price + 1,
        volume: 1000,
      };
    }),
  };
}
describe("financial data integrity", () => {
  it("excludes incomplete/future candles", () => {
    const s = snapshot(5);
    expect(parseCandles(s.candles, "1d", base + 3 * step)).toHaveLength(3);
  });
  it("rejects duplicate bars and invalid OHLC", () => {
    const s = snapshot(5);
    expect(() =>
      parseCandles([...s.candles, s.candles[0]], "1d", base + 6 * step),
    ).toThrow();
    expect(() =>
      parseCandles([{ ...s.candles[0], high: 1 }], "1d", base + step),
    ).toThrow();
  });
  it("detects gaps and stale data instead of fabricating candles", () => {
    const s = snapshot(5);
    s.candles.splice(2, 1);
    expect(candleWarnings(s.candles, "1d", base + 10 * step)).toHaveLength(2);
  });
  it("computes a flat RSI as 50 and rising RSI as 100", () => {
    expect(rsi(Array(30).fill(10), 14).at(-1)).toBe(50);
    expect(
      rsi(
        Array.from({ length: 30 }, (_, i) => i + 1),
        14,
      ).at(-1),
    ).toBe(100);
  });
});
describe("risk is deterministic and cannot be overridden", () => {
  const policy = { maxPositionPct: 0.2, maxGrossExposure: 0.3 };
  it("caps then scales; removed capital stays cash", () => {
    const result = applyLimits({ BTC: 0.8, ETH: 0.3 }, policy);
    expect(result.weights.BTC).toBeCloseTo(0.15);
    expect(result.weights.ETH).toBeCloseTo(0.15);
    expect(applyLimits(result.weights, policy).weights).toEqual(result.weights);
  });
  it("rejects shorts and non-finite weights", () => {
    expect(() => applyLimits({ BTC: -0.2 }, policy)).toThrow();
    expect(() => applyLimits({ BTC: Infinity }, policy)).toThrow();
  });
  it("never treats missing prices as zero exposure", () => {
    const p = normalizePortfolio(
      [{ asset: "BTC", free: "1", locked: "0" }],
      [],
      "2025-01-01",
      "e1",
    );
    expect(p.unpricedAssets).toEqual(["BTC"]);
    expect(p.holdings[0].valueUsdt).toBeNull();
    expect(assessRisk(["e1"], [], p, policy).allowed).toBe(false);
  });
  it("does not create allocation quantities without explicit limits", () => {
    const r = assessRisk([], []);
    expect(r.policyConfigured).toBe(false);
    expect(r.allowed).toBe(false);
    expect(r.limitedWeights).toBeUndefined();
  });
});
describe("backtesting", () => {
  for (const strategy of ["sma_cross", "rsi_reversion", "buy_hold"] as const) {
    it(`${strategy}: reproducible, next-bar execution, never future-informed`, () => {
      const s = snapshot();
      const c = backtestConfigSchema.parse({ strategy });
      const result = runBacktest(s, c, "e");
      expect(result).toEqual(runBacktest(s, c, "e"));
      expect(result.equity).toHaveLength(100);
      expect(result.trades.every((t) => t.signalTime < t.time)).toBe(true);
      const partial = {
        ...s,
        candles: s.candles.slice(0, 60),
        asOf: new Date(base + 60 * step).toISOString(),
      };
      expect(runBacktest(partial, c, "e").equity).toEqual(
        result.equity.slice(0, 60),
      );
    });
  }
  it("fees and slippage lower the same buy/hold result", () => {
    const s = snapshot();
    const free = runBacktest(
      s,
      backtestConfigSchema.parse({
        strategy: "buy_hold",
        feeBps: 0,
        slippageBps: 0,
      }),
      "e",
    );
    const paid = runBacktest(
      s,
      backtestConfigSchema.parse({
        strategy: "buy_hold",
        feeBps: 20,
        slippageBps: 20,
      }),
      "e",
    );
    expect(paid.metrics.finalEquity).toBeLessThan(free.metrics.finalEquity);
    expect(paid.metrics.totalFees).toBeGreaterThan(0);
  });
  it("rejects insufficient data and gaps", () => {
    const c = backtestConfigSchema.parse({});
    expect(() => runBacktest(snapshot(5), c, "e")).toThrow();
    const s = snapshot();
    s.candles.splice(10, 1);
    expect(() => runBacktest(s, c, "e")).toThrow();
  });
});
describe("deterministic research brief", () => {
  it("cites only provided evidence and does not invent prices", () => {
    const s = snapshot(40);
    const metrics = marketMetrics(s.candles, "1d");
    const finding = composeMarketResearchFinding({
      symbol: "BTCUSDT",
      interval: "1d",
      lookbackDays: 30,
      asOf: s.asOf,
      metrics,
      candles: s.candles,
      evidenceIds: ["market", "metrics"],
    });
    expect(
      finding.facts.every((fact) =>
        fact.evidenceIds.every((id) => id === "market" || id === "metrics"),
      ),
    ).toBe(true);
    expect(finding.summary).toContain("已收盘");
    expect(finding.facts.map((fact) => fact.claim).join("\n")).toContain(
      metrics.lastClose.toFixed(2),
    );
    expect(finding.limitations.join("")).toMatch(/不是预测/);
  });
});
