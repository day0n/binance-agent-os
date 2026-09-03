import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { database, closeDatabase } from "../src/adapters/persistence/mongo";
import {
  redis,
  closeRedis,
  redisKey,
  rateLimit,
  withLease,
} from "../src/adapters/persistence/redis";
import {
  accessToken,
  completeAuthorization,
} from "../src/adapters/binance/oauth";
import {
  createRun,
  claimDispatch,
  getRun,
  startRun,
  emit,
  eventsAfter,
  reserveCall,
  putArtifact,
  getArtifact,
  finishRun,
  terminateRun,
  recall,
} from "../src/adapters/persistence/store";
import { runInputSchema, type AnalysisReport } from "../src/domain/contracts";
import { AppError, publicError } from "../src/domain/errors";
import { config } from "../src/platform/config";
import { encrypt, sha256, signSession } from "../src/platform/crypto";

const c = config();
if (
  !["development", "test"].includes(c.APP_ENV) ||
  c.MONGODB_DB !== "binance_agent_os_dev" ||
  !["localhost", "127.0.0.1"].includes(new URL(c.APP_ORIGIN).hostname)
)
  throw new Error(
    "Integration fixtures are allowed only on localhost with binance_agent_os_dev.",
  );
const own = randomUUID(),
  foreign = randomUUID();
const ownedIds = [own, foreign];
const origin = new URL(c.APP_ORIGIN).origin;
const cookie = (id: string) =>
  "bao_session=" + signSession(id, Date.now() + 600000);
const request = async (
  path: string,
  id = own,
  body?: unknown,
  extra: Record<string, string> = {},
) =>
  fetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      cookie: cookie(id),
      origin,
      "content-type": "application/json",
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const input = () =>
  runInputSchema.parse({
    clientRequestId: randomUUID(),
    mode: "research",
    provider: "openai",
    prompt: "INTEGRATION FIXTURE — not a market analysis",
  });
let checks = 0;
const passed = (name: string) => {
  checks++;
  console.log(JSON.stringify({ check: name, status: "passed" }));
};

