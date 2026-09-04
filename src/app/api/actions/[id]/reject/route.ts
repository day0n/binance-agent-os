import { apiError, requireWrite } from "@/adapters/http/session";
import { rejectAction } from "@/application/actions/service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireWrite(request);
    const action = await rejectAction((await params).id, userId);
    return Response.json(
      { action },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
