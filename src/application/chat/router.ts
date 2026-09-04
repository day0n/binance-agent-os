import { intentPlanSchema, isBareConfirmText, type IntentPlan } from "@/domain/chat";

const defaultBudget = { maxModelCalls: 16, maxToolCalls: 24 };

export function heuristicIntent(content: string): IntentPlan {
  const text = content.trim();
  if (isBareConfirmText(text))
    return intentPlanSchema.parse({
      taskKind: "general",
      needsAccount: false,
      needsClarification: false,
      clarificationQuestions: [],
      nodes: ["report"],
      budget: defaultBudget,
      missingFields: [],
    });
  if (/回测|策略实验室|sma|rsi/i.test(text))
    return intentPlanSchema.parse({
      taskKind: "backtest",
      needsAccount: false,
      needsClarification: false,
      clarificationQuestions: [],
      nodes: ["market", "strategy", "risk", "report"],
      budget: defaultBudget,
      missingFields: [],
    });
  if (/账户|持仓|资产体检|portfolio/i.test(text))
    return intentPlanSchema.parse({
      taskKind: "portfolio",
      needsAccount: true,
      needsClarification: false,
      clarificationQuestions: [],
      nodes: ["portfolio", "risk", "report"],
      budget: defaultBudget,
      missingFields: [],
    });
  if (/买入|卖出|下单|撤单|划转|市价|限价|transfer/i.test(text))
    return intentPlanSchema.parse({
      taskKind: "action",
      needsAccount: true,
      needsClarification: true,
      clarificationQuestions: ["请提供交易对、方向、数量或金额，并使用动作卡确认。"],
      nodes: ["action"],
      budget: { maxModelCalls: 8, maxToolCalls: 8 },
      missingFields: ["symbol", "side", "amount"],
    });
  if (/行情|研究|分析|走势|k线/i.test(text))
    return intentPlanSchema.parse({
      taskKind: "research",
      needsAccount: false,
      needsClarification: false,
      clarificationQuestions: [],
      nodes: ["market", "bull", "bear", "risk", "report"],
      budget: defaultBudget,
      missingFields: [],
    });
  return intentPlanSchema.parse({
    taskKind: "general",
    needsAccount: false,
    needsClarification: false,
    clarificationQuestions: [],
    nodes: ["report"],
    budget: { maxModelCalls: 6, maxToolCalls: 6 },
    missingFields: [],
  });
}

export function mergeIntent(model: unknown, fallback: IntentPlan): IntentPlan {
  const parsed = intentPlanSchema.safeParse(model);
  if (!parsed.success) return fallback;
  return parsed.data;
}

export function shouldSkipModelClassify(content: string, plan: IntentPlan) {
  return (
    isBareConfirmText(content) ||
    plan.taskKind === "research" ||
    plan.taskKind === "backtest"
  );
}

export function researchParamsFromChat(content: string, plan: IntentPlan) {
  const upper = content.toUpperCase();
  const symbol =
    plan.symbol ??
    upper.match(/[A-Z0-9]{2,15}USDT/)?.[0] ??
    "BTCUSDT";
  const interval =
    plan.interval ??
    (/24\s*小时|近\s*24|1h/i.test(content) ? "1h" : "1d");
  return {
    symbol,
    interval,
    lookbackDays: 30,
    debateRounds: 0 as const,
  };
}

export function publicStatusMessage(plan: IntentPlan) {
  if (plan.taskKind === "portfolio") return "正在检查现货账户数据";
  if (plan.taskKind === "backtest") return "正在准备策略回测";
  if (plan.taskKind === "action") return "正在整理交易预览，不会直接下单";
  if (plan.taskKind === "research") return "正在获取行情";
  return "正在理解你的问题";
}
