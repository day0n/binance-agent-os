import { z } from "zod";
import { AppError } from "@/domain/errors";
import { sha256 } from "@/platform/crypto";

export const capabilitySchema = z.enum([
  "candles",
  "prices",
  "balances",
  "depth",
  "funding",
]);
export type Capability = z.infer<typeof capabilitySchema>;
const bindingSchema = z
  .object({
    name: z.string().min(1),
    schemaHash: z.string().regex(/^[a-f0-9]{64}$/),
    argumentMap: z
      .partialRecord(
        z.enum(["symbol", "interval", "startTime", "endTime", "limit"]),
        z.string(),
      )
      .default({}),
    fixedArguments: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .default({}),
    resultPath: z.string().default(""),
  })
  .strict();
export type Binding = z.infer<typeof bindingSchema>;
const dangerous =
  /withdraw|transfer|borrow|repay|(?:place|create|cancel|submit|execute).*order|execute|purchase|(?:^|[_-])(?:buy|sell)(?:$|[_-])|set.*leverage|margin_type/i;
export function parseBindings(
  json: string,
): Partial<Record<Capability, Binding>> {
  try {
    return z
      .partialRecord(capabilitySchema, bindingSchema)
      .parse(JSON.parse(json));
  } catch {
    throw new AppError("MCP_BINDINGS_INVALID", "MCP 只读工具配置无效。", 503);
  }
}
export function validateBinding(
  binding: Binding,
  tool: { name: string; inputSchema: unknown },
) {
  if (dangerous.test(tool.name) || binding.name !== tool.name)
    throw new AppError("TOOL_FORBIDDEN", "此工具不在只读能力范围。", 403);
  if (sha256(tool.inputSchema) !== binding.schemaHash)
    throw new AppError(
      "TOOL_SCHEMA_CHANGED",
      "币安工具 Schema 已变化，需要重新审核后才能调用。",
      503,
    );
  if (
    Object.entries(binding.fixedArguments).some(
      ([k, v]) =>
        (k.toLowerCase() === "method" && String(v).toUpperCase() !== "GET") ||
        /withdraw|transfer|borrow|repay|order.*(?:create|cancel)/i.test(
          String(v),
        ),
    )
  )
    throw new AppError("TOOL_FORBIDDEN", "只读工具参数包含不允许的操作。", 403);
}
export function mappedArguments(
  binding: Binding,
  values: Record<string, unknown>,
) {
  const args: Record<string, unknown> = { ...binding.fixedArguments };
  for (const [canonical, target] of Object.entries(binding.argumentMap)) {
    if (["__proto__", "prototype", "constructor"].includes(target))
      throw new AppError("MCP_BINDINGS_INVALID", "工具参数映射无效。", 503);
    if (values[canonical] !== undefined) args[target] = values[canonical];
  }
  return args;
}
export function atPath(value: unknown, path: string): unknown {
  let result = value;
  if (!path) return result;
  for (const part of path.split(".")) {
    if (!part || ["__proto__", "constructor", "prototype"].includes(part))
      throw new AppError("MCP_DATA_INVALID", "返回数据路径无效。", 502);
    if (typeof result !== "object" || result === null || !(part in result))
      throw new AppError(
        "MCP_DATA_INVALID",
        "币安返回的数据结构与审核映射不一致。",
        502,
      );
    result = (result as Record<string, unknown>)[part];
  }
  return result;
}
