"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  ExternalLink,
  FileText,
  FlaskConical,
  GitBranch,
  Layers3,
  Link2,
  LoaderCircle,
  Menu,
  Plus,
  Search,
  Settings2,
  Shield,
  ShieldCheck,
  Square,
  Unplug,
  Wallet,
  X,
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
import type {
  AnalysisReport,
  AgentRole,
  Provider,
  RunEvent,
  RunInput,
  RunMode,
  RunStatus,
} from "@/domain/contracts";

type Bootstrap = {
  connection: { connected: boolean; connectedAt: string | null };
  providers: {
    id: Provider;
    available: boolean;
    model: string;
    thinkingLevel?: string;
  }[];
  capabilities: string[];
};
type HistoryItem = {
  _id: string;
  input: { prompt: string; mode: RunMode; symbol: string };
  status: RunStatus;
  createdAt: string;
  sessionId: string;
};
type RunView = {
  id: string;
  sessionId: string;
  input: RunInput;
  status: RunStatus;
  createdAt: string;
  modelCalls: number;
  toolCalls: number;
  tokens: number;
  error?: { message: string };
};
const modes = [
  {
    id: "research" as const,
    title: "市场研究",
    description: "从行情到观点，保留每一条证据",
    icon: BarChart3,
    prompt: "分析 BTC 最近的趋势、波动和主要风险，分别给出多方与空方观点。",
  },
  {
    id: "portfolio" as const,
    title: "账户体检",
    description: "看清现货资产的集中度与敞口",
    icon: Wallet,
    prompt: "检查我的现货资产集中度、无法定价的资产，以及当前账户覆盖范围。",
  },
  {
    id: "backtest" as const,
    title: "策略实验室",
    description: "检验假设，而不是相信预测",
    icon: FlaskConical,
    prompt: "回测选定策略，与买入持有比较，说明费用、回撤和样本局限。",
  },
];
const roleNames: Record<AgentRole, string> = {
  supervisor: "研究主管",
  market: "市场分析师",
  portfolio: "账户分析师",
  strategy: "策略研究员",
  bull: "多方研究员",
  bear: "空方研究员",
  risk: "风险复核员",
  report: "报告编审",
};
const statusNames: Record<RunStatus, string> = {
  queued: "等待执行",
  running: "研究中",
  completed: "已完成",
  failed: "未完成",
  cancelled: "已取消",
};
const pct = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
const number = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const date = (value: string | number) =>
  new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    path,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error?.message ?? "请求未成功，请稍后重试。");
  return data as T;
}
function Mark() {
  return (
    <div className="brand-mark">
      <BarChart3 size={21} strokeWidth={2.3} />
    </div>
  );
}

