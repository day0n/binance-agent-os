import { createHmac } from "node:crypto";

export function signQuery(query: URLSearchParams, secret: string) {
  const payload = query.toString();
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  query.set("signature", signature);
  return query;
}

export function signedSearch(
  params: Record<string, string | number | undefined>,
  secret: string,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  query.set("timestamp", String(Date.now()));
  query.set("recvWindow", "5000");
  return signQuery(query, secret);
}
