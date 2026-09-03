import { clientMetadata } from "@/adapters/binance/oauth";
import { apiError } from "@/adapters/http/session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(clientMetadata(), {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch (e) {
    return apiError(e);
  }
}