export function Workbench() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [mode, setMode] = useState<RunMode>("research");
  const [provider, setProvider] = useState<Provider>("gemini");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setIntervalValue] = useState("1d");
  const [days, setDays] = useState(90);
  const [strategy, setStrategy] = useState("sma_cross");
  const [fees, setFees] = useState(10);
  const [slippage, setSlippage] = useState(5);
  const [policyEnabled, setPolicyEnabled] = useState(false);
  const [maxPosition, setMaxPosition] = useState(20);
  const [maxGross, setMaxGross] = useState(80);
  const [prompt, setPrompt] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [run, setRun] = useState<RunView | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [catalog, setCatalog] = useState<unknown[] | null>(null);
  const cursor = useRef(0);
  const requestId = useRef<string | null>(null);
  const running = run?.status === "queued" || run?.status === "running";
  const selected = modes.find((m) => m.id === mode)!;
  const refreshHistory = useCallback(async () => {
    const result = await api<{ runs: HistoryItem[] }>("/api/runs");
    setHistory(result.runs);
  }, []);
  const refreshBootstrap = useCallback(async () => {
    const result = await api<Bootstrap>("/api/bootstrap");
    setBootstrap(result);
    return result;
  }, []);
  useEffect(() => {
    let mounted = true;
    void api<Bootstrap>("/api/bootstrap")
      .then(async (b) => {
        if (!mounted) return;
        setBootstrap(b);
        await refreshHistory();
      })
      .catch((e) => {
        if (mounted) setError(e.message);
      });
    const connection = new URL(window.location.href).searchParams.get(
      "connection",
    );
    if (connection) {
      queueMicrotask(() => {
        setNotice(
          connection === "success"
            ? "币安授权连接成功。可以检查官方工具目录。"
            : "币安授权未完成或已过期，请重新连接。",
        );
        window.history.replaceState({}, "", "/");
      });
    }
    return () => {
      mounted = false;
    };
  }, [refreshHistory]);
  useEffect(() => {
    if (!activeId) return;
    let stopped = false;
    let source: EventSource | null = null;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      const result = await api<{ run: RunView; report?: AnalysisReport }>(
        `/api/runs/${activeId}`,
      );
      if (stopped) return;
      setRun(result.run);
      if (result.report) setReport(result.report);
      if (["completed", "failed", "cancelled"].includes(result.run.status)) {
        source?.close();
        stopped = true;
        if (result.run.error) setError(result.run.error.message);
        await refreshHistory();
      }
    };
    const connect = () => {
      if (stopped) return;
      source = new EventSource(
        `/api/runs/${activeId}/events?cursor=${cursor.current}`,
      );
      source.onmessage = (e) => {
        const event = JSON.parse(e.data) as RunEvent;
        if (Number(event.id) <= cursor.current) return;
        cursor.current = Number(event.id);
        setEvents((previous) => [...previous, event]);
        if (event.type === "run.started")
          setRun((previous) =>
            previous ? { ...previous, status: "running" } : previous,
          );
      };
      source.addEventListener("done", () => {
        void refresh().catch((e) => setError(e.message));
      });
      source.onerror = () => {
        source?.close();
        if (!stopped) reconnect = setTimeout(connect, 2500);
      };
    };
    connect();
    void refresh().catch((e) => setError(e.message));
    const poll = setInterval(() => {
      if (!stopped) void refresh().catch(() => undefined);
    }, 5000);
    return () => {
      stopped = true;
      source?.close();
      clearInterval(poll);
      clearTimeout(reconnect);
    };
  }, [activeId, refreshHistory]);
  async function connectBinance() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ url: string }>(
        "/api/auth/binance/connect",
        {},
      );
      window.location.assign(result.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function submit() {
    setError(null);
    setBusy(true);
    const id = requestId.current ?? crypto.randomUUID();
    requestId.current = id;
    try {
      const result = await api<{
        runId: string;
        sessionId: string;
        status: RunStatus;
      }>("/api/runs", {
        clientRequestId: id,
        mode,
        provider,
        symbol: symbol.trim().toUpperCase(),
        interval,
        lookbackDays: days,
        prompt: prompt.trim(),
        debateRounds: 1,
        backtest: { strategy, feeBps: fees, slippageBps: slippage },
        ...(policyEnabled
          ? {
              riskPolicy: {
                maxPositionPct: maxPosition / 100,
                maxGrossExposure: maxGross / 100,
              },
            }
          : {}),
      });
      cursor.current = 0;
      setEvents([]);
      setReport(null);
      setActiveId(result.runId);
      const current = await api<{ run: RunView }>("/api/runs/" + result.runId);
      setRun(current.run);
      requestId.current = null;
      await refreshHistory();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openRun(item: HistoryItem) {
    if (item._id === activeId) {
      setMobileNav(false);
      return;
    }
    setMobileNav(false);
    setError(null);
    cursor.current = 0;
    setEvents([]);
    setReport(null);
    setActiveId(item._id);
    setMode(item.input.mode);
  }
  function newResearch() {
    setActiveId(null);
    setRun(null);
    setReport(null);
    setEvents([]);
    cursor.current = 0;
    setPrompt("");
    setError(null);
    setMobileNav(false);
    requestId.current = null;
  }
  async function cancel() {
    if (!run) return;
    try {
      const result = await api<{ status: RunStatus }>(
        `/api/runs/${run.id}/cancel`,
        {},
      );
      setRun({ ...run, status: result.status });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function inspectTools() {
    setBusy(true);
    try {
      const result = await api<{ tools: unknown[] }>(
        "/api/connection/tools",
        {},
      );
      setCatalog(result.tools);
      setNotice(
        `已从官方 MCP 发现 ${result.tools.length} 个工具。未审核工具不会自动获得执行权限。`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function downloadReport() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.symbol}-${report.mode}-${run?.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const roles: AgentRole[] =
    mode === "portfolio"
      ? ["supervisor", "portfolio", "risk", "report"]
      : [
          "supervisor",
          "market",
          ...(mode === "backtest" ? ["strategy" as const] : []),
          "bull",
          "bear",
          "risk",
          "report",
        ];
  const needed = mode === "portfolio" ? ["balances", "prices"] : ["candles"];
  const capabilitiesReady = needed.every((c) =>
    bootstrap?.capabilities.includes(c),
  );

  return (
    <div className="app-shell">
      {mobileNav && (
        <button
          className="sidebar-backdrop"
          aria-label="关闭导航"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? "is-open" : ""}`}>
        <Link href="/" className="brand">
          <Mark />
          <span>
            Agent OS<small>BINANCE RESEARCH DESK</small>
          </span>
        </Link>
        <button className="new-button" onClick={newResearch}>
          <Plus size={17} /> 新建研究 <span>↗</span>
        </button>
        <div className="nav-label">工作空间</div>
        <nav>
          {modes.map((m) => (
            <button
              key={m.id}
              className={`nav-item ${mode === m.id ? "active" : ""}`}
              onClick={() => {
                setMode(m.id);
                setMobileNav(false);
                requestId.current = null;
              }}
            >
              <m.icon size={18} />
              <span>{m.title}</span>
              {mode === m.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="history-heading">
          <span className="nav-label">最近研究</span>
          <Clock3 size={13} />
        </div>
        <div className="history-list">
          {history.length ? (
            history.map((item) => (
              <button
                key={item._id}
                className={`history-item ${activeId === item._id ? "selected" : ""}`}
                onClick={() => void openRun(item)}
              >
                <FileText size={14} />
                <span>{item.input.prompt}</span>
                <i className={`history-dot ${item.status}`} />
              </button>
            ))
          ) : (
            <div className="empty-history">
              每次研究的过程与证据
              <br />
              都会留在这里。
            </div>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="connection-card">
            <div className="connection-card-top">
              <span
                className={`status-light ${bootstrap?.connection.connected ? "online" : ""}`}
              />{" "}
              Binance MCP <span className="tiny-tag">官方接口</span>
            </div>
            <p>
              {bootstrap?.connection.connected
                ? "已连接 · 应用仅允许读取"
                : "连接后开始使用真实数据"}
            </p>
            <button
              onClick={() =>
                bootstrap?.connection.connected
                  ? setSettings(true)
                  : void connectBinance()
              }
              disabled={busy || !bootstrap}
            >
              {bootstrap?.connection.connected ? "管理连接" : "连接币安"}
              <ArrowUpRight size={14} />
            </button>
          </div>
          <button className="nav-item" onClick={() => setSettings(true)}>
            <Settings2 size={17} />
            连接与偏好
          </button>
          <a
            className="nav-item muted-link"
            href="https://github.com/day0n/binance-agent-os"
            target="_blank"
            rel="noreferrer"
          >
            <GitBranch size={17} />
            开源代码
            <ExternalLink size={12} />
          </a>
          <div className="sidebar-foot">
            <span className="avatar">R</span>
            <div>
              Research workspace<small>仅研究 · 无交易权限</small>
            </div>
            <ShieldCheck size={16} />
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="打开导航"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={20} />
            </button>
            <Layers3 size={16} />
            <span>工作空间</span>
            <ChevronRight size={13} />
            <strong>{selected.title}</strong>
          </div>
          <div className="header-actions">
            <span className="readonly-badge">
              <ShieldCheck size={13} />
              只读研究
            </span>
            <button
              className="icon-button"
              title="连接与偏好"
              aria-label="连接与偏好"
              onClick={() => setSettings(true)}
            >
              <Settings2 size={17} />
            </button>
          </div>
        </header>
        <main>
          <div className="workspace-heading">
            <div className="eyebrow">
              <span /> RESEARCH, WITH EVIDENCE
            </div>
            <div className="heading-line">
              <h1>{selected.title}</h1>
              <span className="version-label">WORKSPACE / 01</span>
            </div>
            <p>让不同观点相互检验，让每一个结论有据可查。</p>
          </div>
          {error && (
            <div className="message-banner error" role="alert">
              <Shield size={17} />
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="关闭错误"
                onClick={() => setError(null)}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {notice && (
            <div className="message-banner notice" role="status">
              <CheckCircle2 size={17} />
              <span>{notice}</span>
              <button
                className="icon-button"
                aria-label="关闭提示"
                onClick={() => setNotice(null)}
              >
                <X size={15} />
              </button>
            </div>
          )}
          <div className="desk-grid">
            <section className="main-column">
              {!run && !report && (
                <div className="mode-cards">
                  {modes.map((m) => (
                    <button
                      className={`mode-card ${mode === m.id ? "chosen" : ""}`}
                      key={m.id}
                      onClick={() => {
                        setMode(m.id);
                        setPrompt(m.prompt);
                        requestId.current = null;
                      }}
                    >
                      <div className="mode-card-top">
                        <m.icon size={20} />
                        <ArrowUpRight size={15} />
                      </div>
                      <h2>{m.title}</h2>
                      <p>{m.description}</p>
                    </button>
                  ))}
                </div>
              )}
              <section className="composer panel">
                <div className="panel-heading">
                  <span>
                    <Search size={16} /> 研究任务
                  </span>
                  <span className="subtle">
                    {bootstrap?.connection.connected
                      ? "MCP 已连接"
                      : "等待连接数据源"}
                  </span>
                </div>
                <div className="input-settings">
                  <label>
                    交易对
                    <input
                      aria-label="交易对"
                      value={symbol}
                      maxLength={19}
                      onChange={(e) => {
                        setSymbol(e.target.value.toUpperCase());
                        requestId.current = null;
                      }}
                      disabled={running}
                    />
                  </label>
                  <label>
                    周期
                    <select
                      aria-label="K 线周期"
                      value={interval}
                      onChange={(e) => {
                        setIntervalValue(e.target.value);
                        requestId.current = null;
                      }}
                      disabled={running}
                    >
                      <option value="1d">日线 · 1D</option>
                      <option value="4h">4 小时 · 4H</option>
                      <option value="1h">1 小时 · 1H</option>
                    </select>
                  </label>
                  <label>
                    样本范围
                    <select
                      aria-label="样本范围"
                      value={days}
                      onChange={(e) => {
                        setDays(Number(e.target.value));
                        requestId.current = null;
                      }}
                      disabled={running}
                    >
                      <option value={90}>最近 90 天</option>
                      <option value={180}>最近 180 天</option>
                      <option value={365}>最近 365 天</option>
                    </select>
                  </label>
                </div>
                {mode === "portfolio" && (
                  <div className="inline-note">
                    账户体检覆盖所有已授权现货资产；交易对设置不限制账户范围。
                  </div>
                )}
                {mode === "backtest" && (
                  <div className="backtest-controls">
                    <label>
                      策略
                      <select
                        aria-label="回测策略"
                        value={strategy}
                        onChange={(e) => {
                          setStrategy(e.target.value);
                          requestId.current = null;
                        }}
                        disabled={running}
                      >
                        <option value="sma_cross">均线交叉 · 10 / 30</option>
                        <option value="rsi_reversion">RSI 均值回归 · 14</option>
                        <option value="buy_hold">买入持有</option>
                      </select>
                    </label>
                    <label>
                      手续费 / 边
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={fees}
                        aria-label="手续费 bps"
                        onChange={(e) => {
                          setFees(Number(e.target.value));
                          requestId.current = null;
                        }}
                        disabled={running}
                      />
                      <small>bps，模拟假设</small>
                    </label>
                    <label>
                      滑点 / 边
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={slippage}
                        aria-label="滑点 bps"
                        onChange={(e) => {
                          setSlippage(Number(e.target.value));
                          requestId.current = null;
                        }}
                        disabled={running}
                      />
                      <small>bps，模拟假设</small>
                    </label>
                  </div>
                )}
                <textarea
                  aria-label="研究问题"
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    requestId.current = null;
                  }}
                  maxLength={4000}
                  placeholder={selected.prompt}
                  disabled={running}
                />
                <div className="composer-bottom">
                  <label className="model-select">
                    <span className="model-symbol">✳</span>
                    <select
                      aria-label="模型提供商"
                      value={provider}
                      disabled={running}
                      onChange={(e) => {
                        setProvider(e.target.value as Provider);
                        requestId.current = null;
                      }}
                    >
                      <option value="gemini">Gemini · HIGH</option>
                      <option
                        value="openai"
                        disabled={
                          !bootstrap?.providers.find((p) => p.id === "openai")
                            ?.available
                        }
                      >
                        OpenAI
                      </option>
                      <option
                        value="anthropic"
                        disabled={
                          !bootstrap?.providers.find(
                            (p) => p.id === "anthropic",
                          )?.available
                        }
                      >
                        Anthropic
                      </option>
                    </select>
                    <ChevronDown size={13} />
                  </label>
                  <div className="composer-actions">
                    <span className="subtle desktop-only">
                      {prompt.length}/4000
                    </span>
                    {running ? (
                      <button
                        className="secondary-button"
                        onClick={() => void cancel()}
                      >
                        <Square size={12} />
                        停止研究
                      </button>
                    ) : (
                      <button
                        className="primary-button"
                        onClick={() => void submit()}
                        disabled={
                          busy ||
                          !bootstrap?.connection.connected ||
                          prompt.trim().length < 2 ||
                          !bootstrap.providers.find((p) => p.id === provider)
                            ?.available
                        }
                      >
                        {busy ? (
                          <LoaderCircle size={16} className="spin" />
                        ) : (
                          <ArrowRight size={16} />
                        )}
                        开始研究
                      </button>
                    )}
                  </div>
                </div>
                {!bootstrap?.connection.connected ? (
                  <div className="composer-note">
                    <Link2 size={13} />
                    <span>
                      首次使用需完成币安 OAuth 授权。模型不会接触你的连接凭据。
                    </span>
                  </div>
                ) : !capabilitiesReady ? (
                  <div className="composer-note warning">
                    <Shield size={13} />
                    <span>
                      当前能力尚待工具目录审核；调用会明确报错，不会使用模拟数据。
                    </span>
                  </div>
                ) : (
                  <div className="composer-note">
                    <ShieldCheck size={13} />
                    <span>
                      只读工具已配置。所有结论都将附带来源与数据时间。
                    </span>
                  </div>
                )}
              </section>
              {run && (
                <section className="run-summary panel">
                  <span className={`run-status ${run.status}`}>
                    {running && <LoaderCircle size={14} className="spin" />}
                    {statusNames[run.status]}
                  </span>
                  <span className="mono">{run.id.slice(0, 8)}</span>
                  <span>{run.modelCalls} 次模型调用</span>
                  <span>{run.toolCalls} 次工具调用</span>
                  <span>{number(run.tokens)} tokens</span>
                </section>
              )}
              {report ? (
                <Report
                  report={report}
                  onEvidence={() => setShowEvidence(true)}
                  onDownload={downloadReport}
                />
              ) : (
                <section className="results-empty panel">
                  <div className="results-top">
                    <span>
                      <FileText size={16} />
                      研究产物
                    </span>
                    <span className="tiny-tag">可追溯</span>
                  </div>
                  <div className="empty-results-content">
                    <div className="document-icon">
                      <FileText size={31} strokeWidth={1.1} />
                      <span>
                        <Check size={11} />
                      </span>
                    </div>
                    <h3>
                      {running ? "研究正在进行" : "你的下一份研究，从这里开始"}
                    </h3>
                    <p>
                      {running
                        ? "分析节点正在工作。可以刷新页面，运行状态和已保存事件不会丢失。"
                        : "完成研究后，在这里查看结论、分歧、风险与原始证据。这里不会预填虚构的市场数据。"}
                    </p>
                    {!running && (
                      <button
                        className="text-button"
                        onClick={() => {
                          setPrompt(selected.prompt);
                          requestId.current = null;
                        }}
                      >
                        使用示例问题 <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                  <div className="trust-strip">
                    <span>
                      <Link2 size={13} />
                      真实数据
                    </span>
                    <span>
                      <GitBranch size={13} />
                      多视角复核
                    </span>
                    <span>
                      <ShieldCheck size={13} />
                      独立风控
                    </span>
                  </div>
                </section>
              )}
            </section>
            <aside className="inspector">
              <section className="panel pipeline">
                <div className="panel-heading">
                  <span>
                    <GitBranch size={16} />
                    Agent 协作
                  </span>
                  <span className="tiny-tag">{roles.length} 节点</span>
                </div>
                <p className="panel-description">专业分工，共享同一份证据。</p>
                <div className="pipeline-list">
                  {roles.map((role, index) => {
                    const done = events.some(
                      (e) => e.type === "agent.completed" && e.role === role,
                    );
                    const active =
                      !done &&
                      events.some(
                        (e) => e.type === "agent.started" && e.role === role,
                      );
                    return (
                      <div
                        className={`pipeline-node ${done ? "done" : ""} ${active ? "in-progress" : ""}`}
                        key={role}
                      >
                        <div className="node-indicator">
                          {done ? (
                            <Check size={12} />
                          ) : active && running ? (
                            <LoaderCircle size={12} className="spin" />
                          ) : (
                            <span>{String(index + 1).padStart(2, "0")}</span>
                          )}
                        </div>
                        <div>
                          <strong>{roleNames[role]}</strong>
                          <small>
                            {
                              {
                                supervisor: "任务与边界",
                                market: "趋势 · 波动 · 量价",
                                portfolio: "估值 · 集中度 · 敞口",
                                strategy: "策略 · 基准 · 假设",
                                bull: "支持论点与失效条件",
                                bear: "反证与未覆盖风险",
                                risk: "确定性约束检查",
                                report: "综合结论与证据",
                              }[role]
                            }
                          </small>
                        </div>
                        {done ? (
                          <span className="node-label">完成</span>
                        ) : active && running ? (
                          <span className="node-label">运行中</span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="panel evidence-summary">
                <div className="panel-heading">
                  <span>
                    <BookOpen size={16} />
                    证据索引
                  </span>
                  <span className="mono">
                    {String(report?.evidence.length ?? 0).padStart(2, "0")}
                  </span>
                </div>
                {report ? (
                  <>
                    <p>
                      {
                        report.evidence.filter(
                          (e) => e.source === "binance_mcp",
                        ).length
                      }{" "}
                      份官方来源 ·{" "}
                      {
                        report.evidence.filter(
                          (e) => e.source === "calculation",
                        ).length
                      }{" "}
                      份计算产物
                    </p>
                    <button
                      className="text-button"
                      onClick={() => setShowEvidence(true)}
                    >
                      检查来源与哈希 <ArrowUpRight size={13} />
                    </button>
                  </>
                ) : (
                  <p>每份行情和计算结果都有独立标识、获取时间与内容哈希。</p>
                )}
              </section>
              <section className="activity-section">
                <div className="activity-heading">
                  <Activity size={14} />
                  <span>执行动态</span>
                  {running && <i className="pulse-dot" />}
                </div>
                {events.length ? (
                  <div className="event-list">
                    {events
                      .slice(-8)
                      .reverse()
                      .map((e) => (
                        <div className="event" key={e.id}>
                          <span className="event-dot" />
                          <p>
                            {e.message}
                            <time>{date(e.at)}</time>
                          </p>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="activity-empty">
                    <Circle size={6} />
                    暂无执行记录
                  </div>
                )}
              </section>
              <div className="safety-note">
                <Shield size={15} />
                <p>
                  这个工作台不下单、不转账。
                  <br />
                  研究观点不构成投资建议。
                </p>
              </div>
            </aside>
          </div>
          <footer className="workspace-footer">
            <span>BUILT FOR CLARITY, NOT CERTAINTY.</span>
            <span>Independent project · Binance Agent OS track 1</span>
          </footer>
        </main>
      </div>
      {settings && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSettings(false);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <div className="modal-heading">
              <h2 id="settings-title">连接与偏好</h2>
              <button
                className="icon-button"
                aria-label="关闭设置"
                onClick={() => setSettings(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="settings-block">
              <h3>Binance 官方 MCP</h3>
              <p>
                OAuth 凭据仅加密保存在服务端。首次授权和币安侧撤权由你本人完成。
              </p>
              <div className="settings-actions">
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => void connectBinance()}
                >
                  <Link2 size={15} />
                  {bootstrap?.connection.connected ? "重新授权" : "连接币安"}
                </button>
                {bootstrap?.connection.connected && (
                  <>
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => void inspectTools()}
                    >
                      检查工具目录
                    </button>
                    <button
                      className="icon-button"
                      aria-label="断开币安连接"
                      onClick={() => {
                        void api("/api/auth/binance/disconnect", {})
                          .then(() => refreshBootstrap())
                          .then(() =>
                            setNotice(
                              "应用内连接已断开；币安侧撤权请在币安授权管理中完成。",
                            ),
                          )
                          .catch((e) => setError(e.message));
                      }}
                    >
                      <Unplug size={17} />
                    </button>
                  </>
                )}
              </div>
              {catalog && (
                <details className="catalog">
                  <summary>{catalog.length} 个工具 · 原始 Schema</summary>
                  <pre>{JSON.stringify(catalog, null, 2)}</pre>
                </details>
              )}
            </div>
            <div className="settings-block">
              <h3>模型服务</h3>
              {bootstrap?.providers.map((p) => (
                <div className="provider-row" key={p.id}>
                  <strong>
                    {
                      {
                        gemini: "Gemini",
                        openai: "OpenAI",
                        anthropic: "Anthropic",
                      }[p.id]
                    }
                  </strong>
                  <span>
                    {p.model}
                    {p.thinkingLevel ? " · " + p.thinkingLevel : ""}
                  </span>
                  <span className={p.available ? "positive" : "subtle"}>
                    {p.available ? "已配置" : "待配置"}
                  </span>
                </div>
              ))}
              <p>
                Gemini 通过 Vertex AI 服务账号调用，默认使用最高 HIGH
                思考档位。凭据只保存在服务端；不会静默降档或切换模型。
              </p>
            </div>
            <div className="settings-block">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={policyEnabled}
                  onChange={(e) => {
                    setPolicyEnabled(e.target.checked);
                    requestId.current = null;
                  }}
                />
                为下一次任务显式设置风险限额
              </label>
              <p>
                未启用时只分析风险，不生成具体仓位调整数量。以下数值需由你确认，不是投资建议。
              </p>
              {policyEnabled && (
                <div className="risk-inputs">
                  <label>
                    单资产占比上限（%）
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={maxPosition}
                      onChange={(e) => {
                        setMaxPosition(Number(e.target.value));
                        requestId.current = null;
                      }}
                    />
                  </label>
                  <label>
                    非 USDT 总敞口上限（%）
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={maxGross}
                      onChange={(e) => {
                        setMaxGross(Number(e.target.value));
                        requestId.current = null;
                      }}
                    />
                  </label>
                </div>
              )}
            </div>
            <button
              className="primary-button modal-done"
              onClick={() => setSettings(false)}
            >
              完成 <Check size={15} />
            </button>
          </section>
        </div>
      )}
      {showEvidence && report && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowEvidence(false);
          }}
        >
          <section
            className="modal evidence-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="evidence-title"
          >
            <div className="modal-heading">
              <h2 id="evidence-title">证据与数据来源</h2>
              <button
                className="icon-button"
                aria-label="关闭证据"
                onClick={() => setShowEvidence(false)}
              >
                <X size={20} />
              </button>
            </div>
            {report.evidence.map((e) => (
              <div className="evidence-item" key={e.id}>
                <div>
                  <span className="tiny-tag">{e.source}</span>
                  <strong>{e.label}</strong>
                </div>
                <p>
                  数据时点 {date(e.asOf)} · 获取于 {date(e.observedAt)}
                </p>
                <code>{e.sha256}</code>
                {e.warnings.map((w) => (
                  <p className="warning" key={w}>
                    {w}
                  </p>
                ))}
                <a
                  className="text-button"
                  href={`/api/artifacts/${e.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  查看原始产物 <ExternalLink size={12} />
                </a>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}

function Report({
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
                <CartesianGrid stroke="#ffffff09" vertical={false} />
                <XAxis
                  dataKey="time"
                  tickFormatter={(t) =>
                    new Date(t).toLocaleDateString("zh-CN", {
                      month: "numeric",
                      day: "numeric",
                    })
                  }
                  tick={{ fontSize: 10, fill: "#838992" }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={45}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fontSize: 10, fill: "#838992" }}
                  tickFormatter={number}
                  axisLine={false}
                  tickLine={false}
                  width={65}
                />
                <Tooltip
                  contentStyle={{
                    background: "#22252a",
                    border: "1px solid #393d44",
                    fontSize: 12,
                  }}
                  labelFormatter={(t) => date(Number(t))}
                />
                <Line
                  dataKey="benchmark"
                  name="买入持有"
                  stroke="#656d7c"
                  dot={false}
                  strokeWidth={1.5}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="equity"
                  name="策略净值"
                  stroke="#e8c261"
                  dot={false}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </LineChart>
            ) : (
              <AreaChart data={chartData}>
                <CartesianGrid stroke="#ffffff09" vertical={false} />
                <XAxis
                  dataKey="time"
                  tickFormatter={(t) =>
                    new Date(t).toLocaleDateString("zh-CN", {
                      month: "numeric",
                      day: "numeric",
                    })
                  }
                  tick={{ fontSize: 10, fill: "#838992" }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={45}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fontSize: 10, fill: "#838992" }}
                  tickFormatter={number}
                  axisLine={false}
                  tickLine={false}
                  width={65}
                />
                <Tooltip
                  contentStyle={{
                    background: "#22252a",
                    border: "1px solid #393d44",
                    fontSize: 12,
                  }}
                  labelFormatter={(t) => date(Number(t))}
                />
                <Area
                  dataKey="price"
                  name="价格"
                  stroke="#e8c261"
                  fill="#e8c26112"
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
