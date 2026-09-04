import Decimal from "decimal.js";
import type { ExecutorActionKind } from "@binance-agent-os/executor-contracts";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_DOWN });

export const PUBLIC_PATHS = new Set([
  "GET /api/v3/time",
  "GET /api/v3/exchangeInfo",
  "GET /api/v3/ticker/price",
  "GET /api/v3/ticker/bookTicker",
  "GET /api/v3/klines",
  "GET /api/v3/depth",
]);

export const SIGNED_READ_PATHS = new Set([
  "GET /api/v3/account",
  "GET /api/v3/openOrders",
  "GET /api/v3/order",
  "GET /sapi/v1/account/apiRestrictions",
  "GET /sapi/v1/asset/get-funding-asset",
  "GET /sapi/v1/asset/transfer",
]);

export const WRITE_PATHS = new Set([
  "POST /api/v3/order",
  "DELETE /api/v3/order",
  "POST /sapi/v1/asset/transfer",
]);

export function allowedEndpoint(method: string, path: string) {
  const key = `${method.toUpperCase()} ${path}`;
  return (
    PUBLIC_PATHS.has(key) || SIGNED_READ_PATHS.has(key) || WRITE_PATHS.has(key)
  );
}

export function assertActionLimits(
  kind: ExecutorActionKind,
  notional: string,
  maxUsdt: number,
) {
  if (kind === "spot.cancelOrder") return "0";
  const value = new Decimal(notional);
  if (value.lte(0) || value.gt(maxUsdt))
    throw new Error("ACTION_LIMIT");
  return value.toFixed(8);
}

export function redact(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.replace(
    /(api[_-]?secret|secret|signature|password|authorization|cookie|private_key)("?\s*[:=]\s*"?)[^"&\s]+/gi,
    "$1[redacted]",
  );
}
