import { z } from "zod";
import { AppError } from "./errors";

export const chatTaskKindSchema = z.enum([
  "general",
  "research",
  "portfolio",
  "backtest",
  "action",
]);
export type ChatTaskKind = z.infer<typeof chatTaskKindSchema>;

export const sessionTitleMax = 28;
export const maxParallelUserRuns = 2;

export type ChatSession = {
  id: string;
  userId: string;
  title: string;
  summary?: string;
  activeRunId?: string;
  eventSeq: number;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type ChatMessage = {
  id: string;
  sessionId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  taskKind?: ChatTaskKind;
  runId?: string;
  artifactIds: string[];
  requestId?: string;
  createdAt: Date;
};

export const sessionEventTypeSchema = z.enum([
  "message.created",
  "run.started",
  "agent.status",
  "tool.started",
  "tool.completed",
  "artifact.created",
  "action.proposed",
  "action.updated",
  "run.completed",
  "run.failed",
]);
export type SessionEventType = z.infer<typeof sessionEventTypeSchema>;

export type SessionEvent = {
  sessionId: string;
  seq: number;
  type: SessionEventType;
  publicPayload: unknown;
  createdAt: Date;
};

export const intentPlanSchema = z
  .object({
    taskKind: chatTaskKindSchema,
    needsAccount: z.boolean(),
    needsClarification: z.boolean(),
    clarificationQuestions: z.array(z.string().min(1).max(200)).max(5),
    nodes: z.array(z.string().min(1).max(40)).max(12),
    budget: z
      .object({
        maxModelCalls: z.number().int().min(1).max(60),
        maxToolCalls: z.number().int().min(1).max(100),
      })
      .strict(),
    symbol: z
      .string()
      .regex(/^[A-Z0-9]{2,15}USDT$/)
      .optional(),
    interval: z.enum(["1h", "4h", "1d"]).optional(),
    missingFields: z.array(z.string().min(1).max(40)).max(12).default([]),
  })
  .strict();
export type IntentPlan = z.infer<typeof intentPlanSchema>;

export type ChatRun = {
  id: string;
  userId: string;
  sessionId: string;
  requestId: string;
  inputHash: string;
  content: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  taskKind?: ChatTaskKind;
  researchRunId?: string;
  actionId?: string;
  workflowId?: string;
  dispatchStartedAt?: Date;
  error?: { code: string; message: string; retryable: boolean };
  createdAt: Date;
  finishedAt?: Date;
  deadlineAt: Date;
};

export function sessionTitleFrom(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.slice(0, sessionTitleMax) || "新对话";
}

export function isBareConfirmText(content: string) {
  return /^(确认|confirm|yes|ok|okay)$/i.test(content.trim());
}

export function assertSessionCanStart(activeOnSession: boolean) {
  if (activeOnSession)
    throw new AppError(
      "SESSION_BUSY",
      "当前会话已有进行中的任务，请等待完成或取消后再发送。",
      409,
    );
}

export function assertUserRunBudget(activeCount: number) {
  if (activeCount >= maxParallelUserRuns)
    throw new AppError(
      "CONCURRENCY_LIMIT",
      "最多同时运行两个会话任务，请等待或取消已有任务。",
      429,
    );
}
