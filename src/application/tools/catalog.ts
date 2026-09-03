import { z } from "zod";
import { AppError } from "@/domain/errors";
import type { AgentRole, ToolCall } from "@/domain/contracts";
import {
  blueprints,
  skills,
  type SkillName,
} from "@/application/agents/blueprints";
import {
  compactContext,
  type ResearchContext,
} from "@/application/research-context";

export class ToolCatalog {
  constructor(
    private role: AgentRole,
    private context: ResearchContext,
  ) {}
  execute(call: ToolCall): unknown {
    const blueprint = blueprints[this.role];
    if (!blueprint.tools.includes(call.name))
      throw new AppError(
        "TOOL_FORBIDDEN",
        "该 Agent 没有所请求工具的权限。",
        403,
      );
    if (call.name === "use_skill") {
      const { name } = z.object({ name: z.string() }).strict().parse(call.args);
      if (!blueprint.skills.includes(name))
        throw new AppError(
          "SKILL_FORBIDDEN",
          "该 Agent 无权读取此研究方法。",
          403,
        );
      return { name, content: skills[name as SkillName].content };
    }
    z.object({}).strict().parse(call.args);
    if (call.name === "read_context") return compactContext(this.context);
    const outputs: Record<string, unknown> = {
      read_market_metrics: this.context.metrics,
      read_portfolio_metrics: this.context.portfolio,
      read_backtest_metrics: this.context.backtest
        ? { ...this.context.backtest, equity: undefined, trades: undefined }
        : undefined,
      read_risk_assessment: this.context.risk,
    };
    if (!outputs[call.name])
      throw new AppError(
        "TOOL_DATA_UNAVAILABLE",
        "本任务没有此类已验证数据。",
        422,
      );
    return outputs[call.name];
  }
}
