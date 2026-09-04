import { apiError, requireUser } from "@/adapters/http/session";
import { readAction } from "@/application/actions/service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireUser();
    const action = await readAction((await params).id, userId);
    return Response.json(
      { action },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
