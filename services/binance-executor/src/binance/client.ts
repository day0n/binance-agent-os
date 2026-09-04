import { allowedEndpoint } from "../policy";
import { signedSearch } from "./signer";
import { executorConfig } from "../config";

export function restBase(environment: "spot_testnet" | "production") {
  const c = executorConfig();
  return environment === "spot_testnet"
    ? c.BINANCE_TESTNET_REST
    : c.BINANCE_PRODUCTION_REST;
}

export async function binanceRequest(input: {
  method: "GET" | "POST" | "DELETE";
  path: string;
  environment: "spot_testnet" | "production";
  apiKey?: string;
  apiSecret?: string;
  params?: Record<string, string | number | undefined>;
  signed?: boolean;
}) {
  if (!allowedEndpoint(input.method, input.path))
    throw new Error("ENDPOINT_FORBIDDEN");
  const url = new URL(input.path, restBase(input.environment));
  const params = input.params ?? {};
  if (input.signed) {
    if (!input.apiKey || !input.apiSecret) throw new Error("CREDENTIAL_INVALID");
    url.search = signedSearch(params, input.apiSecret).toString();
  } else {
    for (const [key, value] of Object.entries(params))
      if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method: input.method,
    headers: {
      accept: "application/json",
      ...(input.apiKey ? { "X-MBX-APIKEY": input.apiKey } : {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`BINANCE_${response.status}`);
    throw error;
  }
  return text ? (JSON.parse(text) as unknown) : {};
}
