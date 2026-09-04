import { z } from "zod";
import { FatalError, RetryableError } from "workflow";
import { AppError, publicError } from "@/domain/errors";
import {
  findingSchema,
  type AgentFinding,
  type AgentRole,
  type AnalysisReport,
  type EvidenceRef,
  type ModelMessage,
  type ModelTurn,
  type ToolDefinition,
} from "@/domain/contracts";
import { config, modelConfig } from "@/platform/config";
import { sha256 } from "@/platform/crypto";
import { accessToken } from "@/adapters/binance/oauth";
import { fetchMarketData } from "@/adapters/binance/data-port";
import { parseBindings, type Capability } from "@/adapters/binance/mcp-policy";
import { ProviderRouter, modelError } from "@/adapters/llm/providers";
import {
  assertActive,
  artifactId,
  cachedArtifact,
  emit,
  finishRun,
  getArtifact,
  getRun,
  putArtifact,
  recall,
  recordNode,
  recordUsage,
  reserveCall,
  startRun,
  terminateRun,
} from "@/adapters/persistence/store";
import { buildAgent, planRoles } from "@/application/agents/blueprints";
import {
  acceptFindingOrRepair,
  compactContext,
  type ResearchContext,
} from "@/application/research-context";
import { ToolCatalog } from "@/application/tools/catalog";
import {
  candleWarnings,
  INTERVAL_MS,
  marketMetrics,
  parseCandles,
} from "@/domain/finance/market";
import { assessRisk, normalizePortfolio } from "@/domain/finance/risk";
import { runBacktest } from "@/domain/finance/backtest";

function fail(error: unknown): never {
  const safe = publicError(error);
  if (safe.retryable)
    throw new RetryableError(JSON.stringify(safe), { retryAfter: "3s" });
  throw new FatalError(JSON.stringify(safe));
}
type DataRequest = {
  key: string;
  capability: Capability;
  values: Record<string, string | number>;
};
type DataArtifact = { evidence: EvidenceRef; data: unknown };
type AgentState = {
  role: AgentRole;
  messages: ModelMessage[];
  contextId: string;
  startedAt: number;
  pass: number;
};
type ToolResult = {
  callId: string;
  name: string;
  result: unknown;
  finding?: AgentFinding;
};

