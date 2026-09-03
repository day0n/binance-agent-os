import Decimal from "decimal.js";
import { AppError } from "../errors";
import type {
  BacktestConfig,
  BacktestResult,
  MarketSnapshot,
} from "../contracts";
import { backtestConfigSchema } from "../contracts";
import { INTERVAL_MS, candleWarnings, rsi, sma, stats } from "./market";

export function runBacktest(
  snapshot: MarketSnapshot,
  input: BacktestConfig,
  evidenceId: string,
): BacktestResult {
  const config = backtestConfigSchema.parse(input);
  const bars = snapshot.candles;
  const required =
    config.strategy === "buy_hold"
      ? 2
      : config.strategy === "sma_cross"
        ? config.slowPeriod + 2
        : config.rsiPeriod + 2;
  if (bars.length < required)
    throw new AppError(
      "INSUFFICIENT_DATA",
      `策略至少需要 ${required} 根已收盘 K 线。`,
      422,
    );
  if (
    candleWarnings(bars, snapshot.interval, Date.parse(snapshot.asOf)).some(
      (s) => s.includes("缺口"),
    )
  )
    throw new AppError(
      "BACKTEST_DATA_GAP",
      "回测数据不连续，无法给出可信模拟结果。",
      422,
    );
  const close = bars.map((c) => c.close);
  const fast = sma(close, config.fastPeriod);
  const slow = sma(close, config.slowPeriod);
  const strength = rsi(close, config.rsiPeriod);
  const fee = new Decimal(config.feeBps).div(10000);
  const slip = new Decimal(config.slippageBps).div(10000);
  let cash = new Decimal(config.initialCapital);
  let qty = new Decimal(0);
  let fees = new Decimal(0);
  const benchmarkPrice = new Decimal(bars[1].open).mul(slip.plus(1));
  const benchmarkQty = cash.div(benchmarkPrice.mul(fee.plus(1)));
  const trades: BacktestResult["trades"] = [];
  const equity: BacktestResult["equity"] = [];
  let peak = config.initialCapital;
  let maxDrawdown = 0;
  for (let i = 0; i < bars.length; i++) {
    const previous = i - 1;
    let target: "buy" | "sell" | null = null;
    // Only a CLOSED previous bar can create a signal. Execution is at NEXT open.
    if (i > 0) {
      if (config.strategy === "buy_hold" && i === 1) target = "buy";
      if (
        config.strategy === "sma_cross" &&
        previous > 0 &&
        slow[previous - 1] !== null &&
        slow[previous] !== null
      ) {
        if (
          fast[previous]! > slow[previous]! &&
          fast[previous - 1]! <= slow[previous - 1]!
        )
          target = "buy";
        if (
          fast[previous]! < slow[previous]! &&
          fast[previous - 1]! >= slow[previous - 1]!
        )
          target = "sell";
      }
      if (config.strategy === "rsi_reversion" && strength[previous] !== null) {
        if (strength[previous]! < config.rsiEntry) target = "buy";
        if (strength[previous]! > config.rsiExit) target = "sell";
      }
    }
    if (target === "buy" && qty.isZero()) {
      const price = new Decimal(bars[i].open).mul(slip.plus(1));
      qty = cash.div(price.mul(fee.plus(1)));
      const cost = qty.mul(price);
      const commission = cost.mul(fee);
      cash = cash.minus(cost).minus(commission);
      fees = fees.plus(commission);
      trades.push({
        time: bars[i].openTime,
        signalTime: bars[previous].closeTime,
        side: "buy",
        price: price.toNumber(),
        quantity: qty.toNumber(),
        fee: commission.toNumber(),
      });
    } else if (target === "sell" && qty.gt(0)) {
      const price = new Decimal(bars[i].open).mul(new Decimal(1).minus(slip));
      const proceeds = qty.mul(price);
      const commission = proceeds.mul(fee);
      cash = cash.plus(proceeds).minus(commission);
      fees = fees.plus(commission);
      trades.push({
        time: bars[i].openTime,
        signalTime: bars[previous].closeTime,
        side: "sell",
        price: price.toNumber(),
        quantity: qty.toNumber(),
        fee: commission.toNumber(),
      });
      qty = new Decimal(0);
    }
    const value = cash.plus(qty.mul(bars[i].close)).toNumber();
    peak = Math.max(peak, value);
    maxDrawdown = Math.max(maxDrawdown, (peak - value) / peak);
    equity.push({
      time: bars[i].closeTime,
      equity: value,
      benchmark:
        i === 0
          ? config.initialCapital
          : benchmarkQty.mul(bars[i].close).toNumber(),
    });
  }
  const returns = equity
    .slice(1)
    .map((e, i) => e.equity / equity[i].equity - 1);
  const { mean, std } = stats(returns);
  const annualFactor = (365 * 86400000) / INTERVAL_MS[snapshot.interval];
  const last = equity.at(-1)!;
  return {
    config,
    symbol: snapshot.symbol,
    interval: snapshot.interval,
    evidenceId,
    candleCount: bars.length,
    start: new Date(bars[0].openTime).toISOString(),
    end: new Date(bars.at(-1)!.closeTime).toISOString(),
    metrics: {
      totalReturn: last.equity / config.initialCapital - 1,
      benchmarkReturn: last.benchmark / config.initialCapital - 1,
      maxDrawdown,
      sharpe: std > 0 ? (mean / std) * Math.sqrt(annualFactor) : null,
      volatility: returns.length ? std * Math.sqrt(annualFactor) : null,
      trades: trades.length,
      finalEquity: last.equity,
      totalFees: fees.toNumber(),
    },
    trades,
    equity,
    assumptions: [
      "仅模拟现货做多；无杠杆、无融券、无真实订单。",
      "上一根已收盘 K 线生成信号，下一根开盘按指定滑点成交。",
      `每次成交手续费 ${config.feeBps} bps、滑点 ${config.slippageBps} bps；这是可调整的模拟假设，不是账户实际费率。`,
      "基准也在第二根 K 线开盘买入，计入相同买入费用和滑点。",
      "期末未平仓资产按最后收盘价估值，未虚构平仓交易；年化按加密资产 365 日计算，无风险利率假设为 0。",
      "当前实现不模拟订单簿容量、部分成交、资金费率或退市偏差。历史结果不预测未来表现。",
    ],
  };
}
