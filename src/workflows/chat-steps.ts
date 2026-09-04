import { z } from "zod";
import { FatalError } from "workflow";
import { AppError, publicError } from "@/domain/errors";
import { intentPlanSchema, isBareConfirmText, type IntentPlan } from "@/domain/chat";
import { actionDraftSchema } from "@/domain/actions";
import { runInputSchema } from "@/domain/contracts";
import { config } from "@/platform/config";
import { ProviderRouter } from "@/adapters/llm/providers";
import { buildAgent } from "@/application/agents/blueprints";
import { chatModelContext } from "@/application/chat/context";
import {
  heuristicIntent,
  mergeIntent,
  publicStatusMessage,
  researchParamsFromChat,
  shouldSkipModelClassify,
} from "@/application/chat/router";
import {
  assertDraftLimits,
  missingActionFields,
  parseActionDraft,
} from "@/application/chat/action-planner";
import {
  appendSessionEvent,
  finishChatRun,
  getChatRun,
  getChatSession,
  insertChatMessage,
  recentChatMessages,
  startChatRun,
  updateChatRun,
  updateSessionSummary,
} from "@/adapters/persistence/chat-store";
import {
  insertAction,
  reserveDailyQuota,
  getDailyLedger,
  settleDailyQuota,
} from "@/adapters/persistence/action-store";
import { findConnection } from "@/adapters/persistence/connection-store";
import { fetchBookTicker } from "@/adapters/binance/public-rest";
import { createRun, getArtifact } from "@/adapters/persistence/store";
import type { AnalysisReport } from "@/domain/contracts";
import { proposalTtlMs } from "@/domain/actions";
import { quotaForKind } from "@/application/finance/action-policy";
import {
  hashProposal,
  inferEnvironment,
  newClientOrderId,
  orderTypeOf,
} from "@/application/actions/proposal";

function fail(error: unknown): never {
  const safe = publicError(error);
  throw new FatalError(JSON.stringify(safe));
}

export async function classifyChatStep(runId: string) {
  "use step";
  try {
    const run = await getChatRun(runId);
    await startChatRun(runId);
    const session = await getChatSession(run.sessionId, run.userId);
    const fallback = heuristicIntent(run.content);
    let plan = fallback;
    if (!shouldSkipModelClassify(run.content, fallback)) {
      try {
        const messages = await recentChatMessages(run.sessionId, run.userId, 8);
        const agent = buildAgent("supervisor");
        const turn = await ProviderRouter.get("gemini", "supervisor").turn(
          agent.system,
          [
            {
              role: "user",
              content: JSON.stringify(
                chatModelContext({
                  messages,
                  summary: session.summary,
                }),
              ),
            },
          ],
          [
            {
              name: "submit_intent",
              description: "提交结构化意图。缺少交易参数时必须追问。",
              inputSchema: z.toJSONSchema(intentPlanSchema),
            },
          ],
          true,
        );
        const submitted = turn.calls.find((call) => call.name === "submit_intent");
        plan = mergeIntent(submitted?.args, fallback);
      } catch (error) {
        const safe = publicError(error);
        if (safe.code === "MODEL_UNCONFIGURED") throw error;
        plan = fallback;
      }
    }
    if (isBareConfirmText(run.content))
      plan = heuristicIntent(run.content);
    await updateChatRun(runId, { taskKind: plan.taskKind });
    await appendSessionEvent(run.sessionId, run.userId, "agent.status", {
      message: publicStatusMessage(plan),
      taskKind: plan.taskKind,
    });
    return { plan, content: run.content, confirm: isBareConfirmText(run.content) };
  } catch (error) {
    fail(error);
  }
}

