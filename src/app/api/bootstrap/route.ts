import { owner, apiError } from "@/adapters/http/session";
import { connectionStatus } from "@/adapters/binance/oauth";
import { config } from "@/platform/config";
import { parseBindings } from "@/adapters/binance/policy";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const id = await owner(true);
    const c = config();
    return Response.json(
      {
        connection: await connectionStatus(id),
        providers: [
          {
            id: "gemini",
            available: Boolean(c.GOOGLE_OC_JSON && c.GOOGLE_CLOUD_PROJECT),
            model: c.GEMINI_MODEL,
            thinkingLevel: c.GEMINI_THINKING_LEVEL,
          },
          {
            id: "openai",
            available: Boolean(c.OPENAI_API_KEY),
            model: c.OPENAI_MODEL,
          },
          {
            id: "anthropic",
            available: Boolean(c.ANTHROPIC_API_KEY),
            model: c.ANTHROPIC_MODEL,
          },
        ],
        capabilities: Object.keys(parseBindings(c.BINANCE_TOOL_BINDINGS_JSON)),
        readOnly: true,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
