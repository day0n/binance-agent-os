import {
  apiError,
  clearAuthCookie,
  requireWrite,
} from "@/adapters/http/session";
import { logoutAccount } from "@/application/auth/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = await requireWrite(request);
    await logoutAccount(auth.sessionId, auth.userId);
    await clearAuthCookie();
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
