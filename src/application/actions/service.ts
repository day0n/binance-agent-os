import { start } from "workflow/api";
import { actionConfirmBodySchema } from "@/domain/actions";
import { AppError } from "@/domain/errors";
import { PASSWORD_CONFIRM_RATE } from "@/domain/auth";
import { sha256 } from "@/platform/crypto";
import { verifyPassword } from "@/application/auth/password";
import { findUserById } from "@/adapters/persistence/auth-store";
import { rateLimit } from "@/adapters/persistence/redis";
import {
  casActionStatus,
  getAction,
  insertConfirmation,
} from "@/adapters/persistence/action-store";
import { confirmationTtlMs } from "@/domain/actions";
import { appendSessionEvent } from "@/adapters/persistence/chat-store";
import { config } from "@/platform/config";
import { actionWorkflow } from "@/workflows/action";

export async function readAction(actionId: string, userId: string) {
  const action = await getAction(actionId, userId);
  if (action.status === "awaiting_confirmation" && action.expiresAt < new Date())
    return casActionStatus(actionId, userId, "awaiting_confirmation", "expired");
  return action;
}

export async function rejectAction(actionId: string, userId: string) {
  const action = await casActionStatus(
    actionId,
    userId,
    "awaiting_confirmation",
    "rejected",
  );
  await appendSessionEvent(action.sessionId, userId, "action.updated", {
    actionId,
    status: "rejected",
  });
  return action;
}

export async function confirmAction(
  actionId: string,
  userId: string,
  body: unknown,
) {
  const parsed = actionConfirmBodySchema.safeParse(body);
  if (!parsed.success)
    throw new AppError("INVALID_INPUT", "请提供提案指纹和当前密码。", 422);
  await rateLimit(
    `password:${userId}`,
    PASSWORD_CONFIRM_RATE.limit,
    PASSWORD_CONFIRM_RATE.seconds,
  );
  const action = await readAction(actionId, userId);
  if (action.status === "expired")
    throw new AppError("ACTION_EXPIRED", "提案已过期，请重新生成。", 409);
  if (!action.proposal || !action.proposalHash)
    throw new AppError("ACTION_STATE", "动作尚未形成可确认预览。", 409);
  if (sha256(action.proposal) !== parsed.data.proposalHash)
    throw new AppError("PROPOSAL_MISMATCH", "提案已被修改或已过期。", 403);
  if (action.proposalHash !== parsed.data.proposalHash)
    throw new AppError("PROPOSAL_MISMATCH", "提案指纹不匹配。", 403);
  const user = await findUserById(userId);
  if (!user)
    throw new AppError("AUTH_FAILED", "用户名或密码不正确。", 401);
  const ok = await verifyPassword(
    parsed.data.password,
    user.passwordHash,
    user.passwordSalt,
    config().AUTH_PEPPER,
  );
  if (!ok) throw new AppError("AUTH_FAILED", "用户名或密码不正确。", 401);
  const confirmed = await casActionStatus(
    actionId,
    userId,
    "awaiting_confirmation",
    "confirmed",
  );
  await insertConfirmation({
    userId,
    actionId,
    proposalHash: parsed.data.proposalHash,
    expiresAt: new Date(Date.now() + confirmationTtlMs),
  });
  await appendSessionEvent(confirmed.sessionId, userId, "action.updated", {
    actionId,
    status: "confirmed",
  });
  const workflow = await start(actionWorkflow, [actionId, userId]);
  return { action: confirmed, workflowId: workflow.runId };
}
