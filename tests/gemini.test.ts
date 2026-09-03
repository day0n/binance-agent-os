import { beforeAll, describe, expect, it } from "vitest";
import type { Content, GenerateContentResponse } from "@google/genai";
import {
  geminiContents,
  geminiGenerationConfig,
  geminiTurn,
} from "@/adapters/llm/gemini";
import { modelConfig, config } from "@/platform/config";
import { encrypt } from "@/platform/crypto";
import type { ModelMessage } from "@/domain/contracts";

beforeAll(() =>
  Object.assign(process.env, {
    APP_SECRET: "2".repeat(64),
    MONGODB_URI: "mongodb://localhost:27017",
    REDIS_URL: "redis://localhost:6379",
    APP_ENV: "test",
    MONGODB_DB: "binance_agent_os_dev",
    GOOGLE_OC_JSON: "fixture-not-a-real-credential",
    GOOGLE_CLOUD_PROJECT: "fixture-project",
  }),
);
const native: Content = {
  role: "model",
  parts: [
    {
      thought: true,
      text: "PRIVATE_REASONING_FIXTURE",
      thoughtSignature: "signature-thought",
    },
    {
      functionCall: { id: "a", name: "read_value", args: { key: "a" } },
      thoughtSignature: "signature-a",
    },
    {
      functionCall: { id: "b", name: "read_value", args: { key: "b" } },
      thoughtSignature: "signature-b",
    },
  ],
};
const response = {
  candidates: [{ finishReason: "STOP", content: native }],
  usageMetadata: {
    promptTokenCount: 100,
    candidatesTokenCount: 12,
    thoughtsTokenCount: 30,
  },
} as GenerateContentResponse;
describe("Gemini HIGH / Vertex wire contract", () => {
  it("pins the latest verified model and highest supported thinking level", () => {
    expect(modelConfig("gemini").model).toBe("gemini-3.8-flash");
    const request = geminiGenerationConfig("test", [], true);
    expect(request.thinkingConfig).toEqual({
      thinkingLevel: "HIGH",
      includeThoughts: false,
    });
    expect(request).not.toHaveProperty("temperature");
    expect(request.thinkingConfig).not.toHaveProperty("thinkingBudget");
    expect(
      request.toolConfig?.functionCallingConfig?.allowedFunctionNames,
    ).toEqual(["submit_finding"]);
  });
  it("does not silently lower thinking effort", () => {
    process.env.GEMINI_THINKING_LEVEL = "MEDIUM";
    expect(() => config()).toThrow();
    delete process.env.GEMINI_THINKING_LEVEL;
  });
  it("preserves same-name parallel calls by ID and replays native signed parts", () => {
    const turn = geminiTurn(response, "gemini-3.8-flash");
    const history: ModelMessage[] = [
      { role: "user", content: "Read both values." },
      {
        role: "assistant",
        content: turn.content,
        toolCalls: turn.calls,
        providerState: turn.providerState,
      },
      { role: "tool", toolCallId: "a", content: '{"value":2}' },
      { role: "tool", toolCallId: "b", content: '{"value":3}' },
    ];
    const contents = geminiContents(history);
    expect(contents[1]).toEqual(native);
    expect(contents[2].parts?.map((p) => p.functionResponse?.id)).toEqual([
      "a",
      "b",
    ]);
    expect(contents[2].parts?.map((p) => p.functionResponse?.name)).toEqual([
      "read_value",
      "read_value",
    ]);
    expect(turn.content).not.toContain("PRIVATE_REASONING_FIXTURE");
    expect(turn.providerState?.encrypted).not.toContain(
      "PRIVATE_REASONING_FIXTURE",
    );
    expect(turn.usage).toEqual({ input: 100, output: 42, thinking: 30 });
  });
  it("rejects missing signed state, missing tool returns and duplicate returns", () => {
    const turn = geminiTurn(response, "gemini-3.8-flash");
    const assistant: ModelMessage = {
      role: "assistant",
      content: "",
      toolCalls: turn.calls,
      providerState: turn.providerState,
    };
    expect(() =>
      geminiContents([{ ...assistant, providerState: undefined }]),
    ).toThrow();
    expect(() =>
      geminiContents([
        assistant,
        { role: "tool", toolCallId: "a", content: "{}" },
      ]),
    ).toThrow();
    expect(() =>
      geminiContents([
        assistant,
        { role: "tool", toolCallId: "a", content: "{}" },
        { role: "tool", toolCallId: "a", content: "{}" },
      ]),
    ).toThrow();
    expect(() =>
      geminiContents([assistant, { role: "user", content: "skip tools" }]),
    ).toThrow();
  });
  it("rejects truncated, blocked and duplicate-ID model responses", () => {
    expect(() =>
      geminiTurn(
        {
          candidates: [{ finishReason: "MAX_TOKENS", content: native }],
        } as GenerateContentResponse,
        "test",
      ),
    ).toThrow();
    expect(() =>
      geminiTurn(
        { candidates: [] } as unknown as GenerateContentResponse,
        "test",
      ),
    ).toThrow();
    const duplicate = {
      role: "model",
      parts: [native.parts![1], native.parts![1]],
    };
    expect(() =>
      geminiTurn(
        { candidates: [{ content: duplicate }] } as GenerateContentResponse,
        "test",
      ),
    ).toThrow();
  });
  it("rejects tampered replay state", () => {
    expect(() =>
      geminiContents([
        {
          role: "assistant",
          content: "",
          providerState: {
            provider: "gemini",
            encrypted: encrypt({ role: "user", parts: [{ text: "invalid" }] }),
          },
        },
      ]),
    ).toThrow();
  });
  it("supports explicit role models without overriding another role", () => {
    process.env.ROLE_MODELS_JSON = '{"risk":"gemini-3.1-pro-preview"}';
    expect(modelConfig("gemini", "risk").model).toBe("gemini-3.1-pro-preview");
    expect(modelConfig("gemini", "market").model).toBe("gemini-3.8-flash");
    process.env.ROLE_MODELS_JSON = '{"unknown_role":"anything"}';
    expect(() => modelConfig("gemini", "risk")).toThrow();
    delete process.env.ROLE_MODELS_JSON;
  });
});
