import Decimal from "decimal.js";
import { AppError } from "@/domain/errors";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_DOWN });

export type SymbolFilters = {
  symbol: string;
  tickSize: Decimal;
  stepSize: Decimal;
  minQty: Decimal;
  maxQty: Decimal;
  minNotional: Decimal;
  marketStepSize?: Decimal;
};

function filterValue(
  filters: Array<Record<string, string>>,
  type: string,
  key: string,
) {
  const found = filters.find((filter) => filter.filterType === type);
  if (!found?.[key])
    throw new AppError("EXCHANGE_FILTER", `缺少 ${type}.${key}。`, 502);
  return new Decimal(found[key]);
}

export function parseSymbolFilters(info: unknown, symbol: string): SymbolFilters {
  if (!info || typeof info !== "object")
    throw new AppError("EXCHANGE_FILTER", "exchangeInfo 无效。", 502);
  const symbols = (info as { symbols?: unknown }).symbols;
  const row = Array.isArray(symbols)
    ? symbols.find(
        (item) =>
          item &&
          typeof item === "object" &&
          (item as { symbol?: string }).symbol === symbol,
      )
    : undefined;
  if (!row || typeof row !== "object")
    throw new AppError("EXCHANGE_FILTER", `找不到 ${symbol} 交易规则。`, 422);
  const filters = (row as { filters?: Array<Record<string, string>> }).filters;
  if (!Array.isArray(filters))
    throw new AppError("EXCHANGE_FILTER", "交易规则缺少 filters。", 502);
  const tickSize = filterValue(filters, "PRICE_FILTER", "tickSize");
  const stepSize = filterValue(filters, "LOT_SIZE", "stepSize");
  const minQty = filterValue(filters, "LOT_SIZE", "minQty");
  const maxQty = filterValue(filters, "LOT_SIZE", "maxQty");
  const minNotional = filters.find((filter) =>
    ["MIN_NOTIONAL", "NOTIONAL"].includes(filter.filterType),
  );
  const notional = new Decimal(
    minNotional?.minNotional ?? minNotional?.notional ?? "0",
  );
  const market = filters.find((filter) => filter.filterType === "MARKET_LOT_SIZE");
  return {
    symbol,
    tickSize,
    stepSize,
    minQty,
    maxQty,
    minNotional: notional,
    marketStepSize: market?.stepSize ? new Decimal(market.stepSize) : undefined,
  };
}

export function roundToStep(value: Decimal, step: Decimal) {
  if (step.lte(0)) throw new AppError("EXCHANGE_FILTER", "步进无效。", 502);
  return value.div(step).toDecimalPlaces(0, Decimal.ROUND_DOWN).mul(step);
}

export function assertLotAndNotional(
  filters: SymbolFilters,
  quantity: Decimal,
  price: Decimal,
  market: boolean,
) {
  const step = market && filters.marketStepSize ? filters.marketStepSize : filters.stepSize;
  const qty = roundToStep(quantity, step);
  if (qty.lt(filters.minQty) || qty.gt(filters.maxQty))
    throw new AppError("EXCHANGE_FILTER", "数量不满足 LOT_SIZE。", 422);
  const notional = qty.mul(price);
  if (notional.lt(filters.minNotional))
    throw new AppError("EXCHANGE_FILTER", "名义金额低于 MIN_NOTIONAL。", 422);
  return { quantity: qty, notional };
}

export function assertPriceFilter(filters: SymbolFilters, price: Decimal) {
  const rounded = roundToStep(price, filters.tickSize);
  if (!rounded.eq(price) && !roundToStep(price, filters.tickSize).eq(rounded))
    return rounded;
  return rounded;
}
