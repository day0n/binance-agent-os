import { z } from "zod";
import { AppError } from "@/domain/errors";
import { roleSchema, type AgentRole, type Provider } from "@/domain/contracts";

const envSchema = z.object({
  APP_ORIGIN: z.string().url().default("http://localhost:3000"),
  APP_SECRET: z.string().min(64),
  MONGODB_URI: z.string().min(1),
  MONGODB_DB: z
    .string()
    .regex(/^binance_agent_os(?:_[a-z0-9_]+)?$/)
    .default("binance_agent_os_dev"),
  REDIS_URL: z.string().min(1),
  APP_ENV: z
    .enum(["development", "preview", "production", "test"])
    .default("development"),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),
  GOOGLE_OC_JSON: z.string().optional(),
  GOOGLE_CLOUD_PROJECT: z.string().optional(),
  GOOGLE_CLOUD_LOCATION: z.literal("global").default("global"),
  GEMINI_MODEL: z
    .string()
    .regex(/^gemini-[a-z0-9.-]+$/)
    .default("gemini-3.8-flash"),
  GEMINI_THINKING_LEVEL: z.literal("HIGH").default("HIGH"),
  GEMINI_MAX_OUTPUT_TOKENS: z.coerce
    .number()
    .int()
    .min(8192)
    .max(65536)
    .default(32768),
  ROLE_MODELS_JSON: z.string().default("{}"),
  BINANCE_CLIENT_METADATA_URL: z.string().optional(),
  BINANCE_TOOL_BINDINGS_JSON: z.string().default("{}"),
  RUN_MAX_MODEL_CALLS: z.coerce.number().int().min(1).max(60).default(24),
  RUN_MAX_TOOL_CALLS: z.coerce.number().int().min(1).max(100).default(36),
  RUN_MAX_TOKENS: z.coerce.number().int().min(1000).max(200000).default(60000),
  RUN_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(1800).default(600),
  OWNER_DAILY_RUN_LIMIT: z.coerce.number().int().min(1).max(100).default(20),
});
export function config() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success)
    throw new AppError(
      "CONFIG_MISSING",
      `服务端配置未完成：${[...new Set(parsed.error.issues.map((i) => i.path[0]))].join("、")}`,
      503,
    );
  const v = parsed.data;
  if (
    v.APP_ENV === "production" &&
    (v.MONGODB_DB !== "binance_agent_os" ||
      !v.APP_ORIGIN.startsWith("https://"))
  )
    throw new AppError(
      "CONFIG_INVALID",
      "生产环境必须使用隔离生产数据库与 HTTPS。",
      503,
    );
  if (v.APP_ENV !== "production" && v.MONGODB_DB === "binance_agent_os")
    throw new AppError(
      "CONFIG_INVALID",
      "开发或预览环境不能使用生产数据库。",
      503,
    );
  return v;
}
export function modelConfig(provider: Provider, role?: AgentRole) {
  const c = config();
  let overrides: Partial<Record<AgentRole, string>>;
  try {
    overrides = z
      .partialRecord(roleSchema, z.string().regex(/^[a-zA-Z0-9_.:-]+$/))
      .parse(JSON.parse(c.ROLE_MODELS_JSON));
  } catch {
    throw new AppError("MODEL_CONFIG_INVALID", "角色模型映射无效。", 503);
  }
  const override = role ? overrides[role] : undefined;
  if (provider === "gemini") {
    if (!c.GOOGLE_OC_JSON || !c.GOOGLE_CLOUD_PROJECT)
      throw new AppError(
        "MODEL_UNCONFIGURED",
        "Vertex AI 服务账号尚未配置。",
        503,
      );
    if (override && !override.startsWith("gemini-"))
      throw new AppError(
        "MODEL_CONFIG_INVALID",
        "Gemini 角色必须使用 Gemini 模型。",
        503,
      );
    return { key: c.GOOGLE_OC_JSON, model: override ?? c.GEMINI_MODEL };
  }
  const key = provider === "openai" ? c.OPENAI_API_KEY : c.ANTHROPIC_API_KEY;
  if (!key)
    throw new AppError(
      "MODEL_UNCONFIGURED",
      `${provider} 模型密钥尚未配置。`,
      503,
    );
  return {
    key,
    model:
      override ?? (provider === "openai" ? c.OPENAI_MODEL : c.ANTHROPIC_MODEL),
  };
}
export const MCP_ENDPOINT = "https://agent.binance.com/mcp/agentic";
export const AUTH_SERVER = "https://agent.binance.com";
export const BINANCE_ACCOUNTS = "https://accounts.binance.com";
