import { database } from "@/adapters/persistence/mongo";
import type { SessionRecord } from "@/adapters/persistence/store";
import { owner, apiError } from "@/adapters/http/session";
export async function GET() {
  try {
    const sessions = await (
      await database()
    )
      .collection<SessionRecord>("sessions")
      .find({ ownerId: await owner() })
      .sort({ updatedAt: -1 })
      .limit(50)
      .project({ ownerId: 0 })
      .toArray();
    return Response.json(
      { sessions },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
