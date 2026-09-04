import {
  apiError,
  jsonBody,
  requireUser,
  requireWrite,
} from "@/adapters/http/session";
import { listConnections, saveConnection } from "@/application/connections/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { userId } = await requireUser();
    return Response.json(
      { connections: await listConnections(userId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireWrite(request);
    const connection = await saveConnection(userId, await jsonBody(request));
    return Response.json(
      { connection },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