try {
  const db = await database(),
    cache = await redis();
  assert.equal((await db.command({ ping: 1 })).ok, 1);
  assert.equal(await cache.ping(), "PONG");
  passed("real MongoDB and Redis / isolated development namespace");

  const rejected = input();
  await assert.rejects(
    createRun(own, rejected, async () => {
      throw new AppError("RATE_LIMIT", "test", 429);
    }),
    { code: "RATE_LIMIT" },
  );
  assert.equal(await db.collection("runs").countDocuments({ ownerId: own }), 0);
  assert.equal(
    await db.collection("sessions").countDocuments({ ownerId: own }),
    0,
  );
  passed("quota rejection leaves no orphan run or session");

  const first = input();
  let charges = 0;
  const { run } = await createRun(own, first, async () => {
    charges++;
  });
  const duplicate = await createRun(own, first, async () => {
    charges++;
  });
  assert.equal(duplicate.run._id, run._id);
  assert.equal(charges, 1);
  await assert.rejects(createRun(own, { ...first, prompt: "different" }), {
    code: "IDEMPOTENCY_CONFLICT",
  });
  const claims = await Promise.all([
    claimDispatch(run._id),
    claimDispatch(run._id),
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
  await assert.rejects(getRun(run._id, foreign), { code: "NOT_FOUND" });
  passed("request idempotency / single dispatch / owner isolation");

  await startRun(run._id);
  await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      emit(run._id, "event-" + (i % 6), {
        type: "tool.completed",
        message: "fixture event",
      }),
    ),
  );
  const eventRun = await getRun(run._id);
  assert.equal(eventRun.events.length, 7);
  assert.deepEqual(
    eventsAfter(eventRun, 5).map((e) => e.id),
    ["6", "7"],
  );
  passed("atomic durable event deduplication and cursor replay");

  const previousBudget = process.env.RUN_MAX_MODEL_CALLS;
  process.env.RUN_MAX_MODEL_CALLS = "2";
  await reserveCall(run._id, "model");
  await reserveCall(run._id, "model");
  await assert.rejects(reserveCall(run._id, "model"), {
    code: "BUDGET_EXHAUSTED",
  });
  if (previousBudget === undefined) delete process.env.RUN_MAX_MODEL_CALLS;
  else process.env.RUN_MAX_MODEL_CALLS = previousBudget;
  await rateLimit("integration:" + own, 1, 60);
  await assert.rejects(rateLimit("integration:" + own, 1, 60), {
    code: "RATE_LIMIT",
  });
  await withLease("integration:" + own, async () => {
    await assert.rejects(
      withLease("integration:" + own, async () => true),
      { code: "BUSY" },
    );
  });
  passed("real Redis rate/concurrency gates and persisted model budget");

  const artifact = await putArtifact(run._id, "fixture", "evidence", {
    fixture: true,
  });
  assert.equal(
    await putArtifact(run._id, "fixture", "evidence", { fixture: false }),
    artifact,
  );
  assert.deepEqual(await getArtifact(artifact, own), { fixture: true });
  await assert.rejects(getArtifact(artifact, foreign), { code: "NOT_FOUND" });
  await terminateRun(run._id, "cancelled");
  await assert.rejects(putArtifact(run._id, "late", "evidence", {}), {
    code: "CANCELLED",
  });
  const report: AnalysisReport = {
    title: "INTEGRATION FIXTURE",
    mode: "research",
    symbol: "BTCUSDT",
    asOf: new Date().toISOString(),
    summary: "NOT A MARKET ANALYSIS",
    stance: "insufficient",
    sections: [],
    risk: {
      allowed: false,
      policyConfigured: false,
      coverage: "fixture",
      checks: [],
      evidenceIds: [],
    },
    evidence: [],
    limitations: ["fixture"],
    disclaimer: "fixture",
  };
  await assert.rejects(finishRun(run._id, report), { code: "CANCELLED" });
  assert.equal((await getRun(run._id)).reportId, undefined);
  passed(
    "immutable artifacts / cross-owner denial / cancellation rejects late results",
  );

  const complete = await createRun(own, input());
  await startRun(complete.run._id);
  await finishRun(complete.run._id, report);
  await finishRun(complete.run._id, {
    ...report,
    summary: "must not overwrite",
  });
  assert.equal((await getRun(complete.run._id)).status, "completed");
  assert.equal(
    await db
      .collection<{ _id: string }>("messages")
      .countDocuments({ _id: complete.run._id + ":assistant" }),
    1,
  );
  assert.equal(
    (await recall(own, "BTCUSDT", "2000-01-01T00:00:00.000Z")).length,
    0,
  );
  assert.equal(
    (await recall(own, "BTCUSDT", new Date(Date.now() + 1000).toISOString()))
      .length,
    1,
  );
  await terminateRun(complete.run._id, "cancelled");
  assert.equal((await getRun(complete.run._id)).status, "completed");
  passed(
    "idempotent finalization / point-in-time memory / completed cannot become cancelled",
  );

  const states = db.collection<{
    _id: string;
    ownerId: string;
    expiresAt: Date;
    verifier: string;
  }>("oauth_states");
  const state = randomBytes(32).toString("base64url");
  await states.insertOne({
    _id: sha256(state),
    ownerId: own,
    expiresAt: new Date(Date.now() + 60000),
    verifier: encrypt("fixture-verifier"),
  });
  await assert.rejects(completeAuthorization(foreign, state, null), {
    code: "INVALID_OAUTH_STATE",
  });
  await assert.rejects(completeAuthorization(own, state, null), {
    code: "AUTH_DENIED",
  });
  await assert.rejects(completeAuthorization(own, state, null), {
    code: "INVALID_OAUTH_STATE",
  });
  const expired = randomBytes(32).toString("base64url");
  await states.insertOne({
    _id: sha256(expired),
    ownerId: own,
    expiresAt: new Date(0),
    verifier: encrypt("fixture-verifier"),
  });
  await assert.rejects(completeAuthorization(own, expired, null), {
    code: "INVALID_OAUTH_STATE",
  });
  const connections = db.collection<{
    _id: string;
    encrypted: string;
    expiresAt: number;
    connectedAt: string;
  }>("connections");
  await connections.insertOne({
    _id: own,
    encrypted: encrypt({ access_token: "invalid-test-fixture" }),
    expiresAt: Date.now() - 1,
    connectedAt: new Date().toISOString(),
  });
  await assert.rejects(accessToken(own), { code: "BINANCE_AUTH_REQUIRED" });
  passed("OAuth cancellation / expiry / one-time state / owner binding");

  assert.equal((await request("/api/runs/" + run._id, foreign)).status, 404);
  assert.equal(
    (await request("/api/runs/" + run._id + "/events", foreign)).status,
    404,
  );
  assert.equal(
    (await request("/api/artifacts/" + artifact, foreign)).status,
    404,
  );
  assert.equal(
    (
      await request(
        "/api/runs/" + run._id + "/cancel",
        own,
        {},
        { origin: "https://untrusted.invalid" },
      )
    ).status,
    403,
  );
  assert.equal((await fetch(origin + "/api/runs")).status, 401);
  const events = await (
    await request("/api/runs/" + run._id + "/events?cursor=5")
  ).text();
  assert(!events.includes("id: 1\n"));
  assert(events.includes("id: 6\n"));
  assert(events.includes("event: done"));
  passed("real HTTP ownership / CSRF / SSE cursor resume");

  // Only exercise the failure route with an invalid synthetic connection.
  // Empty capability bindings must fail before any real MCP/model call.
  assert.equal(c.BINANCE_TOOL_BINDINGS_JSON, "{}");
  await connections.updateOne(
    { _id: own },
    { $set: { expiresAt: Date.now() + 600000 } },
  );
  const workflowInput = input();
  const submitted = await request("/api/runs", own, workflowInput);
  assert.equal(submitted.status, 202);
  const accepted = (await submitted.json()) as { runId: string };
  const deadline = Date.now() + 45000;
  let durable = await getRun(accepted.runId);
  while (
    ["queued", "running"].includes(durable.status) &&
    Date.now() < deadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    durable = await getRun(accepted.runId);
  }
  assert.equal(durable.status, "failed");
  assert.equal(durable.error?.code, "MCP_CAPABILITY_UNCONFIGURED");
  assert.equal(durable.modelCalls, 0);
  assert.equal(durable.toolCalls, 0);
  const retried = (await (
    await request("/api/runs", own, workflowInput)
  ).json()) as { runId: string };
  assert.equal(retried.runId, accepted.runId);
  assert.equal((await getRun(retried.runId)).workflowId, durable.workflowId);
  passed(
    "real durable Workflow failure recovery without fake market/model success",
  );
  console.log(
    JSON.stringify({
      status: "passed",
      checks,
      realFinancialDataVerified: false,
    }),
  );
} catch (e) {
  console.error(
    JSON.stringify({
      status: "failed",
      checks,
      error: publicError(e),
      assertion: e instanceof assert.AssertionError ? e.message : undefined,
    }),
  );
  process.exitCode = 1;
} finally {
  try {
    const db = await database();
    for (const name of [
      "runs",
      "sessions",
      "messages",
      "artifacts",
      "memories",
      "oauth_states",
    ])
      await db.collection(name).deleteMany({ ownerId: { $in: ownedIds } });
    await db
      .collection<{ _id: string }>("connections")
      .deleteMany({ _id: { $in: ownedIds } });
    const cache = await redis();
    await cache.del([
      redisKey("rate:integration:" + own),
      redisKey("lease:integration:" + own),
      redisKey(
        "rate:runs:" + own + ":" + new Date().toISOString().slice(0, 10),
      ),
      redisKey("lease:create:" + own),
    ]);
  } catch {
    console.error(
      "Fixture cleanup could not reach a dependency; no broad deletion attempted.",
    );
  }
  await Promise.allSettled([closeDatabase(), closeRedis()]);
}
