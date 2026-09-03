import { randomUUID } from "node:crypto";
import {
  GoogleGenAI,
  FunctionCallingConfigMode,
  ThinkingLevel,
  type Content,
  type GenerateContentResponse,
  type GenerateContentConfig,
  type Part,
} from "@google/genai";
import { z } from "zod";
import type {
  ModelMessage,
  ModelTurn,
  ToolCall,
  ToolDefinition,
} from "@/domain/contracts";
import { AppError } from "@/domain/errors";
import { config } from "@/platform/config";
import { decrypt, encrypt, sha256 } from "@/platform/crypto";
import type { LLMProvider } from "./providers";

const accountSchema = z.object({
  type: z.literal("service_account"),
  project_id: z.string().min(1),
  client_email: z.string().email(),
  private_key: z.string().startsWith("-----BEGIN PRIVATE KEY-----"),
});
let cachedClient: { fingerprint: string; client: GoogleGenAI } | undefined;

export function vertexClient() {
  const c = config();
  let credentials: z.infer<typeof accountSchema>;
  try {
    credentials = accountSchema.parse(
      JSON.parse(
        Buffer.from(c.GOOGLE_OC_JSON ?? "", "base64").toString("utf8"),
      ),
    );
  } catch {
    throw new AppError(
      "GEMINI_CREDENTIALS_INVALID",
      "Vertex AI 服务账号配置无效。",
      503,
    );
  }
  if (credentials.project_id !== c.GOOGLE_CLOUD_PROJECT)
    throw new AppError(
      "GEMINI_PROJECT_MISMATCH",
      "Vertex AI 服务账号与目标项目不一致。",
      503,
    );
  const fingerprint = sha256([c.GOOGLE_OC_JSON, c.GOOGLE_CLOUD_PROJECT]);
  if (cachedClient?.fingerprint === fingerprint) return cachedClient.client;
  const client = new GoogleGenAI({
    vertexai: true,
    project: c.GOOGLE_CLOUD_PROJECT,
    location: "global",
    apiVersion: "v1",
    googleAuthOptions: {
      credentials,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    },
    httpOptions: { timeout: 180000, retryOptions: { attempts: 1 } },
  });
  cachedClient = { fingerprint, client };
  return client;
}

export function geminiGenerationConfig(
  system: string,
  tools: ToolDefinition[],
  finalOnly = false,
): GenerateContentConfig {
  return {
    systemInstruction: system,
    maxOutputTokens: config().GEMINI_MAX_OUTPUT_TOKENS,
    thinkingConfig: {
      thinkingLevel: ThinkingLevel.HIGH,
      includeThoughts: false,
    },
    tools: [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parametersJsonSchema: t.inputSchema,
        })),
      },
    ],
    toolConfig: {
      functionCallingConfig: {
        mode: FunctionCallingConfigMode.ANY,
        ...(finalOnly ? { allowedFunctionNames: ["submit_finding"] } : {}),
      },
    },
    // No sampling knobs, no numeric thinking budget, and no automatic tool execution.
    abortSignal: AbortSignal.timeout(180000),
  };
}

export function geminiContents(messages: ModelMessage[]): Content[] {
  const contents: Content[] = [];
  let pending = new Map<string, ToolCall>();
  const append = (role: string, parts: Part[]) => {
    const last = contents.at(-1);
    if (last?.role === role) last.parts!.push(...parts);
    else contents.push({ role, parts });
  };
  for (const message of messages) {
    if (message.role === "assistant") {
      if (pending.size)
        throw new AppError(
          "MODEL_HISTORY_INVALID",
          "模型工具结果未完整配对。",
          502,
        );
      if (
        message.toolCalls?.length &&
        message.providerState?.provider !== "gemini"
      )
        throw new AppError(
          "GEMINI_SIGNATURE_MISSING",
          "Gemini 工具调用缺少持久化思考签名，拒绝无状态重放。",
          502,
        );
      const native = message.providerState
        ? decrypt<Content>(message.providerState.encrypted)
        : { role: "model", parts: [{ text: message.content }] };
      if (native.role !== "model" || !native.parts?.length)
        throw new AppError(
          "MODEL_HISTORY_INVALID",
          "Gemini 历史结构无效。",
          502,
        );
      // Native Parts are replayed verbatim; a tool name is not a unique call ID.
      contents.push(native);
      pending = new Map(
        (message.toolCalls ?? []).map((call) => [call.id, call]),
      );
    } else if (message.role === "tool") {
      const call = pending.get(message.toolCallId ?? "");
      if (!call)
        throw new AppError(
          "MODEL_HISTORY_INVALID",
          "工具返回的标识不存在或重复。",
          502,
        );
      const parsed: unknown = JSON.parse(message.content);
      const response =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : { output: parsed };
      append("user", [
        {
          functionResponse: {
            name: call.name,
            ...(call.providerCallId ? { id: call.providerCallId } : {}),
            response,
          },
        },
      ]);
      pending.delete(call.id);
    } else {
      if (pending.size)
        throw new AppError(
          "MODEL_HISTORY_INVALID",
          "工具调用尚未结束，不能插入新请求。",
          502,
        );
      if (message.content) append("user", [{ text: message.content }]);
    }
  }
  if (pending.size || contents.at(-1)?.role !== "user")
    throw new AppError(
      "MODEL_HISTORY_INVALID",
      "Gemini 请求必须在全部工具完成后的用户轮次结束。",
      502,
    );
  return contents;
}

export function geminiTurn(
  response: GenerateContentResponse,
  model: string,
): ModelTurn {
  const candidate = response.candidates?.[0];
  if (
    !candidate?.content?.parts?.length ||
    (candidate.finishReason && candidate.finishReason !== "STOP")
  )
    throw new AppError(
      "MODEL_OUTPUT_INVALID",
      "Gemini 输出为空、被拦截、截断或工具协议不完整。",
      502,
      true,
    );
  const parts = candidate.content.parts;
  const calls: ToolCall[] = parts.flatMap((part) => {
    const call = part.functionCall;
    if (!call) return [];
    if (
      !call.name ||
      !call.args ||
      typeof call.args !== "object" ||
      Array.isArray(call.args)
    )
      throw new AppError(
        "MODEL_OUTPUT_INVALID",
        "Gemini 工具参数不符合协议。",
        502,
        true,
      );
    return [
      {
        id: call.id ?? "gemini-" + randomUUID(),
        name: call.name,
        args: call.args,
        ...(call.id ? { providerCallId: call.id } : {}),
      },
    ];
  });
  if (new Set(calls.map((c) => c.id)).size !== calls.length)
    throw new AppError(
      "MODEL_OUTPUT_INVALID",
      "Gemini 返回了重复工具调用标识。",
      502,
      true,
    );
  const usage = response.usageMetadata;
  return {
    content: parts
      .filter((p) => !p.thought && p.text)
      .map((p) => p.text)
      .join(""),
    calls,
    model,
    providerState: {
      provider: "gemini",
      encrypted: encrypt(candidate.content),
    },
    usage: {
      input:
        (usage?.promptTokenCount ?? 0) + (usage?.toolUsePromptTokenCount ?? 0),
      output:
        (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
      thinking: usage?.thoughtsTokenCount ?? 0,
    },
  };
}

export function createGeminiProvider(model: string): LLMProvider {
  return {
    async turn(system, messages, tools, finalOnly) {
      const response = await vertexClient().models.generateContent({
        model,
        contents: geminiContents(messages),
        config: geminiGenerationConfig(system, tools, finalOnly),
      });
      return geminiTurn(response, model);
    },
  };
}
