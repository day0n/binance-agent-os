import { AppError } from "@/domain/errors";
import { config } from "@/platform/config";
import { accessToken } from "./oauth";
import { callCapability } from "./mcp-client";
import { parseBindings, type Capability } from "./mcp-policy";
import {
  fetchDepth,
  fetchPublicKlines,
  fetchPublicPrices,
} from "./public-rest";
import { executorRead } from "./executor-client";

type DataSource = "binance_public_rest" | "binance_signed_rest" | "binance_mcp";

export async function mcpAvailable(ownerId: string, capability: Capability) {
  const binding = parseBindings(config().BINANCE_TOOL_BINDINGS_JSON)[capability];
  if (!binding) return false;
  try {
    await accessToken(ownerId);
    return true;
  } catch {
    return false;
  }
}

export async function fetchByCapability(
  ownerId: string,
  capability: Capability,
  values: Record<string, string | number>,
): Promise<{ data: unknown; tool: string; source: DataSource }> {
  if (capability === "candles") {
    return {
      data: await fetchPublicKlines(values),
      tool: "GET /api/v3/klines",
      source: "binance_public_rest",
    };
  }
  if (capability === "prices") {
    return {
      data: await fetchPublicPrices(),
      tool: "GET /api/v3/ticker/price",
      source: "binance_public_rest",
    };
  }
  if (capability === "depth") {
    if (typeof values.symbol !== "string")
      throw new AppError("INVALID_INPUT", "深度查询需要交易对。", 422);
    return {
      data: await fetchDepth(values.symbol),
      tool: "GET /api/v3/depth",
      source: "binance_public_rest",
    };
  }
  if (capability === "balances" || capability === "funding") {
    if (config().EXECUTOR_URL) {
      const data = await executorRead(ownerId, capability, values);
      return {
        data,
        tool: capability === "balances" ? "GET /api/v3/account" : "GET /sapi/v1/asset/get-funding-asset",
        source: "binance_signed_rest",
      };
    }
    if (await mcpAvailable(ownerId, capability)) {
      const result = await callCapability(ownerId, capability, values);
      return { data: result.data, tool: result.tool, source: "binance_mcp" };
    }
    throw new AppError(
      "ACCOUNT_CONNECTION_REQUIRED",
      "账户数据需要已核验的 API Key 执行器连接；网站不会假装 MCP 已连接。",
      503,
    );
  }
  throw new AppError("CAPABILITY_UNSUPPORTED", "未知的数据能力。", 400);
}