async function writeAssistantReply(
  runId: string,
  content: string,
  extras?: { actionId?: string; artifactIds?: string[] },
) {
  const run = await getChatRun(runId);
  const message = await insertChatMessage({
    sessionId: run.sessionId,
    userId: run.userId,
    role: "assistant",
    content,
    taskKind: run.taskKind,
    runId,
    artifactIds: extras?.artifactIds ?? [],
  });
  await appendSessionEvent(run.sessionId, run.userId, "message.created", {
    messageId: message.id,
    role: "assistant",
    actionId: extras?.actionId,
  });
  await updateSessionSummary(run.sessionId, run.userId, content);
  await finishChatRun(runId, "completed");
  await appendSessionEvent(run.sessionId, run.userId, "run.completed", {
    runId,
  });
  return { runId, status: "completed" as const };
}

export async function replyChatStep(
  runId: string,
  content: string,
  extras?: { actionId?: string; artifactIds?: string[] },
) {
  "use step";
  try {
    return await writeAssistantReply(runId, content, extras);
  } catch (error) {
    fail(error);
  }
}

export async function startResearchFromChatStep(runId: string, plan: IntentPlan) {
  "use step";
  try {
    const run = await getChatRun(runId);
    const mode =
      plan.taskKind === "portfolio"
        ? "portfolio"
        : plan.taskKind === "backtest"
          ? "backtest"
          : "research";
    const research = researchParamsFromChat(run.content, plan);
    const input = runInputSchema.parse({
      clientRequestId: run.id,
      sessionId: run.sessionId,
      mode,
      prompt: run.content,
      symbol: research.symbol,
      interval: research.interval,
      lookbackDays: research.lookbackDays,
      debateRounds: research.debateRounds,
    });
    const created = await createRun(run.userId, input);
    await updateChatRun(runId, { researchRunId: created.run._id });
    return created.run._id;
  } catch (error) {
    fail(error);
  }
}

export async function attachResearchResultStep(
  chatRunId: string,
  researchRunId: string,
) {
  "use step";
  try {
    const run = await getChatRun(chatRunId);
    const research = await (
      await import("@/adapters/persistence/store")
    ).getRun(researchRunId, run.userId);
    if (research.status !== "completed" || !research.reportId) {
      const message =
        research.error?.message ?? "研究任务未完成，未生成模拟结果。";
      return writeAssistantReply(chatRunId, message);
    }
    const report = await getArtifact<AnalysisReport>(
      research.reportId,
      run.userId,
    );
    await appendSessionEvent(run.sessionId, run.userId, "artifact.created", {
      artifactId: research.reportId,
      kind: "report",
    });
    return writeAssistantReply(chatRunId, report.summary, {
      artifactIds: [research.reportId],
    });
  } catch (error) {
    fail(error);
  }
}

