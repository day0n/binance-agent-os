import { OAuth2Client } from "google-auth-library";
import { executorConfig } from "./config";

const client = new OAuth2Client();

export async function requireAudience(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("UNAUTHENTICATED");
  const ticket = await client.verifyIdToken({
    idToken: token,
    audience: executorConfig().EXECUTOR_AUDIENCE,
  });
  const payload = ticket.getPayload();
  if (!payload?.email || !payload.email_verified) throw new Error("FORBIDDEN");
  return payload;
}
