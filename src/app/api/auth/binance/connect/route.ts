import { beginAuthorization } from "@/adapters/binance/oauth";
import { owner, requireOrigin, apiError } from "@/adapters/http/session";
import { rateLimit } from "@/adapters/persistence/redis";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const id = await owner();
    await rateLimit(`oauth:${id}`, 5, 600);
    return Response.json(
      { url: await beginAuthorization(id) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
