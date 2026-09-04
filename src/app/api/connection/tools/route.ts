import { discoverTools } from "@/adapters/binance/mcp-client";
import { requireWrite, apiError } from "@/adapters/http/session";
import { rateLimit } from "@/adapters/persistence/redis";
export async function POST(request: Request) {
  try {
    const { userId: id } = await requireWrite(request);
    await rateLimit(`discover:${id}`, 5, 60);
    return Response.json(
      { tools: await discoverTools(id) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
