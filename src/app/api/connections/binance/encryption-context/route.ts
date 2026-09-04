import { apiError, requireWrite } from "@/adapters/http/session";
import { encryptionContext } from "@/application/connections/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { userId } = await requireWrite(request);
    return Response.json(await encryptionContext(userId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
