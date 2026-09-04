import { AppError } from "@/domain/errors";
import { apiError, requireWrite } from "@/adapters/http/session";
import { getConnection } from "@/adapters/persistence/connection-store";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireWrite(request);
    await getConnection((await params).id, userId);
    throw new AppError(
      "EXECUTOR_UNCONFIGURED",
      "连接核验只在 Cloud Run Executor 内解密并进行 apiRestrictions 核对。",
      503,
    );
  } catch (error) {
    return apiError(error);
  }
}
