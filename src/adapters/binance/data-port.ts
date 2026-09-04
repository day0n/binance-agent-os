import { callCapability } from "./client";
import type { Capability } from "./policy";

export type DataSource =
  | "binance_public_rest"
  | "binance_signed_rest"
  | "binance_mcp";

export async function fetchMarketData(
  ownerId: string,
  capability: Capability,
  values: Record<string, string | number>,
) {
  const result = await callCapability(ownerId, capability, values);
  return {
    data: result.data,
    tool: result.tool,
    source: "binance_mcp" as const satisfies DataSource,
  };
}
