import { readFileSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";

// Explicit opt-in local convenience. Never copies the reference file or logs credentials.
const [reference, command, ...args] = process.argv.slice(2);
if (!reference || !command)
  throw new Error(
    "Usage: node scripts/with-reference-env.mjs /path/to/reference.env command [args]",
  );
const source = parseEnv(readFileSync(reference, "utf8"));
const env = { ...process.env };
for (const key of [
  "MONGODB_URI",
  "REDIS_URL",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
])
  if (!env[key] && source[key]) env[key] = source[key];
// Optional explicit second source; never search outside the user-selected file.
if (env.VERTEX_REFERENCE_ENV) {
  const vertex = parseEnv(readFileSync(env.VERTEX_REFERENCE_ENV, "utf8"));
  for (const key of ["GOOGLE_OC_JSON", "GOOGLE_CLOUD_PROJECT"])
    if (!env[key] && vertex[key]) env[key] = vertex[key];
}
if (existsSync(".env.local"))
  Object.assign(env, parseEnv(readFileSync(".env.local", "utf8")));
const child = spawn(command, args, { env, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
