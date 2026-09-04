import { start } from "workflow/api";
import { z } from "zod";
import {
  assertSessionCanStart,
  assertUserRunBudget,
  isBareConfirmText,
  sessionTitleFrom,
} from "@/domain/chat";
import { AppError } from "@/domain/errors";
import { sha256 } from "@/platform/crypto";
import { config } from "@/platform/config";
import { rateLimit, withSessionRunLock } from "@/adapters/persistence/redis";
import {
  appendSessionEvent,
  bindChatWorkflow,
  claimChatDispatch,
  countActiveChatRuns,
  createChatRun,
  createChatSession,
  defaultTitle,
  deleteChatSession,
  findMessageByRequestId,
  finishChatRun,
  getChatRun,
  getChatSession,
  insertChatMessage,
  listChatMessages,
  listChatSessions,
  listSessionEvents,
  patchChatSession,
  sessionHasActiveRun,
} from "@/adapters/persistence/chat-store";
import { chatWorkflow } from "@/workflows/chat";

const messageBodySchema = z
  .object({
    sessionId: z.string().uuid().optional(),
    content: z.string().trim().min(1).max(4000),
    requestId: z.string().uuid(),
  })
  .strict();

export function parseChatMessageBody(input: unknown) {
  const parsed = messageBodySchema.safeParse(input);
  if (!parsed.success)
    throw new AppError("INVALID_INPUT", "请检查会话、内容和请求标识。", 422);
  return parsed.data;
}

export async function sendChatMessage(userId: string, input: unknown) {
  const body = parseChatMessageBody(input);
  await rateLimit(
    `chat:${userId}:${new Date().toISOString().slice(0, 10)}`,
    config().OWNER_DAILY_RUN_LIMIT,
    90000,
  );
  const existing = await findMessageByRequestId(userId, body.requestId);
  if (existing) {
    const run = existing.runId ? await getChatRun(existing.runId, userId) : null;
    return {
      sessionId: existing.sessionId,
      messageId: existing.id,
      runId: existing.runId,
      status: run?.status ?? "completed",
      reused: true,
    };
  }
  return withSessionRunLock(userId, body.sessionId ?? body.requestId, async () => {
    const session = body.sessionId
      ? await getChatSession(body.sessionId, userId)
      : await createChatSession(userId, sessionTitleFrom(body.content));
    if (body.sessionId && (await sessionHasActiveRun(session.id, userId)))
      assertSessionCanStart(true);
    assertUserRunBudget(await countActiveChatRuns(userId));
    const { run, created } = await createChatRun({
      userId,
      sessionId: session.id,
      requestId: body.requestId,
      inputHash: sha256({ content: body.content }),
      content: body.content,
    });
    const message = await insertChatMessage({
      sessionId: session.id,
      userId,
      role: "user",
      content: body.content,
      requestId: body.requestId,
      runId: run.id,
      artifactIds: [],
    });
    if (!session.title || session.title === "新对话")
      await patchChatSession(session.id, userId, {
        title: defaultTitle(body.content),
      });
    await appendSessionEvent(session.id, userId, "message.created", {
      messageId: message.id,
      role: "user",
    });
    if (created && (await claimChatDispatch(run.id))) {
      try {
        const workflow = await start(chatWorkflow, [run.id]);
        await bindChatWorkflow(run.id, workflow.runId);
      } catch {
        await finishChatRun(run.id, "failed", {
          error: {
            code: "DISPATCH_FAILED",
            message: "工作流启动未确认，请使用新的请求重试。",
            retryable: true,
          },
        });
        throw new AppError(
          "DISPATCH_FAILED",
          "工作流启动未确认，请重新发送。",
          503,
          true,
        );
      }
    }
    await appendSessionEvent(session.id, userId, "run.started", {
      runId: run.id,
      confirmTextIgnored: isBareConfirmText(body.content),
    });
    return {
      sessionId: session.id,
      messageId: message.id,
      runId: run.id,
      status: run.status,
      reused: !created,
    };
  });
}

export {
  listChatSessions,
  getChatSession,
  patchChatSession,
  deleteChatSession,
  listChatMessages,
  listSessionEvents,
  getChatRun,
};
