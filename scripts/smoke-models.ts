import { ProviderRouter, modelError } from "../src/adapters/llm/providers";
import { providerSchema } from "../src/domain/contracts";

let failed = false;
const providers = process.argv.slice(2).length
  ? process.argv.slice(2).map((p) => providerSchema.parse(p))
  : (["gemini"] as const);
for (const provider of providers) {
  try {
    const result = await ProviderRouter.get(provider).turn(
      "You are verifying a tool-calling integration. Call submit_finding with ok=true. Do not include secrets or any other content.",
      [{ role: "user", content: "Verify connectivity." }],
      [
        {
          name: "submit_finding",
          description: "Confirm the integration works.",
          inputSchema: {
            type: "object",
            properties: { ok: { type: "boolean" } },
            required: ["ok"],
            additionalProperties: false,
          },
        },
      ],
      true,
    );
    if (result.calls[0]?.args.ok !== true)
      throw new Error("Invalid tool response");
    console.log(
      JSON.stringify({
        provider,
        model: result.model,
        status: "passed",
        usage: result.usage,
      }),
    );
  } catch (e) {
    failed = true;
    const safe = modelError(e);
    console.log(
      JSON.stringify({
        provider,
        status: "failed",
        code: safe.code,
        message: safe.message,
      }),
    );
  }
}
process.exitCode = failed ? 1 : 0;
