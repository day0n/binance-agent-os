import { randomUUID } from "node:crypto";
import type {
  AgentRole,
  AnalysisReport,
  RunEvent,
  RunInput,
  RunStatus,
} from "@/domain/contracts";
import { terminalStatuses } from "@/domain/contracts";
import { AppError, publicError } from "@/domain/errors";
import { config } from "@/platform/config";
import { sha256 } from "@/platform/crypto";
import { database } from "./mongo";
import { notifyRun } from "./redis";

type StoredEvent = Omit<RunEvent, "id"> & { key: string };
export type RunRecord = {
  _id: string;
  ownerId: string;
  clientRequestId: string;
  sessionId: string;
  inputHash: string;
  input: RunInput;
  status: RunStatus;
  createdAt: string;
  finishedAt?: string;
  deadlineAt: string;
  workflowId?: string;
  dispatchStartedAt?: string;
  events: StoredEvent[];
  modelCalls: number;
  toolCalls: number;
  tokens: number;
  reportId?: string;
  error?: ReturnType<typeof publicError>;
};
export type SessionRecord = {
  _id: string;
  ownerId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};
export type ArtifactRecord = {
  _id: string;
  ownerId: string;
  runId: string;
  kind: string;
  data: unknown;
  createdAt: string;
};
type Memory = {
  _id: string;
  ownerId: string;
  symbol: string;
  summary: string;
  availableAt: string;
  runId: string;
};

