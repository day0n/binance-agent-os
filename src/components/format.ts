import type { AgentRole } from "@/domain/contracts";

export const roleNames: Record<AgentRole, string> = {
  supervisor: "研究主管",
  market: "市场分析师",
  portfolio: "账户分析师",
  strategy: "策略研究员",
  bull: "多方研究员",
  bear: "空方研究员",
  risk: "风险复核员",
  report: "报告编审",
  action: "动作规划",
};
export const pct = (n: number) =>
  `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
export const number = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 2 });
export const date = (value: string | number) =>
  new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