export async function initializeStep(runId: string) {
  "use step";
  try {
    await startRun(runId);
    const run = await assertActive(runId);
    modelConfig(run.input.provider);
    if (run.input.mode === "portfolio") {
      const bindings = parseBindings(config().BINANCE_TOOL_BINDINGS_JSON);
      const hasExecutor = Boolean(config().EXECUTOR_URL);
      const hasMcp = Boolean(bindings.balances);
      if (!hasExecutor && !hasMcp)
        throw new AppError(
          "ACCOUNT_CONNECTION_REQUIRED",
          "现货账户体检需要已核验的执行器连接，或已审核的官方 MCP 映射。网站不会假装 MCP 已连接。",
          503,
        );
      if (!hasExecutor) await accessToken(run.ownerId);
    }
    const asOf = run.createdAt;
    const userEvidence: EvidenceRef = {
      id: artifactId(runId, "user-input"),
      runId,
      source: "user",
      label: "用户任务参数（非行情证据）",
      observedAt: asOf,
      asOf,
      sha256: sha256(run.input),
      parentIds: [],
      warnings: [],
    };
    await putArtifact(runId, "user-input", "evidence", {
      evidence: userEvidence,
      data: run.input,
    });
    const memory =
      run.input.mode === "portfolio"
        ? []
        : await recall(run.ownerId, run.input.symbol, asOf);
    const context: ResearchContext = {
      input: run.input,
      asOf,
      evidence: [userEvidence],
      risk: assessRisk([], [], undefined, run.input.riskPolicy),
      findings: [],
      memory,
    };
    const contextId = await putArtifact(
      runId,
      "context:initial",
      "context",
      context,
    );
    const requests: DataRequest[] = [];
    if (run.input.mode === "portfolio")
      requests.push(
        { key: "balances", capability: "balances", values: {} },
        { key: "prices", capability: "prices", values: {} },
      );
    else {
      const end = Date.parse(asOf);
      const start = end - run.input.lookbackDays * 86400000;
      const span = INTERVAL_MS[run.input.interval] * 1000;
      for (let from = start, page = 0; from < end; from += span, page++)
        requests.push({
          key: `candles:${page}`,
          capability: "candles",
          values: {
            symbol: run.input.symbol,
            interval: run.input.interval,
            startTime: from,
            endTime: Math.min(end, from + span - 1),
            limit: 1000,
          },
        });
    }
    return {
      contextId,
      requests,
      roles: planRoles(run.input),
      mode: run.input.mode,
      rounds: run.input.debateRounds,
    };
  } catch (e) {
    fail(e);
  }
}
export async function fetchDataStep(runId: string, request: DataRequest) {
  "use step";
  try {
    const run = await assertActive(runId);
    const key = `data:${request.key}`;
    if (await cachedArtifact(runId, key)) return artifactId(runId, key);
    await reserveCall(runId, "tool");
    await emit(runId, `${key}:start`, {
      type: "tool.started",
      tool: `binance.${request.capability}`,
      message:
        request.capability === "candles" || request.capability === "prices"
          ? `正在获取行情：${request.capability}`
          : `正在读取账户数据：${request.capability}`,
    });
    const started = Date.now();
    const result = await fetchMarketData(
      run.ownerId,
      request.capability,
      request.values,
    );
    await assertActive(runId);
    const observedAt = new Date().toISOString();
    const evidence: EvidenceRef = {
      id: artifactId(runId, key),
      runId,
      source: result.source,
      label: `${request.capability} · ${result.source}`,
      tool: result.tool,
      symbol:
        typeof request.values.symbol === "string"
          ? request.values.symbol
          : undefined,
      observedAt,
      asOf: request.capability === "candles" ? run.createdAt : observedAt,
      sha256: sha256(result.data),
      parentIds: [],
      warnings: [],
      ...(request.values.startTime
        ? {
            timeRange: {
              start: new Date(Number(request.values.startTime)).toISOString(),
              end: new Date(Number(request.values.endTime)).toISOString(),
            },
          }
        : {}),
    };
    const id = await putArtifact(runId, key, "evidence", {
      evidence,
      data: result.data,
    });
    await emit(runId, `${key}:done`, {
      type: "tool.completed",
      tool: `binance.${request.capability}`,
      message: `已获取 ${request.capability}，原始证据已保存。`,
      durationMs: Date.now() - started,
      artifactId: id,
    });
    return id;
  } catch (e) {
    fail(e);
  }
}
fetchDataStep.maxRetries = 1;

