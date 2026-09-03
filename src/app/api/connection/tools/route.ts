import { discoverTools } from "@/adapters/binance/client";
import { owner, apiError, requireOrigin } from "@/adapters/http/session";
import { rateLimit } from "@/adapters/persistence/redis";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const id = await owner();
    await rateLimit(`discover:${id}`, 5, 60);
    return Response.json(
      { tools: await discoverTools(id) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
