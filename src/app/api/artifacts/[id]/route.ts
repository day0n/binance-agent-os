import { getArtifact } from "@/adapters/persistence/store";
import { requireUser, apiError } from "@/adapters/http/session";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const data = await getArtifact((await params).id, (await requireUser()).userId);
    return Response.json(
      { data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
