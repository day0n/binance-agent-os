import { fetchByCapability } from "./source-router";
import type { Capability } from "./mcp-policy";

export type DataSource =
  | "binance_public_rest"
  | "binance_signed_rest"
  | "binance_mcp";

export async function fetchMarketData(
  ownerId: string,
  capability: Capability,
  values: Record<string, string | number>,
) {
  return fetchByCapability(ownerId, capability, values);
}
