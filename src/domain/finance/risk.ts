import Decimal from "decimal.js";
import type {
  PortfolioHolding,
  PortfolioSnapshot,
  RiskAssessment,
  RiskPolicy,
} from "../contracts";
import { riskPolicySchema } from "../contracts";
import { AppError } from "../errors";
import { numeric } from "./market";

export function normalizePortfolio(
  raw: unknown,
  rawPrices: unknown,
  asOf: string,
  evidenceId: string,
): PortfolioSnapshot {
  if (!Array.isArray(raw) || !Array.isArray(rawPrices))
    throw new AppError(
      "PORTFOLIO_DATA_INVALID",
      "资产或价格响应格式不匹配。",
      502,
    );
  const prices = new Map<string, number>();
  for (const item of rawPrices) {
    if (!item || typeof item !== "object")
      throw new AppError("PORTFOLIO_DATA_INVALID", "价格字段无效。", 502);
    const r = item as Record<string, unknown>;
    const price = numeric(r.price);
    if (typeof r.symbol !== "string" || price <= 0)
      throw new AppError("PORTFOLIO_DATA_INVALID", "资产价格无效。", 502);
    prices.set(r.symbol, price);
  }
  const holdings: PortfolioHolding[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object")
      throw new AppError("PORTFOLIO_DATA_INVALID", "资产字段无效。", 502);
    const r = item as Record<string, unknown>;
    if (
      typeof r.asset !== "string" ||
      !/^[A-Z0-9]{1,20}$/.test(r.asset) ||
      seen.has(r.asset)
    )
      throw new AppError("PORTFOLIO_DATA_INVALID", "资产标识无效或重复。", 502);
    seen.add(r.asset);
    const free = numeric(r.free);
    const locked = numeric(r.locked);
    if (free < 0 || locked < 0)
      throw new AppError("PORTFOLIO_DATA_INVALID", "现货余额不能为负。", 502);
    const total = new Decimal(String(r.free)).plus(String(r.locked));
    if (total.isZero()) continue;
    const price =
      r.asset === "USDT" ? 1 : (prices.get(`${r.asset}USDT`) ?? null);
    holdings.push({
      asset: r.asset,
      free: String(r.free),
      locked: String(r.locked),
      price,
      valueUsdt: price === null ? null : total.mul(price).toNumber(),
    });
  }
  return {
    holdings,
    pricedValueUsdt: holdings.reduce((sum, h) => sum + (h.valueUsdt ?? 0), 0),
    unpricedAssets: holdings
      .filter((h) => h.valueUsdt === null)
      .map((h) => h.asset),
    asOf,
    evidenceId,
    coverage: "spot_only",
  };
}
export function applyLimits(
  weights: Record<string, number>,
  input: RiskPolicy,
) {
  const limits = riskPolicySchema.parse(input);
  const output: Record<string, number> = {};
  const changes: string[] = [];
  for (const symbol of Object.keys(weights).sort()) {
    const w = weights[symbol];
    if (!Number.isFinite(w) || w < 0 || !/^[A-Z0-9]+$/.test(symbol))
      throw new AppError("INVALID_WEIGHTS", "现货权重必须是有限非负数。", 422);
    output[symbol] = Math.min(w, limits.maxPositionPct);
    if (output[symbol] !== w) changes.push(`${symbol}: maxPositionPct`);
  }
  const gross = Object.values(output).reduce((a, b) => a + b, 0);
  if (gross > limits.maxGrossExposure) {
    for (const s of Object.keys(output))
      output[s] *= limits.maxGrossExposure / gross;
    changes.push("maxGrossExposure");
  }
  return { weights: output, changes }; // Removed exposure stays in cash; never redistributed.
}
export function assessRisk(
  evidenceIds: string[],
  warnings: string[],
  portfolio?: PortfolioSnapshot,
  policy?: RiskPolicy,
): RiskAssessment {
  const checks: RiskAssessment["checks"] = [
    {
      code: "READ_ONLY",
      status: "pass",
      message: "仅研究与模拟，交易、转账、提现执行入口关闭。",
    },
    {
      code: "POLICY",
      status: policy ? "pass" : "warn",
      message: policy
        ? "使用用户显式配置的风险限额。"
        : "未设置风险限额，不生成具体仓位调整数量。",
    },
  ];
  for (const message of warnings)
    checks.push({ code: "DATA_QUALITY", status: "block", message });
  if (portfolio) {
    if (portfolio.unpricedAssets.length)
      checks.push({
        code: "UNPRICED_ASSETS",
        status: "block",
        message: `无法估值：${portfolio.unpricedAssets.join("、")}；已估值小计不代表完整净资产。`,
      });
    if (portfolio.pricedValueUsdt <= 0)
      checks.push({
        code: "EMPTY_PORTFOLIO",
        status: "warn",
        message: "没有可估值的现货余额，不计算仓位比例。",
      });
    if (!portfolio.unpricedAssets.length && portfolio.pricedValueUsdt > 0) {
      for (const h of portfolio.holdings.filter((h) => h.asset !== "USDT")) {
        const weight = h.valueUsdt! / portfolio.pricedValueUsdt;
        checks.push({
          code: `CONCENTRATION_${h.asset}`,
          status:
            policy && weight > policy.maxPositionPct
              ? "block"
              : policy
                ? "pass"
                : "warn",
          message: `${h.asset} 占已覆盖现货账户的 ${(weight * 100).toFixed(2)}%。`,
          actual: weight,
          ...(policy ? { limit: policy.maxPositionPct } : {}),
        });
      }
      const exposure =
        portfolio.holdings
          .filter((h) => h.asset !== "USDT")
          .reduce((v, h) => v + h.valueUsdt!, 0) / portfolio.pricedValueUsdt;
      checks.push({
        code: "GROSS_EXPOSURE",
        status:
          policy && exposure > policy.maxGrossExposure
            ? "block"
            : policy
              ? "pass"
              : "warn",
        message: "非 USDT 资产总敞口。",
        actual: exposure,
        ...(policy ? { limit: policy.maxGrossExposure } : {}),
      });
    }
  }
  return {
    allowed: Boolean(policy) && !checks.some((c) => c.status === "block"),
    policyConfigured: Boolean(policy),
    coverage: portfolio
      ? "仅已授权的现货账户；合约、借贷和其他子账户未覆盖。"
      : "市场研究；未评价私人账户。",
    checks,
    evidenceIds,
  };
}
