import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type {
  ModelMessage,
  AgentRole,
  ModelTurn,
  Provider,
  ToolDefinition,
} from "@/domain/contracts";
import { modelConfig } from "@/platform/config";
import { AppError } from "@/domain/errors";
import { createGeminiProvider } from "./gemini";

export interface LLMProvider {
  turn(
    system: string,
    messages: ModelMessage[],
    tools: ToolDefinition[],
    finalOnly?: boolean,
  ): Promise<ModelTurn>;
}
function toolArgs(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value))
      return value;
  } catch {
    /* typed error below */
  }
  throw new AppError(
    "MODEL_OUTPUT_INVALID",
    "模型工具参数格式无效。",
    502,
    true,
  );
}
export class ProviderRouter {
  static get(provider: Provider, role?: AgentRole): LLMProvider {
    const { key, model } = modelConfig(provider, role);
    if (provider === "gemini") return createGeminiProvider(model);
    if (provider === "openai") {
      const client = new OpenAI({ apiKey: key, maxRetries: 0, timeout: 60000 });
      return {
        async turn(system, messages, tools, finalOnly) {
          const mapped: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: "system", content: system },
          ];
          for (const m of messages) {
            if (m.role === "user")
              mapped.push({ role: "user", content: m.content });
            if (m.role === "assistant")
              mapped.push({
                role: "assistant",
                content: m.content || null,
                ...(m.toolCalls?.length
                  ? {
                      tool_calls: m.toolCalls.map((c) => ({
                        id: c.id,
                        type: "function" as const,
                        function: {
                          name: c.name,
                          arguments: JSON.stringify(c.args),
                        },
                      })),
                    }
                  : {}),
              });
            if (m.role === "tool")
              mapped.push({
                role: "tool",
                tool_call_id: m.toolCallId!,
                content: m.content,
              });
          }
          const response = await client.chat.completions.create(
            {
              model,
              messages: mapped,
              tools: tools.map((t) => ({
                type: "function",
                function: {
                  name: t.name,
                  description: t.description,
                  parameters: t.inputSchema,
                },
              })),
              tool_choice: finalOnly
                ? { type: "function", function: { name: "submit_finding" } }
                : "required",
              parallel_tool_calls: true,
              max_completion_tokens: 2400,
            },
            { signal: AbortSignal.timeout(60000) },
          );
          const choice = response.choices[0];
          if (!choice || choice.finish_reason === "length")
            throw new AppError(
              "MODEL_OUTPUT_TRUNCATED",
              "模型输出达到上限，未提交不完整报告。",
              502,
              true,
            );
          return {
            content: choice.message.content ?? "",
            calls: (choice.message.tool_calls ?? [])
              .filter((c) => c.type === "function")
              .map((c) => ({
                id: c.id,
                name: c.function.name,
                args: toolArgs(c.function.arguments),
              })),
            model,
            usage: {
              input: response.usage?.prompt_tokens ?? 0,
              output: response.usage?.completion_tokens ?? 0,
            },
          };
        },
      };
    }
    const client = new Anthropic({
      apiKey: key,
      maxRetries: 0,
      timeout: 60000,
    });
    return {
      async turn(system, messages, tools, finalOnly) {
        const mapped: Anthropic.MessageParam[] = [];
        for (const m of messages) {
          if (m.role === "user")
            mapped.push({ role: "user", content: m.content });
          if (m.role === "assistant")
            mapped.push({
              role: "assistant",
              content: [
                ...(m.content
                  ? [{ type: "text" as const, text: m.content }]
                  : []),
                ...(m.toolCalls ?? []).map((c) => ({
                  type: "tool_use" as const,
                  id: c.id,
                  name: c.name,
                  input: c.args,
                })),
              ],
            });
          if (m.role === "tool") {
            const block: Anthropic.ToolResultBlockParam = {
              type: "tool_result",
              tool_use_id: m.toolCallId!,
              content: m.content,
            };
            const last = mapped.at(-1);
            if (
              last?.role === "user" &&
              Array.isArray(last.content) &&
              last.content.every((c) => c.type === "tool_result")
            )
              last.content.push(block);
            else mapped.push({ role: "user", content: [block] });
          }
        }
        const response = await client.messages.create(
          {
            model,
            system,
            messages: mapped,
            tools: tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
            })),
            tool_choice: finalOnly
              ? { type: "tool", name: "submit_finding" }
              : { type: "any" },
            max_tokens: 2400,
          },
          { signal: AbortSignal.timeout(60000) },
        );
        if (response.stop_reason === "max_tokens")
          throw new AppError(
            "MODEL_OUTPUT_TRUNCATED",
            "模型输出达到上限，未提交不完整报告。",
            502,
            true,
          );
        return {
          content: response.content
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join(""),
          calls: response.content
            .filter((c) => c.type === "tool_use")
            .map((c) => ({
              id: c.id,
              name: c.name,
              args: c.input as Record<string, unknown>,
            })),
          model,
          usage: {
            input: response.usage.input_tokens,
            output: response.usage.output_tokens,
          },
        };
      },
    };
  }
}
export function modelError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const status =
    error && typeof error === "object" && "status" in error
      ? Number(error.status)
      : 0;
  if (status === 401 || status === 403)
    return new AppError(
      "MODEL_AUTH_FAILED",
      "模型服务鉴权失败，请检查服务端配置。",
      503,
    );
  if (status === 429)
    return new AppError(
      "MODEL_RATE_LIMIT",
      "模型服务限流或额度不足，请稍后重试。",
      429,
      true,
    );
  return new AppError(
    "MODEL_UNAVAILABLE",
    "模型服务调用失败，没有生成替代或模拟回答。",
    502,
    true,
  );
}
