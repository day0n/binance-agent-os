import { optionalUser, apiError } from "@/adapters/http/session";
import { connectionStatus } from "@/adapters/binance/oauth";
import { config } from "@/platform/config";
import { parseBindings } from "@/adapters/binance/policy";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const auth = await optionalUser();
    const c = config();
    return Response.json(
      {
        user: auth?.user ?? null,
        csrfToken: auth?.csrfToken ?? null,
        connection: auth
          ? await connectionStatus(auth.userId)
          : { connected: false, connectedAt: null, expiresAt: null },
        mcp: {
          websiteOAuthSupported: false,
          supportedClient: "Codex",
          verifiedAt: "2026-09-04T02:23:00+08:00",
          documentationUrl:
            "https://developers.binance.com/en/docs/agent-native/mcp-server/agentic",
        },
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
        writesEnabled: c.BINANCE_WRITES_ENABLED,
        productionWritesEnabled: c.BINANCE_PRODUCTION_WRITES_ENABLED,
        actionLimits: {
          maxUsdt: c.ACTION_MAX_USDT,
          dailyMaxUsdt: c.ACTION_DAILY_MAX_USDT,
        },
        readOnly: !c.BINANCE_WRITES_ENABLED,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
