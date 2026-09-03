import { disconnect } from "@/adapters/binance/oauth";
import { owner, requireOrigin, apiError } from "@/adapters/http/session";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    await disconnect(await owner());
    return Response.json({
      ok: true,
      message:
        "本应用已删除连接凭据。若要撤销币安侧授权，请到币安授权管理中操作。",
    });
  } catch (e) {
    return apiError(e);
  }
}