export async function createRun(
  ownerId: string,
  input: RunInput,
  beforeCreate?: () => Promise<void>,
) {
  const db = await database();
  const runs = db.collection<RunRecord>("runs");
  const inputHash = sha256(input);
  const existing = await runs.findOne({
    ownerId,
    clientRequestId: input.clientRequestId,
  });
  if (existing) {
    if (existing.inputHash !== inputHash)
      throw new AppError(
        "IDEMPOTENCY_CONFLICT",
        "相同请求标识不能用于不同参数。",
        409,
      );
    return { run: existing, created: false };
  }
  const active = await runs.countDocuments({
    ownerId,
    status: { $in: ["queued", "running"] },
    deadlineAt: { $gt: new Date().toISOString() },
  });
  if (active >= 2)
    throw new AppError(
      "CONCURRENCY_LIMIT",
      "最多同时运行两个任务，请等待或取消已有任务。",
      429,
    );
  const sessionId = input.sessionId ?? randomUUID();
  const now = new Date().toISOString();
  if (
    input.sessionId &&
    !(await db
      .collection<SessionRecord>("sessions")
      .findOne({ _id: sessionId, ownerId }))
  )
    throw new AppError("NOT_FOUND", "会话不存在。", 404);
  // Charge only new requests, before creating any durable record. A rejected quota
  // cannot leave a queued run that an identical request could dispatch later.
  await beforeCreate?.();
  await db.collection<SessionRecord>("sessions").updateOne(
    { _id: sessionId, ownerId },
    {
      $set: { updatedAt: now },
      $setOnInsert: { title: input.prompt.slice(0, 60), createdAt: now },
    },
    { upsert: !input.sessionId },
  );
  const run: RunRecord = {
    _id: randomUUID(),
    ownerId,
    clientRequestId: input.clientRequestId,
    inputHash,
    sessionId,
    input,
    status: "queued",
    createdAt: now,
    deadlineAt: new Date(
      Date.now() + config().RUN_TIMEOUT_SECONDS * 1000,
    ).toISOString(),
    events: [],
    modelCalls: 0,
    toolCalls: 0,
    tokens: 0,
  };
  await runs.insertOne(run);
  await db
    .collection<{
      _id: string;
      ownerId: string;
      sessionId: string;
      role: string;
      content: string;
      createdAt: string;
    }>("messages")
    .updateOne(
      { _id: `${run._id}:user` },
      {
        $setOnInsert: {
          ownerId,
          sessionId,
          role: "user",
          content: input.prompt,
          createdAt: now,
        },
      },
      { upsert: true },
    );
  return { run, created: true };
}
export async function getRun(runId: string, ownerId?: string) {
  const run = await (await database())
    .collection<RunRecord>("runs")
    .findOne({ _id: runId, ...(ownerId ? { ownerId } : {}) });
  if (!run) throw new AppError("NOT_FOUND", "任务不存在。", 404);
  return run;
}
export async function assertActive(runId: string) {
  const run = await getRun(runId);
  if (run.status === "cancelled")
    throw new AppError("CANCELLED", "任务已取消。", 409);
  if (terminalStatuses.includes(run.status))
    throw new AppError("RUN_TERMINAL", "任务已经结束。", 409);
  if (Date.now() > Date.parse(run.deadlineAt))
    throw new AppError("RUN_TIMEOUT", "任务已达到时间上限。", 408);
  return run;
}
export async function claimDispatch(runId: string) {
  const result = await (await database())
    .collection<RunRecord>("runs")
    .updateOne(
      { _id: runId, status: "queued", dispatchStartedAt: { $exists: false } },
      { $set: { dispatchStartedAt: new Date().toISOString() } },
    );
  return result.modifiedCount === 1;
}
export async function bindWorkflow(runId: string, workflowId: string) {
  await (await database())
    .collection<RunRecord>("runs")
    .updateOne(
      { _id: runId, workflowId: { $exists: false } },
      { $set: { workflowId } },
    );
}
export async function startRun(runId: string) {
  await assertActive(runId);
  await (await database())
    .collection<RunRecord>("runs")
    .updateOne(
      { _id: runId, status: "queued" },
      { $set: { status: "running" } },
    );
  await emit(runId, "start", {
    type: "run.started",
    message: "任务开始，正在检查连接和数据能力。",
  });
}
export async function emit(
  runId: string,
  key: string,
  event: Omit<RunEvent, "id" | "runId" | "at">,
) {
  // Atomic array append is also the event ordering authority. No reserved-sequence gaps.
  await (await database()).collection<RunRecord>("runs").updateOne(
    {
      _id: runId,
      "events.key": { $ne: key },
      status: { $in: ["queued", "running"] },
    },
    {
      $push: {
        events: { ...event, key, runId, at: new Date().toISOString() },
      },
    },
  );
  await notifyRun(runId).catch(() => undefined);
}
export function eventsAfter(run: RunRecord, cursor: number): RunEvent[] {
  return run.events.slice(cursor).map(({ key, ...e }, i) => {
    void key;
    return { ...e, id: String(cursor + i + 1) };
  });
}
export async function reserveCall(runId: string, type: "model" | "tool") {
  await assertActive(runId);
  const c = config();
  const field = type === "model" ? "modelCalls" : "toolCalls";
  const max = type === "model" ? c.RUN_MAX_MODEL_CALLS : c.RUN_MAX_TOOL_CALLS;
  const r = await (await database()).collection<RunRecord>("runs").updateOne(
    {
      _id: runId,
      status: "running",
      [field]: { $lt: max },
      tokens: { $lt: c.RUN_MAX_TOKENS },
    },
    { $inc: { [field]: 1 } },
  );
  if (!r.modifiedCount)
    throw new AppError(
      "BUDGET_EXHAUSTED",
      "任务已达到模型、工具或 token 预算上限。",
      422,
    );
}
export async function recordUsage(runId: string, tokens: number) {
  await (await database())
    .collection<RunRecord>("runs")
    .updateOne({ _id: runId }, { $inc: { tokens } });
}
export function artifactId(runId: string, key: string) {
  return sha256(`${runId}:${key}`);
}
export async function putArtifact(
  runId: string,
  key: string,
  kind: string,
  data: unknown,
) {
  const run = await assertActive(runId);
  const id = artifactId(runId, key);
  await (await database()).collection<ArtifactRecord>("artifacts").updateOne(
    { _id: id },
    {
      $setOnInsert: {
        ownerId: run.ownerId,
        runId,
        kind,
        data,
        createdAt: new Date().toISOString(),
      },
    },
    { upsert: true },
  );
  return id;
}
export async function cachedArtifact<T>(
  runId: string,
  key: string,
): Promise<T | null> {
  const result = await (await database())
    .collection<ArtifactRecord>("artifacts")
    .findOne({ _id: artifactId(runId, key), runId });
  return result ? (result.data as T) : null;
}
export async function getArtifact<T>(id: string, ownerId: string): Promise<T> {
  const result = await (await database())
    .collection<ArtifactRecord>("artifacts")
    .findOne({ _id: id, ownerId });
  if (!result) throw new AppError("NOT_FOUND", "分析产物不存在。", 404);
  return result.data as T;
}
export async function finishRun(runId: string, report: AnalysisReport) {
  const current = await getRun(runId);
  if (current.status === "completed") return;
  const run = await assertActive(runId);
  const reportId = await putArtifact(runId, "report", "report", report);
  const now = new Date().toISOString();
  const db = await database();
  // Idempotent secondary writes precede the final status CAS. Reads expose these
  // records only when their parent run is completed, so cancellation wins safely.
  await db
    .collection<{
      _id: string;
      ownerId: string;
      sessionId: string;
      runId: string;
      role: string;
      content: string;
      createdAt: string;
    }>("messages")
    .updateOne(
      { _id: `${runId}:assistant` },
      {
        $setOnInsert: {
          ownerId: run.ownerId,
          sessionId: run.sessionId,
          runId,
          role: "assistant",
          content: report.summary,
          createdAt: now,
        },
      },
      { upsert: true },
    );
  if (run.input.mode !== "portfolio")
    await db.collection<Memory>("memories").updateOne(
      { _id: runId },
      {
        $setOnInsert: {
          ownerId: run.ownerId,
          symbol: run.input.symbol,
          runId,
          summary: report.summary.slice(0, 2000),
          availableAt: now,
        },
      },
      { upsert: true },
    );
  await assertActive(runId);
  const r = await db.collection<RunRecord>("runs").updateOne(
    { _id: runId, status: "running" },
    {
      $set: { status: "completed", reportId, finishedAt: now },
      $push: {
        events: {
          key: "finish",
          runId,
          type: "run.completed",
          at: now,
          message: "分析完成，报告与证据已保存。",
          artifactId: reportId,
        },
      },
    },
  );
  if (!r.modifiedCount) return;
  await notifyRun(runId).catch(() => undefined);
}
export async function terminateRun(
  runId: string,
  status: "failed" | "cancelled",
  error?: unknown,
) {
  const now = new Date().toISOString();
  const safe = error ? publicError(error) : undefined;
  await (await database()).collection<RunRecord>("runs").updateOne(
    { _id: runId, status: { $in: ["queued", "running"] } },
    {
      $set: { status, finishedAt: now, ...(safe ? { error: safe } : {}) },
      $push: {
        events: {
          key: status,
          runId,
          type: status === "cancelled" ? "run.cancelled" : "run.failed",
          at: now,
          message:
            status === "cancelled"
              ? "任务已取消。已发出的外部请求可能仍需等待超时。"
              : (safe?.message ?? "任务失败。"),
        },
      },
    },
  );
}
export async function recall(ownerId: string, symbol: string, asOf: string) {
  return (await database())
    .collection<Memory>("memories")
    .aggregate<{ summary: string; availableAt: string }>([
      { $match: { ownerId, symbol, availableAt: { $lte: asOf } } },
      { $sort: { availableAt: -1 } },
      {
        $lookup: {
          from: "runs",
          localField: "runId",
          foreignField: "_id",
          as: "run",
        },
      },
      {
        $match: {
          "run.status": "completed",
          "run.finishedAt": { $lte: asOf },
          "run.ownerId": ownerId,
        },
      },
      { $limit: 3 },
      { $project: { _id: 0, summary: 1, availableAt: 1 } },
    ])
    .toArray();
}
export async function recordNode(
  runId: string,
  role: AgentRole,
  findingId: string,
  durationMs: number,
) {
  await emit(runId, `${findingId}:done`, {
    type: "agent.completed",
    role,
    message: `${role} 节点完成`,
    artifactId: findingId,
    durationMs,
  });
}
