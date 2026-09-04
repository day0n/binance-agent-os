import { apiError, optionalUser } from "@/adapters/http/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await optionalUser();
    return Response.json(
      {
        user: auth?.user ?? null,
        csrfToken: auth?.csrfToken ?? null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
