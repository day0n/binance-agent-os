export {};
const origin = process.argv[2] ?? "http://localhost:3000";
for (const path of [
  "/",
  "/api/health",
  "/api/bootstrap",
  "/.well-known/oauth-client.json",
]) {
  const r = await fetch(`${origin}${path}`, {
    signal: AbortSignal.timeout(20000),
  });
  const data = await r.text();
  console.log(
    JSON.stringify({
      path,
      status: r.status,
      contentType: r.headers.get("content-type"),
      bytes: data.length,
    }),
  );
  if (!r.ok) process.exitCode = 1;
}
