"use client";

import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Shield,
  ShieldCheck,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalysisReport } from "@/domain/contracts";
import { roleNames, pct, number, date } from "./format";

export function Report({
  report,
  onEvidence,
  onDownload,
}: {
  report: AnalysisReport;
  onEvidence: () => void;
  onDownload: () => void;
}) {
  const chartData:
    | { time: number; equity?: number; benchmark?: number; price?: number }[]
    | undefined = report.backtest
    ? report.backtest.equity
    : report.market?.candles
        .slice(-500)
        .map((c) => ({ time: c.closeTime, price: c.close }));
  const metrics = report.backtest?.metrics;
  return (
    <section className="report panel">
      <div className="report-heading">
        <div>
          <span className="eyebrow">RESEARCH BRIEF</span>
          <h2>{report.title}</h2>
          <p>数据时点：{date(report.asOf)}</p>
        </div>
        <button
          className="icon-button"
          aria-label="下载报告 JSON"
          onClick={onDownload}
        >
          <ArrowDownToLine size={18} />
        </button>
      </div>
      <div className={`verdict ${report.stance}`}>
        <span>
          <ShieldCheck size={15} />
          {
            {
              bullish: "偏多观点",
              bearish: "偏空观点",
              neutral: "中性观点",
              insufficient: "证据不足 / 风险约束",
            }[report.stance]
          }
        </span>
        <small>研究判断，非交易指令</small>
      </div>
      <p className="report-summary">{report.summary}</p>
      {metrics && (
        <div className="metrics-grid">
          <div>
            <span>策略收益</span>
            <strong
              className={metrics.totalReturn >= 0 ? "positive" : "negative"}
            >
              {pct(metrics.totalReturn)}
            </strong>
          </div>
          <div>
            <span>买入持有</span>
            <strong>{pct(metrics.benchmarkReturn)}</strong>
          </div>
          <div>
            <span>最大回撤</span>
            <strong className="negative">
              {(metrics.maxDrawdown * 100).toFixed(2)}%
            </strong>
          </div>
          <div>
            <span>模拟成交</span>
            <strong>
              {metrics.trades}
              <small> 次</small>
            </strong>
          </div>
        </div>
      )}
      {chartData && (
        <div className="report-chart">
          <div className="chart-label">
            {report.backtest
              ? "净值对比 · 黄色为策略 / 灰色为基准"
              : "已收盘价格 · USDT"}
          </div>
          <ResponsiveContainer width="100%" height={230}>
            {report.backtest ? (
              <LineChart data={chartData}>
                <CartesianGrid stroke="var(--border-soft)" vertical={false} />
                <XAxis
                  dataKey="time"
                  tickFormatter={(t) =>
                    new Date(t).toLocaleDateString("zh-CN", {
                      month: "numeric",
                      day: "numeric",
                    })
                  }
                  tick={{ fontSize: 12, fill: "var(--muted)" }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={45}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fontSize: 12, fill: "var(--muted)" }}
                  tickFormatter={number}
                  axisLine={false}
                  tickLine={false}
                  width={65}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border)",
                    fontSize: 12,
                  }}
                  labelFormatter={(t) => date(Number(t))}
                />
                <Line
                  dataKey="benchmark"
                  name="买入持有"
                  stroke="var(--muted)"
                  dot={false}
                  strokeWidth={1.5}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="equity"
                  name="策略净值"
                  stroke="var(--accent)"
                  dot={false}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </LineChart>
            ) : (
              <AreaChart data={chartData}>
                <CartesianGrid stroke="var(--border-soft)" vertical={false} />
                <XAxis
                  dataKey="time"
                  tickFormatter={(t) =>
                    new Date(t).toLocaleDateString("zh-CN", {
                      month: "numeric",
                      day: "numeric",
                    })
                  }
                  tick={{ fontSize: 12, fill: "var(--muted)" }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={45}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fontSize: 12, fill: "var(--muted)" }}
                  tickFormatter={number}
                  axisLine={false}
                  tickLine={false}
                  width={65}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border)",
                    fontSize: 12,
                  }}
                  labelFormatter={(t) => date(Number(t))}
                />
                <Area
                  dataKey="price"
                  name="价格"
                  stroke="var(--accent)"
                  fill="#f0b90b12"
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
      {report.portfolio && (
        <div className="portfolio-table">
          <h3>
            已估值现货小计{" "}
            <span>{number(report.portfolio.pricedValueUsdt)} USDT</span>
          </h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>资产</th>
                  <th>可用 / 冻结</th>
                  <th>估值 · USDT</th>
                </tr>
              </thead>
              <tbody>
                {report.portfolio.holdings.map((h) => (
                  <tr key={h.asset}>
                    <td>{h.asset}</td>
                    <td>
                      {h.free} / {h.locked}
                    </td>
                    <td>
                      {h.valueUsdt === null ? "无法估值" : number(h.valueUsdt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="subtle">{report.risk.coverage}</p>
        </div>
      )}
      <div className="risk-results">
        <h3>
          <Shield size={16} />
          确定性风控检查
        </h3>
        {report.risk.checks.map((c, i) => (
          <div className={`risk-check ${c.status}`} key={`${c.code}:${i}`}>
            <span>
              {c.status === "pass" ? (
                <CheckCircle2 size={14} />
              ) : (
                <Shield size={14} />
              )}
            </span>
            <p>{c.message}</p>
            <small>
              {{ pass: "通过", warn: "注意", block: "限制" }[c.status]}
            </small>
          </div>
        ))}
      </div>
      <div className="findings">
        {report.sections
          .filter((s) => s.role !== "report")
          .map((s, i) => (
            <details key={`${s.role}:${i}`}>
              <summary>
                <span>{roleNames[s.role]}</span>
                <ChevronDown size={15} />
              </summary>
              <p>{s.finding.summary}</p>
              {s.finding.facts.map((f, j) => (
                <div className="finding-fact" key={j}>
                  <p>{f.claim}</p>
                  <button className="citation-button" onClick={onEvidence}>
                    {f.evidenceIds.length} 条证据 <ArrowUpRight size={10} />
                  </button>
                </div>
              ))}
              {s.finding.risks.map((r) => (
                <p className="finding-risk" key={r}>
                  {r}
                </p>
              ))}
            </details>
          ))}
      </div>
      <div className="limitations">
        <h3>假设与局限</h3>
        <ul>
          {[
            ...new Set([
              ...(report.backtest?.assumptions ?? []),
              ...report.limitations,
            ]),
          ].map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
      <div className="report-footer">
        <p>{report.disclaimer}</p>
        <button className="text-button" onClick={onEvidence}>
          查看全部证据 <ArrowRight size={14} />
        </button>
      </div>
    </section>
  );
}
