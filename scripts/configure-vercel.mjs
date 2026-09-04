import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
await import(new URL("./assert-deploy-target.mjs", import.meta.url).href);

const [reference, origin, environment = "production", vertexReference] =
  process.argv.slice(2);
if (
  !reference ||
  !origin?.startsWith("https://") ||
  !["production", "preview"].includes(environment)
)
  throw new Error(
    "Usage: node scripts/configure-vercel.mjs /path/to/reference.env https://verified-project-origin production|preview",
  );
const project = JSON.parse(readFileSync(".vercel/project.json", "utf8"));
if (project.projectName !== "binance-agent-os")
  throw new Error("Refusing to configure a different project.");
const expectedOrg = process.env.VERCEL_EXPECTED_ORG_ID;
const scope = process.env.VERCEL_DEPLOY_SCOPE;
if (!expectedOrg || !scope || project.orgId !== expectedOrg)
  throw new Error(
    "Set and verify VERCEL_EXPECTED_ORG_ID and VERCEL_DEPLOY_SCOPE before sending credentials.",
  );
if (/opencreator/i.test(reference) || /opencreator/i.test(vertexReference ?? ""))
  throw new Error("Refusing to copy environment values from an OpenCreator project.");
const source = parseEnv(readFileSync(reference, "utf8"));
const values = {
  APP_ORIGIN: origin,
  APP_SECRET: randomBytes(32).toString("hex"),
  AUTH_PEPPER: randomBytes(32).toString("hex"),
  APP_ENV: environment,
  MONGODB_DB:
    environment === "production" ? "binance_agent_os" : "binance_agent_os_dev",
  GEMINI_MODEL: "gemini-3.8-flash",
  GEMINI_THINKING_LEVEL: "HIGH",
  GOOGLE_CLOUD_LOCATION: "global",
  BINANCE_TOOL_BINDINGS_JSON: "{}",
  BINANCE_WRITES_ENABLED: "false",
  BINANCE_PRODUCTION_WRITES_ENABLED: "false",
  ACTION_MAX_USDT: "5",
  ACTION_DAILY_MAX_USDT: "20",
};
for (const key of ["MONGODB_URI", "REDIS_URL"])
  if (source[key]) values[key] = source[key];
if (vertexReference) {
  const vertex = parseEnv(readFileSync(vertexReference, "utf8"));
  for (const key of ["GOOGLE_OC_JSON", "GOOGLE_CLOUD_PROJECT"]) {
    if (!vertex[key])
      throw new Error("Missing required Vertex account/project setting.");
    values[key] = vertex[key];
  }
  const identity = JSON.parse(
    Buffer.from(values.GOOGLE_OC_JSON, "base64").toString("utf8"),
  );
  if (
    identity.type !== "service_account" ||
    !identity.private_key ||
    !identity.client_email ||
    identity.project_id !== values.GOOGLE_CLOUD_PROJECT
  )
    throw new Error(
      "Vertex service account/project mismatch. No changes applied.",
    );
}
// Each value travels on stdin, not a command-line argument or log. Never overwrite existing keys.
for (const [key, value] of Object.entries(values)) {
  const r = spawnSync(
    "vercel",
    ["env", "add", key, environment, "--sensitive", "--scope", scope],
    { input: value, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
  if (r.status !== 0) {
    console.error(
      `${key}: not added (may already exist); existing value preserved. Inspect with vercel env ls.`,
    );
    process.exitCode = 1;
  } else console.log(`${key}: configured for ${environment}`);
}
