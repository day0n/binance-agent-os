import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { accessToken, trustedFetch } from "./oauth";
import { config, MCP_ENDPOINT } from "@/platform/config";
import { AppError } from "@/domain/errors";
import { sha256 } from "@/platform/crypto";
import {
  parseBindings,
  validateBinding,
  mappedArguments,
  atPath,
  type Capability,
} from "./policy";

async function withClient<T>(
  ownerId: string,
  task: (client: Client) => Promise<T>,
) {
  const token = await accessToken(ownerId);
  const client = new Client({
    name: "binance-agent-os-readonly",
    version: "0.1.0",
  });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_ENDPOINT), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
    fetch: trustedFetch,
    reconnectionOptions: {
      initialReconnectionDelay: 1000,
      maxReconnectionDelay: 2000,
      reconnectionDelayGrowFactor: 1.5,
      maxRetries: 1,
    },
  });
  try {
    await client.connect(transport, { timeout: 20000 });
    return await task(client);
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (
      e instanceof UnauthorizedError ||
      (e instanceof StreamableHTTPError && e.code === 401)
    )
      throw new AppError(
        "BINANCE_AUTH_REQUIRED",
        "币安授权已失效，请重新连接。",
        401,
      );
    if (e instanceof StreamableHTTPError && e.code === 403)
      throw new AppError(
        "BINANCE_SCOPE_REQUIRED",
        "当前授权没有所需的读取权限，或服务在当前账户不可用。",
        403,
      );
    if (e instanceof StreamableHTTPError && e.code === 429)
      throw new AppError(
        "BINANCE_RATE_LIMIT",
        "币安接口限流，请稍后重试。",
        429,
        true,
      );
    throw new AppError(
      "BINANCE_UNAVAILABLE",
      "币安 MCP 暂时不可用，未使用替代或模拟数据。",
      502,
      true,
    );
  } finally {
    await client.close().catch(() => undefined);
  }
}
async function listAll(client: Client) {
  const tools: Awaited<ReturnType<Client["listTools"]>>["tools"] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const response = await client.listTools(cursor ? { cursor } : undefined, {
      timeout: 20000,
    });
    tools.push(...response.tools);
    cursor = response.nextCursor;
    if (!cursor) return tools;
  }
  throw new AppError("TOOL_CATALOG_TOO_LARGE", "工具目录超过安全上限。", 502);
}
export async function discoverTools(ownerId: string) {
  return withClient(ownerId, async (client) =>
    (await listAll(client)).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      schemaHash: sha256(t.inputSchema),
      annotations: t.annotations,
    })),
  );
}
export async function callCapability(
  ownerId: string,
  capability: Capability,
  values: Record<string, unknown>,
) {
  const binding = parseBindings(config().BINANCE_TOOL_BINDINGS_JSON)[
    capability
  ];
  if (!binding)
    throw new AppError(
      "MCP_CAPABILITY_UNCONFIGURED",
      `官方 MCP 的 ${capability} 工具尚未审核映射，当前不会猜测工具名称或返回模拟数据。`,
      503,
    );
  return withClient(ownerId, async (client) => {
    const tools = await listAll(client);
    const tool = tools.find((t) => t.name === binding.name);
    if (!tool)
      throw new AppError(
        "MCP_CAPABILITY_UNAVAILABLE",
        `当前授权没有已配置的 ${capability} 工具。`,
        403,
      );
    validateBinding(binding, tool);
    const result = await client.callTool(
      { name: binding.name, arguments: mappedArguments(binding, values) },
      undefined,
      { timeout: 25000 },
    );
    if (result.isError)
      throw new AppError(
        "MCP_TOOL_ERROR",
        `币安 ${capability} 工具执行失败，未使用模拟结果。`,
        502,
      );
    let payload: unknown = result.structuredContent;
    if (!payload) {
      const content = result.content;
      if (!Array.isArray(content))
        throw new AppError(
          "MCP_DATA_INVALID",
          "币安工具未返回可解析内容。",
          502,
        );
      const blocks = content.filter(
        (b: { type?: string }) => b.type === "text",
      ) as { text: string }[];
      const text = blocks.map((b) => b.text).join("\n");
      if (text.length > 2000000)
        throw new AppError(
          "MCP_DATA_TOO_LARGE",
          "币安数据超出单次安全上限。",
          502,
        );
      try {
        payload = JSON.parse(text);
      } catch {
        throw new AppError(
          "MCP_DATA_INVALID",
          "币安数据不是可验证的 JSON，请检查工具映射。",
          502,
        );
      }
    }
    return { data: atPath(payload, binding.resultPath), tool: binding.name };
  });
}
