import assert from "node:assert/strict";
import { ProviderRouter, modelError } from "../src/adapters/llm/providers";
import type { ModelMessage } from "../src/domain/contracts";

// Non-financial synthetic inputs test the real provider protocol, not market data.
try {
  const provider = ProviderRouter.get("gemini");
  const messages: ModelMessage[] = [
    {
      role: "user",
      content:
        "Call read_value for key a and key b. Both calls are needed before computing their sum.",
    },
  ];
  const first = await provider.turn(
    "Verify a tool integration. Do not guess values. Use both supplied tools before answering.",
    messages,
    [
      {
        name: "read_value",
        description: "Read one verification value.",
        inputSchema: {
          type: "object",
          properties: { key: { type: "string", enum: ["a", "b"] } },
          required: ["key"],
          additionalProperties: false,
        },
      },
    ],
  );
  assert.equal(first.calls.length, 2);
  assert.deepEqual(first.calls.map((c) => c.args.key).sort(), ["a", "b"]);
  messages.push({
    role: "assistant",
    content: first.content,
    toolCalls: first.calls,
    providerState: first.providerState,
  });
  for (const call of first.calls)
    messages.push({
      role: "tool",
      toolCallId: call.id,
      content: JSON.stringify({ value: call.args.key === "a" ? 2 : 3 }),
    });
  const final = await provider.turn(
    "Add the two verified values and submit their sum.",
    messages,
    [
      {
        name: "submit_finding",
        description: "Submit the test sum.",
        inputSchema: {
          type: "object",
          properties: { sum: { type: "number" } },
          required: ["sum"],
          additionalProperties: false,
        },
      },
    ],
    true,
  );
  assert.equal(final.calls[0]?.args.sum, 5);
  console.log(
    JSON.stringify({
      status: "passed",
      provider: "gemini",
      model: final.model,
      thinkingLevel: "HIGH",
      realTurns: 2,
      parallelCalls: first.calls.length,
      signedReplay: Boolean(first.providerState),
      usage: [first.usage, final.usage],
    }),
  );
} catch (e) {
  const safe = modelError(e);
  console.log(
    JSON.stringify({
      status: "failed",
      code: safe.code,
      message: safe.message,
    }),
  );
  process.exitCode = 1;
}
