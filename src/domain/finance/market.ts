import { AppError } from "../errors";
import type { Candle } from "../contracts";

export const INTERVAL_MS: Record<string, number> = {
  "1h": 3600000,
  "4h": 14400000,
  "1d": 86400000,
};
export function numeric(value: unknown): number {
  if (
    (typeof value !== "string" && typeof value !== "number") ||
    value === "" ||
    !Number.isFinite(Number(value))
  )
    throw new AppError("DATA_INVALID", "行情包含无效数值。", 502);
  return Number(value);
}
export function parseCandles(
  raw: unknown,
  interval: string,
  asOf: number,
): Candle[] {
  if (!Array.isArray(raw) || raw.length > 10000)
    throw new AppError("DATA_INVALID", "K 线响应格式或数量无效。", 502);
  const bars = raw
    .map((item) => {
      let c: Candle;
      if (Array.isArray(item)) {
        if (item.length < 7)
          throw new AppError("DATA_INVALID", "K 线字段不完整。", 502);
        c = {
          openTime: numeric(item[0]),
          open: numeric(item[1]),
          high: numeric(item[2]),
          low: numeric(item[3]),
          close: numeric(item[4]),
          volume: numeric(item[5]),
          closeTime: numeric(item[6]),
        };
      } else if (item && typeof item === "object") {
        const r = item as Record<string, unknown>;
        c = {
          openTime: numeric(r.openTime),
          closeTime: numeric(r.closeTime),
          open: numeric(r.open),
          high: numeric(r.high),
          low: numeric(r.low),
          close: numeric(r.close),
          volume: numeric(r.volume),
        };
      } else throw new AppError("DATA_INVALID", "K 线数据无效。", 502);
      if (
        c.openTime <= 0 ||
        c.closeTime < c.openTime ||
        c.closeTime >= c.openTime + INTERVAL_MS[interval] ||
        c.low <= 0 ||
        c.high < Math.max(c.open, c.close, c.low) ||
        c.low > Math.min(c.open, c.close) ||
        c.volume < 0
      )
        throw new AppError("DATA_INVALID", "K 线价格或时间区间不一致。", 502);
      return c;
    })
    .filter((c) => c.closeTime <= asOf)
    .sort((a, b) => a.openTime - b.openTime);
  if (new Set(bars.map((c) => c.openTime)).size !== bars.length)
    throw new AppError("DATA_DUPLICATE", "K 线包含重复时间点。", 502);
  return bars;
}
export function candleWarnings(
  candles: Candle[],
  interval: string,
  asOf: number,
) {
  const warnings: string[] = [];
  const step = INTERVAL_MS[interval];
  if (!candles.length) return ["没有已收盘的 K 线。"];
  if (asOf - candles.at(-1)!.closeTime > 2 * step)
    warnings.push("行情时间落后，不能代表当前市场。");
  if (
    candles.some(
      (c, i) => i > 0 && c.openTime - candles[i - 1].openTime !== step,
    )
  )
    warnings.push("K 线时间序列存在缺口，未进行插值补造。");
  return warnings;
}
export function sma(values: number[], period: number): (number | null)[] {
  let sum = 0;
  return values.map((v, i) => {
    sum += v;
    if (i >= period) sum -= values[i - period];
    return i + 1 >= period ? sum / period : null;
  });
}
export function rsi(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = values.map(() => null);
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    if (i <= period) {
      gain += Math.max(0, d) / period;
      loss += Math.max(0, -d) / period;
    } else {
      gain = (gain * (period - 1) + Math.max(0, d)) / period;
      loss = (loss * (period - 1) + Math.max(0, -d)) / period;
    }
    if (i >= period)
      result[i] =
        gain === 0 && loss === 0
          ? 50
          : loss === 0
            ? 100
            : 100 - 100 / (1 + gain / loss);
  }
  return result;
}
export function stats(values: number[]) {
  if (!values.length) return { mean: 0, std: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    mean,
    std: Math.sqrt(
      values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length,
    ),
  };
}
export function marketMetrics(candles: Candle[], interval: string) {
  if (candles.length < 31)
    throw new AppError(
      "INSUFFICIENT_DATA",
      "至少需要 31 根已收盘 K 线进行市场分析。",
      422,
    );
  const prices = candles.map((c) => c.close);
  const last = prices.at(-1)!;
  const returns = prices.slice(1).map((p, i) => p / prices[i] - 1);
  const { std } = stats(returns);
  return {
    lastClose: last,
    sma10: sma(prices, 10).at(-1) ?? null,
    sma30: sma(prices, 30).at(-1) ?? null,
    rsi14: rsi(prices, 14).at(-1) ?? null,
    intervalReturn: last / prices[0] - 1,
    annualizedVolatility:
      std * Math.sqrt((365 * 86400000) / INTERVAL_MS[interval]),
    lastVolume: candles.at(-1)!.volume,
    bars: candles.length,
    interval,
  };
}
