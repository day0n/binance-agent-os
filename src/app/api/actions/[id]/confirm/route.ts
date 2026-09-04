import { apiError, jsonBody, requireWrite } from "@/adapters/http/session";
import { confirmAction } from "@/application/actions/service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireWrite(request);
    const result = await confirmAction(
      (await params).id,
      userId,
      await jsonBody(request),
    );
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
