import { apiError } from "@/adapters/http/session";
import { database } from "@/adapters/persistence/mongo";
import { redis } from "@/adapters/persistence/redis";
import { config } from "@/platform/config";

export const runtime = "nodejs";
export const maxDuration = 30;
let cached:
  | { until: number; result: Promise<{ database: boolean; redis: boolean }> }
  | undefined;
export async function GET() {
  try {
    if (!cached || cached.until < Date.now())
      cached = {
        until: Date.now() + 30000,
        result: Promise.allSettled([
          database().then((db) => db.command({ ping: 1 })),
          redis().then((client) => client.ping()),
        ]).then(([db, cache]) => ({
          database: db.status === "fulfilled",
          redis: cache.status === "fulfilled",
        })),
      };
    const result = await cached.result;
    const c = config(),
      ready = result.database && result.redis;
    return Response.json(
      {
        status: ready ? "ready" : "degraded",
        dependencies: result,
        model: {
          provider: "gemini",
          model: c.GEMINI_MODEL,
          thinkingLevel: c.GEMINI_THINKING_LEVEL,
          configured: Boolean(c.GOOGLE_OC_JSON && c.GOOGLE_CLOUD_PROJECT),
          realCallVerified: false,
        },
        financialWorkflowsRequireOAuth: true,
      },
      { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
