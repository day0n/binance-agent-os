import { existsSync, readFileSync } from "node:fs";

const ALLOWED_SCOPE = "niuzj0-5483s-projects";
const ALLOWED_PROJECT = "binance-agent-os";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function mentionsOpenCreator(...values) {
  return values.some((value) =>
    String(value ?? "")
      .toLowerCase()
      .includes("opencreator"),
  );
}

if (!existsSync(".vercel/project.json"))
  fail("Missing .vercel/project.json; refuse to deploy without a linked project.");

const project = JSON.parse(readFileSync(".vercel/project.json", "utf8"));
const scope = process.env.VERCEL_DEPLOY_SCOPE;
const expectedOrg = process.env.VERCEL_EXPECTED_ORG_ID;

if (project.projectName !== ALLOWED_PROJECT)
  fail(`Deploy target must be ${ALLOWED_PROJECT}, got ${project.projectName}.`);

if (scope && scope !== ALLOWED_SCOPE)
  fail(`VERCEL_DEPLOY_SCOPE must be ${ALLOWED_SCOPE}, got ${scope}.`);

if (expectedOrg && project.orgId && project.orgId !== expectedOrg)
  fail("Vercel orgId does not match VERCEL_EXPECTED_ORG_ID.");

if (
  mentionsOpenCreator(
    project.projectName,
    project.orgId,
    project.orgName,
    scope,
    expectedOrg,
    process.env.VERCEL_ORG_ID,
    process.env.VERCEL_PROJECT_ID,
  )
)
  fail("OpenCreator Vercel scope detected. Refusing to configure or deploy.");

if (process.env.VERCEL_DEPLOY_SCOPE && process.env.VERCEL_DEPLOY_SCOPE !== ALLOWED_SCOPE)
  fail("Refusing a non-personal deploy scope.");

console.log(
  JSON.stringify({
    ok: true,
    project: ALLOWED_PROJECT,
    scope: scope ?? ALLOWED_SCOPE,
  }),
);
