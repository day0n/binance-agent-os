import { randomUUID } from "node:crypto";
import type {
  ChatMessage,
  ChatRun,
  ChatSession,
  SessionEvent,
  SessionEventType,
} from "@/domain/chat";
import { sessionTitleFrom } from "@/domain/chat";
import { AppError } from "@/domain/errors";
import { config } from "@/platform/config";
import { database } from "./mongo";
import { notifySession } from "./redis";

export type ChatSessionDoc = Omit<ChatSession, "id"> & { _id: string };
export type ChatMessageDoc = Omit<ChatMessage, "id"> & { _id: string };
export type ChatRunDoc = Omit<ChatRun, "id"> & { _id: string };
export type SessionEventDoc = SessionEvent & { _id: string };

function sessionOf(doc: ChatSessionDoc): ChatSession {
  return { ...doc, id: doc._id };
}
function messageOf(doc: ChatMessageDoc): ChatMessage {
  return { ...doc, id: doc._id };
}
function runOf(doc: ChatRunDoc): ChatRun {
  return { ...doc, id: doc._id };
}

export async function createChatSession(userId: string, title?: string) {
  const now = new Date();
  const doc: ChatSessionDoc = {
    _id: randomUUID(),
    userId,
    title: title || "新对话",
    eventSeq: 0,
    createdAt: now,
    updatedAt: now,
  };
  await (await database()).collection<ChatSessionDoc>("chat_sessions").insertOne(doc);
  return sessionOf(doc);
}

export async function listChatSessions(userId: string) {
  return (
    await (await database())
      .collection<ChatSessionDoc>("chat_sessions")
      .find({ userId, deletedAt: { $exists: false } })
      .sort({ updatedAt: -1 })
      .limit(100)
      .toArray()
  ).map(sessionOf);
}

export async function getChatSession(id: string, userId: string) {
  const doc = await (await database())
    .collection<ChatSessionDoc>("chat_sessions")
    .findOne({ _id: id, userId, deletedAt: { $exists: false } });
  if (!doc) throw new AppError("NOT_FOUND", "会话不存在。", 404);
  return sessionOf(doc);
}

export async function patchChatSession(
  id: string,
  userId: string,
  patch: { title?: string },
) {
  const title = patch.title?.replace(/\s+/g, " ").trim().slice(0, 80);
  const result = await (
    await database()
  )
    .collection<ChatSessionDoc>("chat_sessions")
    .findOneAndUpdate(
      { _id: id, userId, deletedAt: { $exists: false } },
      { $set: { ...(title ? { title } : {}), updatedAt: new Date() } },
      { returnDocument: "after" },
    );
  if (!result) throw new AppError("NOT_FOUND", "会话不存在。", 404);
  return sessionOf(result);
}

export async function deleteChatSession(id: string, userId: string) {
  const result = await (
    await database()
  )
    .collection<ChatSessionDoc>("chat_sessions")
    .updateOne(
      { _id: id, userId, deletedAt: { $exists: false } },
      { $set: { deletedAt: new Date(), updatedAt: new Date() } },
    );
  if (!result.matchedCount) throw new AppError("NOT_FOUND", "会话不存在。", 404);
}

export async function findMessageByRequestId(userId: string, requestId: string) {
  const doc = await (await database())
    .collection<ChatMessageDoc>("chat_messages")
    .findOne({ userId, requestId });
  return doc ? messageOf(doc) : null;
}

export async function insertChatMessage(
  input: Omit<ChatMessage, "id" | "createdAt">,
) {
  const doc: ChatMessageDoc = {
    _id: randomUUID(),
    ...input,
    createdAt: new Date(),
  };
  await (await database()).collection<ChatMessageDoc>("chat_messages").insertOne(doc);
  return messageOf(doc);
}

export async function listChatMessages(sessionId: string, userId: string) {
  await getChatSession(sessionId, userId);
  return (
    await (await database())
      .collection<ChatMessageDoc>("chat_messages")
      .find({ sessionId, userId })
      .sort({ createdAt: 1 })
      .limit(500)
      .toArray()
  ).map(messageOf);
}

