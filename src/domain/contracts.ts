import { z } from "zod";

export const providerSchema = z.enum(["gemini", "openai", "anthropic"]);
export const modeSchema = z.enum(["research", "portfolio", "backtest"]);
export type Provider = z.infer<typeof providerSchema>;
export type RunMode = z.infer<typeof modeSchema>;
export const roleSchema = z.enum([
  "supervisor",
  "market",
  "portfolio",
  "strategy",
  "bull",
  "bear",
  "risk",
  "report",
]);
export type AgentRole = z.infer<typeof roleSchema>;
export const intervalSchema = z.enum(["1h", "4h", "1d"]);
export const strategySchema = z.enum([
  "sma_cross",
  "rsi_reversion",
  "buy_hold",
]);
export const riskPolicySchema = z
  .object({
    maxPositionPct: z.number().positive().max(1),
    maxGrossExposure: z.number().positive().max(1),
  })
  .strict();
export type RiskPolicy = z.infer<typeof riskPolicySchema>;
export const backtestConfigSchema = z
  .object({
    strategy: strategySchema.default("sma_cross"),
    initialCapital: z.number().min(100).max(1e8).default(10000),
    feeBps: z.number().min(0).max(100).default(10),
    slippageBps: z.number().min(0).max(100).default(5),
    fastPeriod: z.number().int().min(2).max(100).default(10),
    slowPeriod: z.number().int().min(3).max(250).default(30),
    rsiPeriod: z.number().int().min(2).max(100).default(14),
    rsiEntry: z.number().min(1).max(49).default(30),
    rsiExit: z.number().min(51).max(99).default(70),
  })
  .strict()
  .refine((v) => v.fastPeriod < v.slowPeriod, {
    message: "短均线周期必须小于长均线周期",
  });
export type BacktestConfig = z.infer<typeof backtestConfigSchema>;
export const runInputSchema = z
  .object({
    clientRequestId: z.string().uuid(),
    sessionId: z.string().uuid().optional(),
    mode: modeSchema,
    provider: providerSchema.default("gemini"),
    prompt: z.string().trim().min(2).max(4000),
    symbol: z
      .string()
      .regex(/^[A-Z0-9]{2,15}USDT$/)
      .default("BTCUSDT"),
    interval: intervalSchema.default("1d"),
    lookbackDays: z.number().int().min(30).max(365).default(90),
    debateRounds: z.number().int().min(1).max(2).default(1),
    backtest: backtestConfigSchema.default(() =>
      backtestConfigSchema.parse({}),
    ),
    riskPolicy: riskPolicySchema.optional(),
  })
  .strict();
export type RunInput = z.infer<typeof runInputSchema>;
export type RunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";
export const terminalStatuses: RunStatus[] = [
  "completed",
  "failed",
  "cancelled",
];

export type EvidenceRef = {
  id: string;
  runId: string;
  source: "binance_mcp" | "calculation" | "user";
  label: string;
  tool?: string;
  symbol?: string;
  observedAt: string;
  asOf: string;
  timeRange?: { start: string; end: string };
  sha256: string;
  parentIds: string[];
  warnings: string[];
};
export const findingSchema = z
  .object({
    summary: z.string().min(1).max(4000),
    stance: z.enum(["bullish", "bearish", "neutral", "insufficient"]),
    facts: z
      .array(
        z
          .object({
            claim: z.string().max(1000),
            evidenceIds: z.array(z.string()).min(1).max(10),
          })
          .strict(),
      )
      .max(12),
    risks: z.array(z.string().max(800)).max(12),
    limitations: z.array(z.string().max(800)).max(12),
    nextSteps: z.array(z.string().max(800)).max(8),
  })
  .strict();
export type AgentFinding = z.infer<typeof findingSchema> & {
  role: AgentRole;
  model: string;
};
export type Candle = {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
export type MarketSnapshot = {
  symbol: string;
  interval: string;
  candles: Candle[];
  asOf: string;
  evidenceId: string;
};
export type PortfolioHolding = {
  asset: string;
  free: string;
  locked: string;
  valueUsdt: number | null;
  price: number | null;
};
export type PortfolioSnapshot = {
  holdings: PortfolioHolding[];
  pricedValueUsdt: number;
  unpricedAssets: string[];
  asOf: string;
  evidenceId: string;
  coverage: "spot_only";
};
export type RiskAssessment = {
  allowed: boolean;
  policyConfigured: boolean;
  coverage: string;
  checks: {
    code: string;
    status: "pass" | "warn" | "block";
    message: string;
    actual?: number;
    limit?: number;
  }[];
  evidenceIds: string[];
  proposedWeights?: Record<string, number>;
  limitedWeights?: Record<string, number>;
};
export type BacktestResult = {
  config: BacktestConfig;
  symbol: string;
  interval: string;
  evidenceId: string;
  start: string;
  end: string;
  candleCount: number;
  metrics: {
    totalReturn: number;
    benchmarkReturn: number;
    maxDrawdown: number;
    sharpe: number | null;
    volatility: number | null;
    trades: number;
    finalEquity: number;
    totalFees: number;
  };
  equity: { time: number; equity: number; benchmark: number }[];
  trades: {
    time: number;
    signalTime: number;
    side: "buy" | "sell";
    price: number;
    quantity: number;
    fee: number;
  }[];
  assumptions: string[];
};
export type AnalysisReport = {
  title: string;
  mode: RunMode;
  symbol: string;
  asOf: string;
  summary: string;
  stance: AgentFinding["stance"];
  sections: { role: AgentRole; finding: AgentFinding }[];
  risk: RiskAssessment;
  evidence: EvidenceRef[];
  limitations: string[];
  market?: MarketSnapshot;
  portfolio?: PortfolioSnapshot;
  backtest?: BacktestResult;
  disclaimer: string;
};
export type RunEvent = {
  id: string;
  runId: string;
  type:
    | "run.started"
    | "agent.started"
    | "agent.completed"
    | "tool.started"
    | "tool.completed"
    | "run.completed"
    | "run.failed"
    | "run.cancelled";
  at: string;
  role?: AgentRole;
  tool?: string;
  message: string;
  durationMs?: number;
  artifactId?: string;
};
export type ToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  providerCallId?: string;
};
export type ModelMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  providerState?: { provider: "gemini"; encrypted: string };
};
export type ModelTurn = {
  content: string;
  calls: ToolCall[];
  model: string;
  providerState?: { provider: "gemini"; encrypted: string };
  usage: { input: number; output: number; thinking?: number };
};
export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};
export type AgentBlueprint = {
  role: AgentRole;
  title: string;
  instructions: string;
  tools: readonly string[];
  skills: readonly string[];
  maxIterations: number;
  outputSchema: typeof findingSchema;
};
