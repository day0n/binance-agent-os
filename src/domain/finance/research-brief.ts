import type { AgentFinding, Candle } from "@/domain/contracts";
import { AppError } from "@/domain/errors";
import { INTERVAL_MS } from "./market";

export type MarketMetricsBrief = {
  lastClose: number;
  sma10: number | null;
  sma30: number | null;
  rsi14: number | null;
  intervalReturn: number;
  annualizedVolatility: number;
  lastVolume: number;
  bars: number;
  interval: string;
};

function fmtPct(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(2)}%`;
}

function fmtNum(value: number, digits = 2) {
  return value.toFixed(digits);
}

export function recentWindowSize(interval: string) {
  if (interval === "1h") return 24;
  if (interval === "4h") return 6;
  return 1;
}

export function windowStats(candles: Candle[], interval: string) {
  const size = recentWindowSize(interval);
  if (candles.length < 2)
    throw new AppError("INSUFFICIENT_DATA", "没有足够的已收盘 K 线。", 422);
  const window = candles.slice(-Math.max(size, 2));
  const first = window[0];
  const last = window.at(-1)!;
  const highs = window.map((c) => c.high);
  const lows = window.map((c) => c.low);
  const volume = window.reduce((sum, c) => sum + c.volume, 0);
  return {
    bars: window.length,
    requestedBars: size,
    start: new Date(first.openTime).toISOString(),
    end: new Date(last.closeTime).toISOString(),
    change: last.close / first.close - 1,
    range: (Math.max(...highs) - Math.min(...lows)) / first.close,
    volume,
    lastClose: last.close,
    hours:
      (last.closeTime - first.openTime + 1) / INTERVAL_MS[interval] *
      (INTERVAL_MS[interval] / 3600000),
  };
}

export function composeMarketResearchFinding(input: {
  symbol: string;
  interval: string;
  lookbackDays: number;
  asOf: string;
  metrics: MarketMetricsBrief;
  candles: Candle[];
  evidenceIds: string[];
}): Omit<AgentFinding, "role" | "model"> {
  const ids = input.evidenceIds.filter(Boolean);
  if (ids.length === 0)
    throw new AppError("INSUFFICIENT_DATA", "缺少可引用的行情证据。", 422);
  const recent = windowStats(input.candles, input.interval);
  const stance =
    recent.change > 0.005
      ? "bullish"
      : recent.change < -0.005
        ? "bearish"
        : "neutral";
  const windowLabel =
    input.interval === "1h"
      ? "近 24 根 1 小时已收盘 K 线"
      : input.interval === "4h"
        ? "近 6 根 4 小时已收盘 K 线"
        : "最近 1 根日线";
  const sma10 =
    input.metrics.sma10 === null ? "不足" : fmtNum(input.metrics.sma10);
  const sma30 =
    input.metrics.sma30 === null ? "不足" : fmtNum(input.metrics.sma30);
  const rsi14 =
    input.metrics.rsi14 === null ? "不足" : fmtNum(input.metrics.rsi14);
  return {
    summary: `${input.symbol} ${windowLabel}收盘涨跌 ${fmtPct(recent.change)}，窗口振幅 ${fmtPct(recent.range)}，成交量合计 ${fmtNum(recent.volume, 2)}。全样本 ${input.lookbackDays} 日年化波动 ${fmtPct(input.metrics.annualizedVolatility)}。以上数字由币安公共 REST 已收盘 K 线直接计算，不是模型编造。`,
    stance,
    facts: [
      {
        claim: `${windowLabel}价格由 ${fmtNum(input.candles.slice(-recent.bars)[0].close)} 变为 ${fmtNum(recent.lastClose)}，涨跌 ${fmtPct(recent.change)}。窗口 ${recent.start} 至 ${recent.end}。`,
        evidenceIds: ids.slice(0, 2),
      },
      {
        claim: `同一窗口最高/最低相对首根收盘振幅 ${fmtPct(recent.range)}，成交量合计 ${fmtNum(recent.volume, 2)}。`,
        evidenceIds: ids.slice(0, 2),
      },
      {
        claim: `${input.lookbackDays} 日样本（${input.metrics.bars} 根 ${input.interval}）最新收盘 ${fmtNum(input.metrics.lastClose)}，SMA10 ${sma10}，SMA30 ${sma30}，RSI14 ${rsi14}，区间收益 ${fmtPct(input.metrics.intervalReturn)}，年化波动 ${fmtPct(input.metrics.annualizedVolatility)}。数据时点 ${input.asOf}。`,
        evidenceIds: ids.slice(-2),
      },
    ],
    risks: [
      "已收盘 K 线不能代表未收盘波动或盘口流动性。",
      "本简报未包含新闻、资金费率、订单簿或账户持仓。",
    ],
    limitations: [
      "仅使用币安公共 REST 已收盘 K 线与确定性指标，没有模拟行情。",
      "涨跌描述只针对选定窗口，不是预测或交易建议。",
      "SMA/RSI 是历史描述，不能单独构成买卖理由。",
    ],
    nextSteps: [
      "在研究画布核验证据来源、哈希与 as-of 时间。",
      "若要下单或划转，必须使用动作卡并重新输入当前账号密码。",
    ],
  };
}
