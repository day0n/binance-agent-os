import type {
  AgentFinding,
  BacktestResult,
  EvidenceRef,
  MarketSnapshot,
  PortfolioSnapshot,
  RiskAssessment,
  RunInput,
} from "@/domain/contracts";
import { findingSchema } from "@/domain/contracts";
import { AppError } from "@/domain/errors";

export type ResearchContext = {
  input: RunInput;
  asOf: string;
  evidence: EvidenceRef[];
  market?: MarketSnapshot;
  metrics?: Record<string, unknown>;
  portfolio?: PortfolioSnapshot;
  backtest?: BacktestResult;
  risk: RiskAssessment;
  findings: AgentFinding[];
  memory: { summary: string; availableAt: string }[];
  recentMessages?: { role: "user" | "assistant"; content: string }[];
  sessionSummary?: string;
};
export function compactContext(context: ResearchContext) {
  return {
    task: {
      mode: context.input.mode,
      prompt: context.input.prompt,
      symbol: context.input.symbol,
      interval: context.input.interval,
      lookbackDays: context.input.lookbackDays,
    },
    recentMessages: context.recentMessages,
    sessionSummary: context.sessionSummary,
    asOf: context.asOf,
    evidence: context.evidence.map((e) => ({
      id: e.id,
      label: e.label,
      source: e.source,
      asOf: e.asOf,
      warnings: e.warnings,
    })),
    marketMetrics: context.metrics,
    portfolio: context.portfolio,
    backtest: context.backtest
      ? {
          metrics: context.backtest.metrics,
          assumptions: context.backtest.assumptions,
          config: context.backtest.config,
          start: context.backtest.start,
          end: context.backtest.end,
        }
      : undefined,
    risk: context.risk,
    findings: context.findings.map((f) => ({
      role: f.role,
      summary: f.summary,
      stance: f.stance,
      facts: f.facts,
      risks: f.risks,
      limitations: f.limitations,
    })),
    historicalContext: context.memory,
  };
}
export function validateFinding(value: unknown, validEvidence: Set<string>) {
  const parsed = findingSchema.safeParse(value);
  if (!parsed.success)
    throw new AppError(
      "FINDING_INVALID",
      "分析输出不符合约定结构。",
      502,
      true,
    );
  if (
    parsed.data.facts.some((f) =>
      f.evidenceIds.some((id) => !validEvidence.has(id)),
    )
  )
    throw new AppError(
      "EVIDENCE_INVALID",
      "分析引用了本轮不存在的证据。",
      502,
      true,
    );
  return parsed.data;
}
