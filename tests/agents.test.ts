import { describe, expect, it } from "vitest";
import { buildAgent, planRoles } from "@/application/agents/blueprints";
import {
  validateFinding,
  type ResearchContext,
} from "@/application/research-context";
import { ToolCatalog } from "@/application/tools/catalog";
import { runInputSchema } from "@/domain/contracts";

const valid = {
  summary: "数据不足",
  stance: "insufficient",
  facts: [{ claim: "样本限制", evidenceIds: ["real"] }],
  risks: [],
  limitations: [],
  nextSteps: [],
};
describe("agent contracts and routing", () => {
  it("rejects fabricated evidence IDs and malformed output", () => {
    expect(validateFinding(valid, new Set(["real"])).stance).toBe(
      "insufficient",
    );
    expect(() => validateFinding(valid, new Set(["other"]))).toThrow();
    expect(() => validateFinding({ summary: "buy" }, new Set())).toThrow();
  });
  it("has separate blueprints with role-specific tools and budgets", () => {
    const m = buildAgent("market");
    const r = buildAgent("risk");
    expect(m.profile.tools).toContain("read_market_metrics");
    expect(r.profile.tools).not.toContain("read_market_metrics");
    expect(m.profile.maxIterations).toBeLessThanOrEqual(4);
  });
  it("routes only the required specialists", () => {
    const input = runInputSchema.parse({
      clientRequestId: "10000000-0000-4000-8000-000000000000",
      mode: "portfolio",
      prompt: "测试账户",
    });
    expect(planRoles(input)).toEqual(["portfolio"]);
    expect(planRoles({ ...input, mode: "backtest" })).toEqual([
      "market",
      "strategy",
    ]);
  });
  it("enforces tool permissions and blocks arbitrary code/trades", () => {
    const catalog = new ToolCatalog("market", {} as ResearchContext);
    for (const name of [
      "create_order",
      "execute_code",
      "read_portfolio_metrics",
    ])
      expect(() => catalog.execute({ id: "c", name, args: {} })).toThrow();
  });
  it("loads only a role's approved skill", () => {
    const catalog = new ToolCatalog("market", {} as ResearchContext);
    expect(
      catalog.execute({
        id: "c",
        name: "use_skill",
        args: { name: "market_research" },
      }),
    ).toHaveProperty("content");
    expect(() =>
      catalog.execute({
        id: "c",
        name: "use_skill",
        args: { name: "risk_review" },
      }),
    ).toThrow();
  });
  it("rejects unknown request properties and unsafe instruments", () => {
    expect(() =>
      runInputSchema.parse({
        clientRequestId: "x",
        mode: "trade",
        prompt: "buy",
        execute: true,
      }),
    ).toThrow();
    expect(() =>
      runInputSchema.parse({
        clientRequestId: "10000000-0000-4000-8000-000000000000",
        mode: "research",
        prompt: "测试",
        symbol: "../../BTCUSDT",
      }),
    ).toThrow();
  });
});