export async function proposeActionStep(runId: string, plan: IntentPlan) {
  "use step";
  try {
    const run = await getChatRun(runId);
    if (isBareConfirmText(run.content))
      return writeAssistantReply(
        runId,
        "聊天里输入“确认”不会执行任何交易或划转。请打开动作卡，核对预览后重新输入当前账号密码。",
      );
    let draft = actionDraftSchema.parse({
      kind: "spot.marketOrder",
      missingFields: plan.missingFields,
    });
    try {
      const agent = buildAgent("action");
      const turn = await ProviderRouter.get("gemini", "action").turn(
        agent.system,
        [{ role: "user", content: run.content }],
        [
          {
            name: "submit_action_draft",
            description: "提交结构化动作草案，禁止猜测缺失字段。",
            inputSchema: z.toJSONSchema(actionDraftSchema),
          },
        ],
        true,
      );
      const submitted = turn.calls.find((call) => call.name === "submit_action_draft");
      if (submitted) draft = parseActionDraft(submitted.args);
    } catch (error) {
      const safe = publicError(error);
      if (safe.code === "MODEL_UNCONFIGURED") throw error;
    }
    const missing = missingActionFields(draft);
    if (missing.length)
      return writeAssistantReply(
        runId,
        `还不能生成精确预览，缺少：${missing.join("、")}。我不会猜测这些参数。`,
      );
    const notional = assertDraftLimits(draft, config().ACTION_MAX_USDT);
    const environment = inferEnvironment(run.content);
    const connection = await findConnection(run.userId, environment, "trade");
    if (!connection)
      return writeAssistantReply(
        runId,
        `还没有 ${environment} 交易 API Key。请先在「连接」里用密码保存交易信封，网站不会假装 MCP 已连接。`,
      );
    const quota = quotaForKind(draft.kind, notional);
    let reserved = false;
    try {
      await reserveDailyQuota(
        run.userId,
        quota,
        String(config().ACTION_DAILY_MAX_USDT),
      );
      reserved = true;
      const ledger = await getDailyLedger(run.userId);
      let marketPrice: string | undefined;
      let marketPriceAt: string | undefined;
      if (draft.symbol) {
        const book = (await fetchBookTicker(draft.symbol)) as {
          bidPrice?: string;
          askPrice?: string;
        };
        marketPrice =
          draft.side === "SELL" ? book.bidPrice : book.askPrice ?? book.bidPrice;
        marketPriceAt = new Date().toISOString();
      }
      const expiresAt = new Date(Date.now() + proposalTtlMs(draft.kind));
      const proposal = {
        environment,
        apiKeyFingerprint: connection.apiKeyFingerprint,
        kind: draft.kind,
        symbol: draft.symbol,
        side: draft.side,
        orderType: orderTypeOf(draft.kind),
        timeInForce: draft.kind === "spot.limitOrder" ? ("GTC" as const) : undefined,
        quantity: draft.quantity,
        quoteOrderQty: draft.quoteOrderQty,
        price: draft.price,
        estimatedNotionalUsdt: notional,
        marketPrice,
        marketPriceAt,
        feeAssumption: "按公开费率假设，成交后以交易所实际扣费为准",
        actionQuotaUsdt: quota,
        dailyUsedUsdt: ledger.usedUsdt,
        dailyReservedUsdt: ledger.reservedUsdt,
        dailyLimitUsdt: String(config().ACTION_DAILY_MAX_USDT),
        expiresAt: expiresAt.toISOString(),
        irreversibleWarning:
          "确认后不可撤销该网络请求；成功成交或划转计入当日额度，后续撤单不返还额度。",
      };
      const proposalHash = hashProposal(proposal);
      const actionId = crypto.randomUUID();
      const action = await insertAction({
        id: actionId,
        userId: run.userId,
        sessionId: run.sessionId,
        runId,
        kind: draft.kind,
        draft,
        proposal,
        proposalHash,
        clientOrderId: newClientOrderId(actionId),
        environment,
        connectionId: connection.id,
        reservedUsdt: quota,
        expiresAt,
      });
      reserved = false;
      await updateChatRun(runId, { actionId: action.id });
      await appendSessionEvent(run.sessionId, run.userId, "action.proposed", {
        actionId: action.id,
        proposalHash,
        expiresAt: expiresAt.toISOString(),
      });
      return writeAssistantReply(
        runId,
        "已生成精确动作预览。请在动作卡核对后输入当前账号密码确认；聊天文字不能执行。",
        { actionId: action.id },
      );
    } catch (error) {
      if (reserved)
        await settleDailyQuota(run.userId, quota, false).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    fail(error);
  }
}

export async function failChatStep(runId: string, message: string) {
  "use step";
  let error = new AppError("RUN_FAILED", "任务未完成，请稍后重试。", 502);
  try {
    const parsed = z
      .object({
        code: z.string().max(80),
        message: z.string().max(800),
        retryable: z.boolean(),
      })
      .parse(JSON.parse(message));
    error = new AppError(parsed.code, parsed.message, 502, parsed.retryable);
  } catch {
    /* never echo untrusted exception text */
  }
  const run = await getChatRun(runId);
  if (run.status !== "cancelled") {
    await finishChatRun(runId, "failed", {
      error: publicError(error),
    });
    await appendSessionEvent(run.sessionId, run.userId, "run.failed", {
      runId,
      code: error.code,
    }).catch(() => undefined);
  }
  return { runId, status: "failed" as const };
}
