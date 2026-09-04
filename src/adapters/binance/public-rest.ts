import { AppError } from "@/domain/errors";

export const BINANCE_PUBLIC_REST = "https://api.binance.com";
export const BINANCE_PUBLIC_MARKET_DATA_REST = "https://data-api.binance.vision";
export const BINANCE_SPOT_TESTNET_REST = "https://testnet.binance.vision";

export const BINANCE_PUBLIC_REST_HOSTS = [
  BINANCE_PUBLIC_REST,
  BINANCE_PUBLIC_MARKET_DATA_REST,
] as const;

const allowed = new Set([
  "/api/v3/time",
  "/api/v3/exchangeInfo",
  "/api/v3/ticker/price",
  "/api/v3/ticker/bookTicker",
  "/api/v3/klines",
  "/api/v3/depth",
]);

function isRetryableStatus(status: number) {
  return status === 403 || status === 451 || status === 502 || status === 503;
}

export async function binancePublicGet(
  path: string,
  query: Record<string, string | number | undefined> = {},
  base?: string,
) {
  if (!allowed.has(path))
    throw new AppError("ENDPOINT_FORBIDDEN", "公共行情路径不在允许列表。", 403);
  const hosts = base ? [base] : [...BINANCE_PUBLIC_REST_HOSTS];
  let lastFailure: AppError | undefined;
  for (const [index, host] of hosts.entries()) {
    const url = new URL(path, host);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent": "binance-agent-os/0.1",
        },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      lastFailure = new AppError(
        "BINANCE_UNAVAILABLE",
        "币安公共 REST 暂时不可用，未使用模拟数据。",
        502,
        true,
      );
      if (index < hosts.length - 1) continue;
      throw lastFailure;
    }
    if (response.status === 429)
      throw new AppError("BINANCE_RATE_LIMIT", "币安接口限流，请稍后重试。", 429, true);
    if (!response.ok) {
      lastFailure = new AppError(
        "BINANCE_UNAVAILABLE",
        "币安公共 REST 返回失败，未使用模拟数据。",
        502,
        true,
      );
      if (isRetryableStatus(response.status) && index < hosts.length - 1)
        continue;
      throw lastFailure;
    }
    const text = await response.text();
    if (text.length > 2_000_000)
      throw new AppError("BINANCE_DATA_TOO_LARGE", "币安数据超出单次安全上限。", 502);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new AppError("DATA_INVALID", "币安公共 REST 未返回可验证 JSON。", 502);
    }
  }
  throw (
    lastFailure ??
    new AppError(
      "BINANCE_UNAVAILABLE",
      "币安公共 REST 返回失败，未使用模拟数据。",
      502,
      true,
    )
  );
}

export async function fetchPublicKlines(values: Record<string, string | number>) {
  return binancePublicGet("/api/v3/klines", {
    symbol: values.symbol,
    interval: values.interval,
    startTime: values.startTime,
    endTime: values.endTime,
    limit: values.limit ?? 1000,
  });
}

export async function fetchPublicPrices() {
  return binancePublicGet("/api/v3/ticker/price");
}

export async function fetchBookTicker(symbol: string) {
  return binancePublicGet("/api/v3/ticker/bookTicker", { symbol });
}

export async function fetchDepth(symbol: string, limit = 100) {
  return binancePublicGet("/api/v3/depth", { symbol, limit });
}

export async function fetchExchangeInfo(symbol?: string) {
  return binancePublicGet(
    "/api/v3/exchangeInfo",
    symbol ? { symbol } : {},
  );
}
