import { completeAuthorization } from "@/adapters/binance/oauth";
import { owner } from "@/adapters/http/session";
import { config } from "@/platform/config";
import { publicError } from "@/domain/errors";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirect = new URL("/", config().APP_ORIGIN);
  try {
    await completeAuthorization(
      await owner(),
      url.searchParams.get("state") ?? "",
      url.searchParams.get("error") ? null : url.searchParams.get("code"),
    );
    redirect.searchParams.set("connection", "success");
  } catch (e) {
    redirect.searchParams.set("connection", publicError(e).code);
  }
  return Response.redirect(redirect, 303);
}