export async function assembleContextStep(
  runId: string,
  initialId: string,
  dataIds: string[],
  supervisorId: string,
) {
  "use step";
  try {
    const run = await assertActive(runId);
    const context = await getArtifact<ResearchContext>(initialId, run.ownerId);
    const data = await Promise.all(
      dataIds.map((id) => getArtifact<DataArtifact>(id, run.ownerId)),
    );
    context.findings.push(
      await getArtifact<AgentFinding>(supervisorId, run.ownerId),
    );
    context.evidence.push(...data.map((d) => d.evidence));
    const warnings: string[] = [];
    if (run.input.mode === "portfolio") {
      context.portfolio = normalizePortfolio(
        data[0].data,
        data[1].data,
        data
          .map((d) => d.evidence.asOf)
          .sort()
          .at(-1)!,
        artifactId(runId, "portfolio"),
      );
      const evidence: EvidenceRef = {
        id: artifactId(runId, "portfolio"),
        runId,
        source: "calculation",
        label: "现货账户估值（USDT）",
        observedAt: new Date().toISOString(),
        asOf: context.portfolio.asOf,
        sha256: sha256(context.portfolio),
        parentIds: dataIds,
        warnings: context.portfolio.unpricedAssets.length
          ? ["存在无法估值的资产，不能把小计当作完整净资产。"]
          : [],
      };
      context.evidence.push(evidence);
      await putArtifact(runId, "portfolio", "evidence", {
        evidence,
        data: context.portfolio,
      });
    } else {
      const arrays = data.map((d) => {
        if (!Array.isArray(d.data))
          throw new AppError("DATA_INVALID", "K 线工具映射未返回数组。", 502);
        return d.data;
      });
      const candles = parseCandles(
        arrays.flat(),
        run.input.interval,
        Date.parse(context.asOf),
      );
      if (!candles.length)
        throw new AppError(
          "INSUFFICIENT_DATA",
          "没有返回可用的已收盘 K 线。",
          422,
        );
      const requestedStart =
        Date.parse(run.createdAt) - run.input.lookbackDays * 86400000;
      if (
        candles[0].openTime >
          requestedStart + INTERVAL_MS[run.input.interval] ||
        candles[0].openTime < requestedStart - INTERVAL_MS[run.input.interval]
      )
        throw new AppError(
          "DATA_RANGE_MISMATCH",
          "返回的行情时间范围与请求不一致，不能缩短区间后冒充完整分析。",
          502,
        );
      warnings.push(
        ...candleWarnings(
          candles,
          run.input.interval,
          Date.parse(context.asOf),
        ),
      );
      context.market = {
        symbol: run.input.symbol,
        interval: run.input.interval,
        candles,
        asOf: context.asOf,
        evidenceId: artifactId(runId, "market"),
      };
      const evidence: EvidenceRef = {
        id: artifactId(runId, "market"),
        runId,
        source: "calculation",
        label: "标准化已收盘 K 线",
        symbol: run.input.symbol,
        observedAt: new Date().toISOString(),
        asOf: context.asOf,
        timeRange: {
          start: new Date(candles[0].openTime).toISOString(),
          end: new Date(candles.at(-1)!.closeTime).toISOString(),
        },
        sha256: sha256(candles),
        parentIds: dataIds,
        warnings,
      };
      context.evidence.push(evidence);
      await putArtifact(runId, "market", "evidence", {
        evidence,
        data: candles,
      });
      context.metrics = marketMetrics(candles, run.input.interval);
      const metricsEvidence: EvidenceRef = {
        ...evidence,
        id: artifactId(runId, "metrics"),
        label: "确定性市场指标",
        sha256: sha256(context.metrics),
        parentIds: [evidence.id],
      };
      context.evidence.push(metricsEvidence);
      await putArtifact(runId, "metrics", "evidence", {
        evidence: metricsEvidence,
        data: context.metrics,
      });
      if (run.input.mode === "backtest") {
        context.backtest = runBacktest(
          context.market,
          run.input.backtest,
          artifactId(runId, "backtest"),
        );
        const backtestEvidence: EvidenceRef = {
          ...evidence,
          id: artifactId(runId, "backtest"),
          label: "确定性策略回测",
          sha256: sha256(context.backtest),
          parentIds: [evidence.id],
        };
        context.evidence.push(backtestEvidence);
        await putArtifact(runId, "backtest", "evidence", {
          evidence: backtestEvidence,
          data: context.backtest,
        });
      }
    }
    context.risk = assessRisk(
      context.evidence.map((e) => e.id),
      warnings,
      context.portfolio,
      run.input.riskPolicy,
    );
    return await putArtifact(runId, "context:data", "context", context);
  } catch (e) {
    fail(e);
  }
}
export async function mergeFindingsStep(
  runId: string,
  contextId: string,
  findingIds: string[],
  key: string,
) {
  "use step";
  try {
    const run = await assertActive(runId);
    const context = await getArtifact<ResearchContext>(contextId, run.ownerId);
    context.findings.push(
      ...(await Promise.all(
        findingIds.map((id) => getArtifact<AgentFinding>(id, run.ownerId)),
      )),
    );
    return await putArtifact(runId, `context:${key}`, "context", context);
  } catch (e) {
    fail(e);
  }
}
export async function prepareAgentStep(
  runId: string,
  role: AgentRole,
  contextId: string,
  pass: number,
) {
  "use step";
  try {
    const run = await assertActive(runId);
    const context = await getArtifact<ResearchContext>(contextId, run.ownerId);
    const { profile } = buildAgent(role);
    const state: AgentState = {
      role,
      contextId,
      pass,
      startedAt: Date.now(),
      messages: [
        { role: "user", content: JSON.stringify(compactContext(context)) },
      ],
    };
    const stateId = await putArtifact(
      runId,
      `state:${role}:${pass}:0`,
      "agent_state",
      state,
    );
    await emit(runId, `${role}:${pass}:start`, {
      type: "agent.started",
      role,
      message: `${profile.title}正在分析已验证数据。`,
    });
    return { stateId, maxIterations: profile.maxIterations };
  } catch (e) {
    fail(e);
  }
}
export async function modelTurnStep(
  runId: string,
  stateId: string,
  iteration: number,
  finalOnly: boolean,
) {
  "use step";
  try {
    const run = await assertActive(runId);
    const state = await getArtifact<AgentState>(stateId, run.ownerId);
    const key = `turn:${state.role}:${state.pass}:${iteration}`;
    let result = await cachedArtifact<ModelTurn>(runId, key);
    if (!result) {
      await reserveCall(runId, "model");
      const agent = buildAgent(state.role);
      const submit: ToolDefinition = {
        name: "submit_finding",
        description: "提交完成的结构化研究结果，每条事实需引用本轮证据。",
        inputSchema: z.toJSONSchema(findingSchema),
      };
      if (JSON.stringify(state.messages).length > 70000)
        throw new AppError(
          "CONTEXT_BUDGET",
          "上下文超出安全预算，请缩小研究范围。",
          422,
        );
      try {
        result = await ProviderRouter.get(run.input.provider, state.role).turn(
          agent.system,
          state.messages,
          finalOnly ? [submit] : [...agent.tools, submit],
          finalOnly,
        );
      } catch (e) {
        throw modelError(e);
      }
      await assertActive(runId);
      await putArtifact(runId, key, "model_turn", result);
      await recordUsage(runId, result.usage.input + result.usage.output);
    }
    if (!result.calls.length || result.calls.length > 6)
      throw new AppError(
        "MODEL_TOOL_PROTOCOL",
        "模型没有按约定调用工具，或单轮调用过多。",
        502,
      );
    return { turnId: artifactId(runId, key), callCount: result.calls.length };
  } catch (e) {
    fail(e);
  }
}
modelTurnStep.maxRetries = 1;

