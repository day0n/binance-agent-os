import { requireOrigin, apiError } from "@/adapters/http/session";
import { AppError } from "@/domain/errors";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    throw new AppError(
      "BINANCE_WEB_CLIENT_UNSUPPORTED",
      "Binance 当前尚未支持任意自建网站作为 Agentic MCP OAuth 客户端。请按页面说明使用官方支持的 Codex 客户端接入。",
      503,
    );
  } catch (e) {
    return apiError(e);
  }
}