export async function recentChatMessages(
  sessionId: string,
  userId: string,
  limit = 12,
) {
  const docs = await (
    await database()
  )
    .collection<ChatMessageDoc>("chat_messages")
    .find({ sessionId, userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return docs.reverse().map(messageOf);
}

export async function appendSessionEvent(
  sessionId: string,
  userId: string,
  type: SessionEventType,
  publicPayload: unknown,
) {
  const db = await database();
  const updated = await db.collection<ChatSessionDoc>("chat_sessions").findOneAndUpdate(
    { _id: sessionId, userId, deletedAt: { $exists: false } },
    { $inc: { eventSeq: 1 }, $set: { updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!updated) throw new AppError("NOT_FOUND", "会话不存在。", 404);
  const event: SessionEventDoc = {
    _id: `${sessionId}:${updated.eventSeq}`,
    sessionId,
    seq: updated.eventSeq,
    type,
    publicPayload,
    createdAt: new Date(),
  };
  await db.collection<SessionEventDoc>("session_events").insertOne(event);
  await notifySession(sessionId).catch(() => undefined);
  return event;
}

export async function listSessionEvents(
  sessionId: string,
  userId: string,
  afterSeq: number,
) {
  await getChatSession(sessionId, userId);
  return (
    await (await database())
      .collection<SessionEventDoc>("session_events")
      .find({ sessionId, seq: { $gt: afterSeq } })
      .sort({ seq: 1 })
      .limit(200)
      .toArray()
  ).map(({ _id, ...event }) => {
    void _id;
    return event;
  });
}

export async function createChatRun(input: {
  userId: string;
  sessionId: string;
  requestId: string;
  inputHash: string;
  content: string;
}) {
  const existing = await (await database())
    .collection<ChatRunDoc>("chat_runs")
    .findOne({ userId: input.userId, requestId: input.requestId });
  if (existing) {
    if (existing.inputHash !== input.inputHash)
      throw new AppError(
        "IDEMPOTENCY_CONFLICT",
        "相同请求标识不能用于不同内容。",
        409,
      );
    return { run: runOf(existing), created: false };
  }
  const now = new Date();
  const doc: ChatRunDoc = {
    _id: randomUUID(),
    ...input,
    status: "queued",
    createdAt: now,
    deadlineAt: new Date(now.getTime() + config().RUN_TIMEOUT_SECONDS * 1000),
  };
  await (await database()).collection<ChatRunDoc>("chat_runs").insertOne(doc);
  await (
    await database()
  )
    .collection<ChatSessionDoc>("chat_sessions")
    .updateOne(
      { _id: input.sessionId, userId: input.userId },
      { $set: { activeRunId: doc._id, updatedAt: now } },
    );
  return { run: runOf(doc), created: true };
}

export async function getChatRun(runId: string, userId?: string) {
  const doc = await (await database())
    .collection<ChatRunDoc>("chat_runs")
    .findOne({ _id: runId, ...(userId ? { userId } : {}) });
  if (!doc) throw new AppError("NOT_FOUND", "任务不存在。", 404);
  return runOf(doc);
}

export async function countActiveChatRuns(userId: string) {
  return (await database())
    .collection<ChatRunDoc>("chat_runs")
    .countDocuments({
      userId,
      status: { $in: ["queued", "running"] },
      deadlineAt: { $gt: new Date() },
    });
}

export async function sessionHasActiveRun(sessionId: string, userId: string) {
  const session = await getChatSession(sessionId, userId);
  if (!session.activeRunId) return false;
  const run = await (await database())
    .collection<ChatRunDoc>("chat_runs")
    .findOne({
      _id: session.activeRunId,
      userId,
      status: { $in: ["queued", "running"] },
      deadlineAt: { $gt: new Date() },
    });
  return Boolean(run);
}

export async function claimChatDispatch(runId: string) {
  const result = await (
    await database()
  )
    .collection<ChatRunDoc>("chat_runs")
    .updateOne(
      { _id: runId, status: "queued", dispatchStartedAt: { $exists: false } },
      { $set: { dispatchStartedAt: new Date() } },
    );
  return result.modifiedCount === 1;
}

export async function bindChatWorkflow(runId: string, workflowId: string) {
  await (
    await database()
  )
    .collection<ChatRunDoc>("chat_runs")
    .updateOne(
      { _id: runId, workflowId: { $exists: false } },
      { $set: { workflowId } },
    );
}

export async function startChatRun(runId: string) {
  await (
    await database()
  )
    .collection<ChatRunDoc>("chat_runs")
    .updateOne({ _id: runId, status: "queued" }, { $set: { status: "running" } });
}

export async function finishChatRun(
  runId: string,
  status: "completed" | "failed" | "cancelled",
  extra?: Partial<ChatRunDoc>,
) {
  const run = await getChatRun(runId);
  await (
    await database()
  )
    .collection<ChatRunDoc>("chat_runs")
    .updateOne(
      { _id: runId, status: { $in: ["queued", "running"] } },
      {
        $set: {
          status,
          finishedAt: new Date(),
          ...extra,
        },
      },
    );
  await (
    await database()
  )
    .collection<ChatSessionDoc>("chat_sessions")
    .updateOne(
      { _id: run.sessionId, userId: run.userId, activeRunId: runId },
      { $unset: { activeRunId: "" }, $set: { updatedAt: new Date() } },
    );
}

export async function updateChatRun(runId: string, set: Partial<ChatRunDoc>) {
  await (
    await database()
  )
    .collection<ChatRunDoc>("chat_runs")
    .updateOne({ _id: runId }, { $set: set });
}

export async function updateSessionSummary(
  sessionId: string,
  userId: string,
  summary: string,
) {
  await (
    await database()
  )
    .collection<ChatSessionDoc>("chat_sessions")
    .updateOne(
      { _id: sessionId, userId },
      { $set: { summary: summary.slice(0, 2000), updatedAt: new Date() } },
    );
}

export function defaultTitle(content: string) {
  return sessionTitleFrom(content);
}