export async function executeAgentToolStep(
  runId: string,
  stateId: string,
  turnId: string,
  index: number,
) {
  "use step";
  try {
    const run = await assertActive(runId);
    const key = `tool:${turnId}:${index}`;
    if (await cachedArtifact(runId, key)) return artifactId(runId, key);
    const [state, turn] = await Promise.all([
      getArtifact<AgentState>(stateId, run.ownerId),
      getArtifact<ModelTurn>(turnId, run.ownerId),
    ]);
    const call = turn.calls[index];
    const context = await getArtifact<ResearchContext>(
      state.contextId,
      run.ownerId,
    );
    await reserveCall(runId, "tool");
    const started = Date.now();
    let output: ToolResult;
    if (call.name === "submit_finding") {
      try {
        if (turn.calls.length !== 1)
          throw new AppError(
            "SUBMIT_SEPARATELY",
            "请在其他工具返回后单独提交最终结果。",
            422,
          );
        const repairKey = `schema-repair:${state.role}:${state.pass}`;
        const accepted = acceptFindingOrRepair(
          call.args,
          new Set(context.evidence.map((e) => e.id)),
          Boolean(await cachedArtifact(runId, repairKey)),
        );
        if ("repair" in accepted) {
          await putArtifact(runId, repairKey, "schema_repair", { used: true });
          output = {
            callId: call.id,
            name: call.name,
            result: {
              error: publicError(
                new AppError(
                  "FINDING_INVALID",
                  "输出结构无效，仅允许再提交一次。",
                  422,
                ),
              ),
            },
          };
        } else {
          const finding: AgentFinding = {
            ...accepted.finding,
            role: state.role,
            model: turn.model,
          };
          output = {
            callId: call.id,
            name: call.name,
            result: { accepted: true },
            finding,
          };
        }
      } catch (e) {
        if (e instanceof AppError && e.code === "FINDING_UNRECOVERABLE") throw e;
        output = {
          callId: call.id,
          name: call.name,
          result: { error: publicError(e) },
        };
      }
    } else {
      await emit(runId, `${key}:start`, {
        type: "tool.started",
        role: state.role,
        tool: call.name,
        message: `${state.role} 正在调用 ${call.name}`,
      });
      try {
        output = {
          callId: call.id,
          name: call.name,
          result: new ToolCatalog(state.role, context).execute(call),
        };
      } catch (e) {
        output = {
          callId: call.id,
          name: call.name,
          result: { error: publicError(e) },
        };
      }
      await emit(runId, `${key}:done`, {
        type: "tool.completed",
        role: state.role,
        tool: call.name,
        message: `${call.name} 调用结束`,
        durationMs: Date.now() - started,
      });
    }
    return await putArtifact(runId, key, "tool_result", output);
  } catch (e) {
    fail(e);
  }
}
export async function advanceAgentStep(
  runId: string,
  stateId: string,
  turnId: string,
  resultIds: string[],
  iteration: number,
) {
  "use step";
  try {
    const run = await assertActive(runId);
    const [state, turn, results] = await Promise.all([
      getArtifact<AgentState>(stateId, run.ownerId),
      getArtifact<ModelTurn>(turnId, run.ownerId),
      Promise.all(
        resultIds.map((id) => getArtifact<ToolResult>(id, run.ownerId)),
      ),
    ]);
    const finding = results.find((r) => r.finding)?.finding;
    if (finding) {
      const findingId = await putArtifact(
        runId,
        `finding:${state.role}:${state.pass}`,
        "finding",
        finding,
      );
      await recordNode(
        runId,
        state.role,
        findingId,
        Date.now() - state.startedAt,
      );
      return { done: true as const, findingId, stateId: "" };
    }
    state.messages.push({
      role: "assistant",
      content: turn.content,
      toolCalls: turn.calls,
      ...(turn.providerState ? { providerState: turn.providerState } : {}),
    });
    state.messages.push(
      ...results.map((r) => ({
        role: "tool" as const,
        toolCallId: r.callId,
        content: JSON.stringify(r.result),
      })),
    );
    return {
      done: false as const,
      findingId: "",
      stateId: await putArtifact(
        runId,
        `state:${state.role}:${state.pass}:${iteration + 1}`,
        "agent_state",
        state,
      ),
    };
  } catch (e) {
    fail(e);
  }
}
export async function finalizeStep(
  runId: string,
  contextId: string,
  finalFindingId: string,
) {
  "use step";
  try {
    const run = await assertActive(runId);
    const context = await getArtifact<ResearchContext>(contextId, run.ownerId);
    const final = await getArtifact<AgentFinding>(finalFindingId, run.ownerId);
    const report: AnalysisReport = {
      title: `${run.input.symbol} · ${{ research: "市场研究", portfolio: "现货账户体检", backtest: "策略回测" }[run.input.mode]}`,
      mode: run.input.mode,
      symbol: run.input.symbol,
      asOf: context.asOf,
      summary: final.summary,
      stance: context.risk.checks.some((c) => c.status === "block")
        ? "insufficient"
        : final.stance,
      sections: [
        ...context.findings.filter((f) => f.role !== "supervisor"),
        final,
      ].map((f) => ({ role: f.role, finding: f })),
      evidence: context.evidence,
      risk: context.risk,
      market: context.market,
      portfolio: context.portfolio,
      backtest: context.backtest,
      limitations: [
        ...new Set([
          ...final.limitations,
          ...context.evidence.flatMap((e) => e.warnings),
          "未接入的新闻、社交情绪、链上和衍生品数据不构成本报告依据。",
        ]),
      ],
      disclaimer:
        "独立研究工具，非币安官方产品。仅供研究与教育，不构成投资建议；历史模拟不能代表实盘或未来收益。交易与划转必须通过动作卡并重新输入当前账号密码确认。",
    };
    await finishRun(runId, report);
    return { runId, status: "completed" };
  } catch (e) {
    fail(e);
  }
}
export async function failureStep(runId: string, message: string) {
  "use step";
  let error = new AppError(
    "RUN_FAILED",
    "任务未完成，请查看连接和配置后重试。",
    502,
  );
  try {
    const p = z
      .object({
        code: z.string().max(80),
        message: z.string().max(800),
        retryable: z.boolean(),
      })
      .parse(JSON.parse(message));
    error = new AppError(p.code, p.message, 502, p.retryable);
  } catch {
    /* never echo untrusted exception text */
  }
  const run = await getRun(runId);
  if (run.status !== "cancelled") await terminateRun(runId, "failed", error);
  return { runId, status: "failed" };
}
