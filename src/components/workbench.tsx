"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { roleNames, number, date } from "./format";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  FlaskConical,
  GitBranch,
  Headphones,
  Info,
  Link2,
  LoaderCircle,
  Menu,
  Moon,
  Plus,
  Search,
  Settings2,
  Shield,
  ShieldCheck,
  Square,
  Sun,
  Unplug,
  Wallet,
  X,
} from "lucide-react";
import type {
  AnalysisReport,
  AgentRole,
  Provider,
  RunEvent,
  RunInput,
  RunMode,
  RunStatus,
} from "@/domain/contracts";
import { Dialog, Select } from "./ui";

const Report = dynamic(
  () => import("./report").then((module) => module.Report),
  {
    loading: () => (
      <div className="report-loading" role="status">
        正在加载报告与图表…
      </div>
    ),
  },
);

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
const statusNames: Record<RunStatus, string> = {
  queued: "等待执行",
  running: "研究中",
  completed: "已完成",
  failed: "未完成",
  cancelled: "已取消",
};
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
  const [page, setPage] = useState<"overview" | "history" | "help">("overview");
  const [outputTab, setOutputTab] = useState<"report" | "events">("report");
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyFilter, setHistoryFilter] = useState("all");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
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
  const [historyLoaded, setHistoryLoaded] = useState(false);
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
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const selected = modes.find((m) => m.id === mode)!;
  const refreshHistory = useCallback(async () => {
    const result = await api<{ runs: HistoryItem[] }>("/api/runs");
    setHistory(result.runs);
    setHistoryLoaded(true);
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
    setPage("overview");
    setOutputTab("report");
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
    setPage("overview");
    setOutputTab("report");
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

  const connected = Boolean(bootstrap?.connection.connected);
  const model = bootstrap?.providers.find((p) => p.id === provider);
  const canSubmit =
    !busy &&
    connected &&
    prompt.trim().length >= 2 &&
    Boolean(model?.available);
  const visibleHistory = history.filter(
    (item) =>
      (historyFilter === "all" ||
        (historyFilter === "running"
          ? ["queued", "running"].includes(item.status)
          : item.status === historyFilter)) &&
      (item.input.prompt + item.input.symbol)
        .toLowerCase()
        .includes(historyQuery.toLowerCase()),
  );
  function selectMode(next: RunMode) {
    if (next !== mode || page !== "overview") newResearch();
    setMode(next);
    setPage("overview");
    setMobileNav(false);
    requestId.current = null;
  }
  function useExample() {
    setPrompt(selected.prompt.replace("BTC", symbol.replace(/USDT$/, "")));
    requestId.current = null;
    document
      .getElementById("research-question")
      ?.focus({ preventScroll: true });
  }
  function taskTabs() {
    return (
      <div className="task-tabs" role="tablist" aria-label="研究类型">
        {modes.map((m) => (
          <button
            key={m.id}
            id={"tab-" + m.id}
            role="tab"
            aria-selected={mode === m.id}
            aria-controls="research-workspace"
            tabIndex={mode === m.id ? 0 : -1}
            onKeyDown={(event) => {
              if (
                !["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const at = modes.findIndex((item) => item.id === mode);
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? 2
                    : (at + (event.key === "ArrowRight" ? 1 : 2)) % 3;
              selectMode(modes[next].id);
              document.getElementById("tab-" + modes[next].id)?.focus();
            }}
            className={mode === m.id ? "active" : ""}
            onClick={() => selectMode(m.id)}
          >
            {m.title}
            {m.id === "backtest" && <span className="tab-badge">模拟</span>}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="app-shell" data-theme={theme}>
      <a href="#main-content" className="skip-link">
        跳转到主要内容
      </a>
      <header className="global-header">
        <Link href="/" className="brand" aria-label="Agent OS 首页">
          <Mark />
          <span>Agent OS</span>
        </Link>
        <span className="brand-divider" />
        <nav className="global-nav" aria-label="主导航">
          <button
            className={
              page === "overview" && mode === "research" ? "active" : ""
            }
            onClick={() => selectMode("research")}
          >
            市场研究
          </button>
          <button
            className={
              page === "overview" && mode === "portfolio" ? "active" : ""
            }
            onClick={() => selectMode("portfolio")}
          >
            现货账户
          </button>
          <button
            className={
              page === "overview" && mode === "backtest" ? "active" : ""
            }
            onClick={() => selectMode("backtest")}
          >
            策略回测
          </button>
          <button onClick={() => setPage("history")}>研究记录</button>
          <a
            href="https://github.com/day0n/binance-agent-os"
            target="_blank"
            rel="noreferrer"
          >
            开源代码 <ExternalLink size={12} />
          </a>
        </nav>
        <div className="header-actions">
          <span className="independent-label">独立研究工具</span>
          <button
            className="primary-button connect-button"
            disabled={busy || !bootstrap}
            onClick={() =>
              connected ? setSettings(true) : void connectBinance()
            }
          >
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Link2 size={16} />
            )}
            {connected ? "已连接" : "连接币安"}
          </button>
          <button
            className="icon-button desktop-action"
            aria-label="研究记录"
            data-tooltip="研究记录"
            onClick={() => setPage("history")}
          >
            <Clock3 size={21} />
          </button>
          <button
            className="icon-button"
            aria-label="连接与偏好"
            data-tooltip="连接与偏好"
            onClick={() => setSettings(true)}
          >
            <Settings2 size={21} />
          </button>
          <button
            className="icon-button desktop-action"
            aria-label={theme === "dark" ? "切换浅色模式" : "切换深色模式"}
            data-tooltip={theme === "dark" ? "浅色模式" : "深色模式"}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Moon size={22} /> : <Sun size={22} />}
          </button>
          <button
            className="icon-button mobile-menu"
            aria-label="打开导航"
            onClick={() => setMobileNav(true)}
          >
            <Menu size={23} />
          </button>
        </div>
      </header>

      <main id="main-content" className="workspace">
        <nav className="page-tabs" aria-label="工作台页面">
          {(
            [
              { id: "overview", name: "总览" },
              { id: "history", name: "研究记录" },
              { id: "help", name: "使用指南" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              aria-current={page === item.id ? "page" : undefined}
              className={page === item.id ? "active" : ""}
              onClick={() => setPage(item.id)}
            >
              {item.name}
            </button>
          ))}
        </nav>

        {error && (
          <div className="message-banner error-banner" role="alert">
            <Info size={18} />
            <span>{error}</span>
            <button
              className="icon-button"
              aria-label="关闭错误"
              onClick={() => setError(null)}
            >
              <X size={18} />
            </button>
          </div>
        )}
        {notice && (
          <div className="message-banner notice" role="status">
            <CheckCircle2 size={18} />
            <span>{notice}</span>
            <button
              className="icon-button"
              aria-label="关闭提示"
              onClick={() => setNotice(null)}
            >
              <X size={18} />
            </button>
          </div>
        )}

        {page === "overview" && (
          <>
            <div className="overview-cards" aria-label="工作台状态">
              <section className="overview-card">
                <button
                  className="card-title"
                  onClick={() => setSettings(true)}
                >
                  <span>Binance MCP</span>
                  <span>
                    管理 <ChevronRight size={14} />
                  </span>
                </button>
                <div className="overview-row">
                  <span>
                    <span className="mini-icon yellow">
                      <Link2 size={14} />
                    </span>
                    数据来源
                  </span>
                  <strong>官方 MCP</strong>
                </div>
                <div className="overview-row">
                  <span>
                    <span className="mini-icon muted">
                      <Activity size={14} />
                    </span>
                    连接状态
                  </span>
                  <strong className={connected ? "positive" : "subtle"}>
                    {!bootstrap ? (
                      <span className="skeleton" />
                    ) : connected ? (
                      "已连接"
                    ) : (
                      "待授权"
                    )}
                  </strong>
                </div>
                <div className="overview-row">
                  <span>
                    <span className="mini-icon muted">
                      <ShieldCheck size={14} />
                    </span>
                    访问权限
                  </span>
                  <strong>仅只读</strong>
                </div>
              </section>
              <section className="overview-card">
                <button
                  className="card-title"
                  onClick={() => setSettings(true)}
                >
                  <span>模型服务</span>
                  <span>
                    设置 <ChevronRight size={14} />
                  </span>
                </button>
                <div className="overview-row">
                  <span>
                    <span className="mini-icon violet">✦</span>Gemini
                  </span>
                  <strong>
                    {bootstrap?.providers
                      .find((p) => p.id === "gemini")
                      ?.model.replace("gemini-", "")
                      .replace("-flash", " Flash") ?? (
                      <span className="skeleton" />
                    )}
                  </strong>
                </div>
                <div className="overview-row">
                  <span>思考强度</span>
                  <strong className="accent">
                    HIGH <span className="small-label">最高档位</span>
                  </strong>
                </div>
                <div className="overview-row">
                  <span>调用方式</span>
                  <strong>Vertex AI</strong>
                </div>
              </section>
              <section className="overview-card">
                <button
                  className="card-title"
                  onClick={() => setSettings(true)}
                >
                  <span>风险与权限</span>
                  <span>
                    查看 <ChevronRight size={14} />
                  </span>
                </button>
                <div className="overview-row">
                  <span>
                    <span className="mini-icon green">
                      <Wallet size={14} />
                    </span>
                    账户范围
                  </span>
                  <strong>仅现货</strong>
                </div>
                <div className="overview-row">
                  <span>实盘交易</span>
                  <strong className="subtle">未开放</strong>
                </div>
                <div className="overview-row">
                  <span>风险限额</span>
                  <strong className={policyEnabled ? "accent" : ""}>
                    {policyEnabled ? "已设置" : "自主设置"}
                  </strong>
                </div>
              </section>
              <section className="overview-card">
                <button
                  className="card-title"
                  onClick={() => setPage("history")}
                >
                  <span>最近研究</span>
                  <span>
                    更多 <ChevronRight size={14} />
                  </span>
                </button>
                <div className="overview-row">
                  <span>
                    <span className="mini-icon blue">
                      <FileText size={14} />
                    </span>
                    最近记录
                  </span>
                  <strong className="numeric">
                    {historyLoaded ? history.length : "—"}
                  </strong>
                </div>
                <div className="overview-row">
                  <span>已完成</span>
                  <strong className="numeric">
                    {historyLoaded
                      ? history.filter((h) => h.status === "completed").length
                      : "—"}
                  </strong>
                </div>
                <div className="overview-row">
                  <span>进行中</span>
                  <strong className="numeric">
                    {historyLoaded
                      ? history.filter((h) =>
                          ["running", "queued"].includes(h.status),
                        ).length
                      : "—"}
                  </strong>
                </div>
              </section>
            </div>

            <div className="market-toolbar">
              {taskTabs()}
              <button className="text-button" onClick={newResearch}>
                <Plus size={17} />
                新建研究
              </button>
            </div>
            <div className="asset-filters" aria-label="快捷选择交易对">
              <span className="filter-label">交易对</span>
              {["BTC", "ETH", "BNB", "SOL"].map((asset) => (
                <button
                  key={asset}
                  aria-pressed={symbol === asset + "USDT"}
                  className={
                    "filter-chip" +
                    (symbol === asset + "USDT" ? " selected" : "")
                  }
                  disabled={running}
                  onClick={() => {
                    setSymbol(asset + "USDT");
                    requestId.current = null;
                  }}
                >
                  {asset}
                  <span>/ USDT</span>
                </button>
              ))}
              <span className="readonly-label">
                <ShieldCheck size={14} />
                仅分析，不执行交易
              </span>
            </div>
            <section
              id="research-workspace"
              role="tabpanel"
              aria-labelledby={"tab-" + mode}
            >
              <div className="workspace-heading">
                <h1>{selected.title}</h1>
                <p>
                  {selected.description}。基于真实数据，交叉验证观点与风险。
                </p>
              </div>
              <div className="desk-grid">
                <div className="main-column">
                  <section className="composer panel" aria-label="创建研究任务">
                    <div className="panel-heading">
                      <h2>
                        <Search size={18} />
                        创建研究
                      </h2>
                      <span className="connection-state">
                        <i
                          className={
                            connected ? "status-dot online" : "status-dot"
                          }
                        />
                        {connected ? "数据源已连接" : "等待连接数据源"}
                      </span>
                    </div>
                    <div className="input-settings">
                      <div className="field">
                        <label htmlFor="pair">交易对</label>
                        <div className="input-with-icon">
                          <Search size={16} />
                          <input
                            id="pair"
                            aria-label="交易对"
                            value={symbol}
                            maxLength={19}
                            spellCheck={false}
                            autoComplete="off"
                            onChange={(e) => {
                              setSymbol(e.target.value.toUpperCase());
                              requestId.current = null;
                            }}
                            disabled={running}
                          />
                        </div>
                      </div>
                      <div className="field">
                        <span className="field-label">K 线周期</span>
                        <Select
                          label="K 线周期"
                          value={interval}
                          disabled={running}
                          options={[
                            { value: "1d", label: "1 天" },
                            { value: "4h", label: "4 小时" },
                            { value: "1h", label: "1 小时" },
                          ]}
                          onChange={(value) => {
                            setIntervalValue(value);
                            requestId.current = null;
                          }}
                        />
                      </div>
                      <div className="field">
                        <span className="field-label">样本范围</span>
                        <Select
                          label="样本范围"
                          value={String(days)}
                          disabled={running}
                          options={[
                            { value: "90", label: "最近 90 天" },
                            { value: "180", label: "最近 180 天" },
                            { value: "365", label: "最近 365 天" },
                          ]}
                          onChange={(value) => {
                            setDays(Number(value));
                            requestId.current = null;
                          }}
                        />
                      </div>
                    </div>
                    {mode === "portfolio" && (
                      <div className="inline-note">
                        <Info size={15} />
                        覆盖全部已授权现货资产，交易对设置不限制账户范围。
                      </div>
                    )}
                    {mode === "backtest" && (
                      <div className="backtest-controls">
                        <div className="field">
                          <span className="field-label">回测策略</span>
                          <Select
                            label="回测策略"
                            value={strategy}
                            disabled={running}
                            options={[
                              {
                                value: "sma_cross",
                                label: "均线交叉 · 10 / 30",
                              },
                              {
                                value: "rsi_reversion",
                                label: "RSI 均值回归 · 14",
                              },
                              { value: "buy_hold", label: "买入持有" },
                            ]}
                            onChange={(value) => {
                              setStrategy(value);
                              requestId.current = null;
                            }}
                          />
                        </div>
                        <div className="field">
                          <label htmlFor="fees">
                            手续费 / 边 <span className="subtle">(bps)</span>
                          </label>
                          <input
                            id="fees"
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
                        </div>
                        <div className="field">
                          <label htmlFor="slippage">
                            滑点 / 边 <span className="subtle">(bps)</span>
                          </label>
                          <input
                            id="slippage"
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
                        </div>
                      </div>
                    )}
                    <div className="question-field">
                      <div className="question-label">
                        <label htmlFor="research-question">研究问题</label>
                        <button
                          className="text-button"
                          onClick={useExample}
                          disabled={running}
                        >
                          使用示例 <ChevronRight size={14} />
                        </button>
                      </div>
                      <textarea
                        id="research-question"
                        aria-label="研究问题"
                        value={prompt}
                        maxLength={4000}
                        placeholder={selected.prompt.replace(
                          "BTC",
                          symbol.replace(/USDT$/, ""),
                        )}
                        disabled={running}
                        onChange={(e) => {
                          setPrompt(e.target.value);
                          requestId.current = null;
                        }}
                        onKeyDown={(e) => {
                          if (
                            (e.metaKey || e.ctrlKey) &&
                            e.key === "Enter" &&
                            canSubmit &&
                            !running
                          ) {
                            e.preventDefault();
                            void submit();
                          }
                        }}
                      />
                      <span className="character-count">
                        {prompt.length} / 4000
                      </span>
                    </div>
                    <div className="composer-bottom">
                      <div className="model-select">
                        <span className="model-symbol">✦</span>
                        <Select
                          label="模型提供商"
                          compact
                          value={provider}
                          disabled={running}
                          options={[
                            {
                              value: "gemini",
                              label: "Gemini · HIGH",
                              disabled: !bootstrap?.providers.find(
                                (p) => p.id === "gemini",
                              )?.available,
                            },
                            {
                              value: "openai",
                              label: "OpenAI",
                              disabled: !bootstrap?.providers.find(
                                (p) => p.id === "openai",
                              )?.available,
                            },
                            {
                              value: "anthropic",
                              label: "Anthropic",
                              disabled: !bootstrap?.providers.find(
                                (p) => p.id === "anthropic",
                              )?.available,
                            },
                          ]}
                          onChange={(value) => {
                            setProvider(value as Provider);
                            requestId.current = null;
                          }}
                        />
                      </div>
                      {running ? (
                        <button
                          className="secondary-button"
                          onClick={() => void cancel()}
                        >
                          <Square size={13} />
                          停止研究
                        </button>
                      ) : (
                        <button
                          className="primary-button start-button"
                          disabled={!canSubmit}
                          onClick={() => void submit()}
                        >
                          {busy && <LoaderCircle size={16} className="spin" />}
                          开始研究
                          <ArrowRight size={17} />
                        </button>
                      )}
                    </div>
                    <div className="composer-note">
                      <ShieldCheck size={14} />
                      <span>
                        {!connected
                          ? "完成币安 OAuth 授权后开始使用。凭据仅保存在服务端。"
                          : !capabilitiesReady
                            ? "只读工具尚待审核；未配置时明确报错，不使用模拟行情。"
                            : "只读工具已配置。研究结果将附带数据来源与时间。"}
                      </span>
                      {!connected && (
                        <button
                          className="text-button"
                          disabled={busy || !bootstrap}
                          onClick={() => void connectBinance()}
                        >
                          去连接
                          <ChevronRight size={13} />
                        </button>
                      )}
                    </div>
                  </section>
                  {run && (
                    <section
                      className="run-summary panel"
                      aria-label="当前任务"
                    >
                      <span className={"run-status " + run.status}>
                        {running && <LoaderCircle size={14} className="spin" />}
                        {statusNames[run.status]}
                      </span>
                      <span className="mono">{run.id.slice(0, 8)}</span>
                      <span>{run.modelCalls} 次模型调用</span>
                      <span>{run.toolCalls} 次工具调用</span>
                      <span>{number(run.tokens)} tokens</span>
                    </section>
                  )}
                  <section className="output-section">
                    <div className="output-toolbar">
                      <div className="output-tabs">
                        <button
                          aria-pressed={outputTab === "report"}
                          className={outputTab === "report" ? "active" : ""}
                          onClick={() => setOutputTab("report")}
                        >
                          研究报告
                        </button>
                        <button
                          aria-pressed={outputTab === "events"}
                          className={outputTab === "events" ? "active" : ""}
                          onClick={() => setOutputTab("events")}
                        >
                          执行记录<span>{events.length}</span>
                        </button>
                        <button
                          onClick={() => setShowEvidence(true)}
                          disabled={!report}
                        >
                          证据索引
                        </button>
                      </div>
                      <button
                        className="icon-button"
                        aria-label="下载研究报告"
                        disabled={!report}
                        onClick={downloadReport}
                      >
                        <ArrowDownToLine size={19} />
                      </button>
                    </div>
                    {outputTab === "report" ? (
                      report ? (
                        <Report
                          report={report}
                          onEvidence={() => setShowEvidence(true)}
                          onDownload={downloadReport}
                        />
                      ) : (
                        <div className="results-empty">
                          <div
                            className={
                              "empty-illustration" +
                              (running ? " is-working" : "")
                            }
                          >
                            <FileText size={42} strokeWidth={1.35} />
                            <span>
                              {running ? (
                                <LoaderCircle size={16} className="spin" />
                              ) : (
                                <Search size={16} />
                              )}
                            </span>
                          </div>
                          <h3>{running ? "研究正在进行" : "暂无研究报告"}</h3>
                          <p>
                            {running
                              ? "Agent 正在分析数据。执行记录会持续更新，已保存的任务可从研究记录中继续查看。"
                              : "选择交易对并提出问题，获取有依据、可追溯的研究报告。"}
                          </p>
                          {!running && (
                            <button
                              className="text-button"
                              onClick={useExample}
                            >
                              从示例问题开始
                              <ArrowRight size={15} />
                            </button>
                          )}
                        </div>
                      )
                    ) : (
                      <div className="event-table table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>时间</th>
                              <th>执行节点</th>
                              <th>状态与说明</th>
                            </tr>
                          </thead>
                          <tbody>
                            {events.length ? (
                              events.map((e) => (
                                <tr key={e.id}>
                                  <td className="numeric">{date(e.at)}</td>
                                  <td>{e.role ? roleNames[e.role] : "系统"}</td>
                                  <td>{e.message}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={3}>
                                  <div className="table-empty">
                                    <Clock3 size={32} />
                                    <p>暂无执行记录</p>
                                    <span>
                                      启动研究后，节点状态和工具摘要将在这里更新。
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </div>
                <aside className="inspector" aria-label="研究协作与证据">
                  <section className="panel pipeline">
                    <div className="panel-heading">
                      <h2>Agent 协作</h2>
                      <span className="subtle">{roles.length} 个节点</span>
                    </div>
                    <p className="panel-description">
                      独立分工，共享同一份证据
                    </p>
                    <ol className="pipeline-list">
                      {roles.map((role, index) => {
                        const done = events.some(
                          (e) =>
                            e.type === "agent.completed" && e.role === role,
                        );
                        const active =
                          !done &&
                          events.some(
                            (e) =>
                              e.type === "agent.started" && e.role === role,
                          );
                        return (
                          <li
                            className={
                              "pipeline-node" +
                              (done ? " done" : "") +
                              (active && running ? " in-progress" : "")
                            }
                            key={role}
                          >
                            <div className="node-indicator">
                              {done ? (
                                <Check size={13} />
                              ) : active && running ? (
                                <LoaderCircle size={13} className="spin" />
                              ) : (
                                index + 1
                              )}
                            </div>
                            <div>
                              <strong>{roleNames[role]}</strong>
                              <small>
                                {
                                  {
                                    supervisor: "任务规划与边界",
                                    market: "趋势、波动与量价",
                                    portfolio: "估值、集中度与敞口",
                                    strategy: "策略、基准与假设",
                                    bull: "支持观点与适用条件",
                                    bear: "反证与未覆盖风险",
                                    risk: "确定性风控检查",
                                    report: "综合结论与证据",
                                  }[role]
                                }
                              </small>
                            </div>
                            {done ? (
                              <span className="node-label">完成</span>
                            ) : active && running ? (
                              <span className="node-label">进行中</span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                  <section className="panel evidence-summary">
                    <div className="panel-heading">
                      <h2>
                        <BookOpen size={17} />
                        证据索引
                      </h2>
                      <span className="numeric subtle">
                        {report?.evidence.length ?? 0}
                      </span>
                    </div>
                    <p>
                      {report
                        ? report.evidence.filter(
                            (e) => e.source === "binance_mcp",
                          ).length +
                          " 份官方来源 · " +
                          report.evidence.filter(
                            (e) => e.source === "calculation",
                          ).length +
                          " 份计算产物"
                        : "每份数据保留来源、获取时间与内容哈希，让结论可以核验。"}
                    </p>
                    <button
                      className="text-button"
                      disabled={!report}
                      onClick={() => setShowEvidence(true)}
                    >
                      查看全部证据
                      <ChevronRight size={14} />
                    </button>
                  </section>
                  <div className="safety-note">
                    <Shield size={17} />
                    <p>
                      只研究，不交易。
                      <br />
                      研究观点不构成投资建议。
                    </p>
                  </div>
                </aside>
              </div>
            </section>
          </>
        )}

        {page === "history" && (
          <section className="history-page page-section">
            <div className="section-title">
              <div>
                <h1>研究记录</h1>
                <p>每一次分析，都有完整的执行过程与证据。</p>
              </div>
              <button className="primary-button" onClick={newResearch}>
                <Plus size={17} />
                新建研究
              </button>
            </div>
            <div className="history-toolbar">
              <div className="status-filters">
                {[
                  { id: "all", name: "全部" },
                  { id: "running", name: "进行中" },
                  { id: "completed", name: "已完成" },
                  { id: "failed", name: "未完成" },
                  { id: "cancelled", name: "已取消" },
                ].map((f) => (
                  <button
                    key={f.id}
                    className={
                      "filter-chip" +
                      (historyFilter === f.id ? " selected" : "")
                    }
                    aria-pressed={historyFilter === f.id}
                    onClick={() => setHistoryFilter(f.id)}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
              <div className="input-with-icon history-search">
                <Search size={18} />
                <input
                  aria-label="搜索研究记录"
                  value={historyQuery}
                  onChange={(e) => setHistoryQuery(e.target.value)}
                  placeholder="搜索交易对或研究问题"
                />
              </div>
            </div>
            <div className="table-wrap">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>研究任务</th>
                    <th>交易对</th>
                    <th>类型</th>
                    <th>状态</th>
                    <th>创建时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleHistory.length ? (
                    visibleHistory.map((item) => (
                      <tr key={item._id}>
                        <td>
                          <button
                            className="history-title"
                            onClick={() => void openRun(item)}
                          >
                            <FileText size={18} />
                            <span>{item.input.prompt}</span>
                          </button>
                        </td>
                        <td className="numeric">{item.input.symbol}</td>
                        <td>
                          {modes.find((m) => m.id === item.input.mode)?.title}
                        </td>
                        <td>
                          <span className={"run-status " + item.status}>
                            {statusNames[item.status]}
                          </span>
                        </td>
                        <td className="numeric">{date(item.createdAt)}</td>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => void openRun(item)}
                          >
                            查看
                            <ChevronRight size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>
                        <div className="table-empty">
                          <FileText size={38} strokeWidth={1.3} />
                          <h3>
                            {!historyLoaded
                              ? error
                                ? "暂时无法加载记录"
                                : "正在加载研究记录"
                              : historyQuery || historyFilter !== "all"
                                ? "未找到匹配的研究"
                                : "暂无研究记录"}
                          </h3>
                          <p>
                            {!historyLoaded
                              ? error
                                ? "请检查上方错误提示后重试。"
                                : "正在读取当前会话的研究历史。"
                              : historyQuery || historyFilter !== "all"
                                ? "尝试其他关键词或筛选条件。"
                                : "完成研究后，可以在这里回看报告与执行过程。"}
                          </p>
                          <button className="text-button" onClick={newResearch}>
                            开始第一份研究
                            <ArrowRight size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="table-note">
              显示当前浏览器会话最近 50 条记录。切换页面不会取消后台任务。
            </p>
          </section>
        )}

        {page === "help" && (
          <section className="help-page page-section">
            <div className="section-title">
              <div>
                <h1>开始你的第一份研究</h1>
                <p>连接真实数据，用证据检验每一个观点。</p>
              </div>
            </div>
            <div className="guide-steps">
              {[
                {
                  title: "连接币安",
                  icon: Link2,
                  body: "由你本人完成官方 OAuth 授权。连接凭据加密存放在服务端，不进入模型上下文。",
                },
                {
                  title: "提出研究问题",
                  icon: Search,
                  body: "选择市场研究、现货体检或策略回测，设定交易对、时间范围和明确的问题。",
                },
                {
                  title: "核验报告与证据",
                  icon: FileText,
                  body: "查看分析结论、不同观点和风险约束，追溯原始数据与计算结果。",
                },
              ].map((s, i) => (
                <section className="panel guide-step" key={s.title}>
                  <span className="step-number">0{i + 1}</span>
                  <s.icon size={30} />
                  <h2>{s.title}</h2>
                  <p>{s.body}</p>
                </section>
              ))}
            </div>
            <h2 className="faq-title">常见问题</h2>
            <div className="faq-list">
              {[
                [
                  "工作台会自动下单吗？",
                  "不会。服务端只允许经过审核的读取工具，不提供交易、转账、借贷或提现功能。",
                ],
                [
                  "为什么连接后仍可能无法开始研究？",
                  "数据连接、模型和已审核工具都必须可用。依赖异常或工具尚未配置会明确报错，不会拿模拟行情代替。",
                ],
                [
                  "回测中的费用和滑点是什么？",
                  "两者是你指定的模拟假设，以基点（bps）计算，1 bps = 0.01%。信号形成后才在下一根 K 线开盘模拟成交，历史收益不代表未来表现。",
                ],
                [
                  "如何设置风险限额？",
                  "打开右上角“连接与偏好”，显式启用下一次任务的风险限额。未设置时只输出分析，不生成具体仓位调整数量。",
                ],
                [
                  "这是币安官方产品吗？",
                  "不是。这是面向 Binance Agent OS 赛道一的独立开源项目，使用官方 MCP 作为数据接口，不代表币安官方。",
                ],
              ].map(([q, a]) => (
                <details key={q}>
                  <summary>
                    {q}
                    <Plus size={20} />
                  </summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
            <div className="guide-actions">
              <button className="primary-button" onClick={newResearch}>
                进入研究工作台
                <ArrowRight size={16} />
              </button>
              <a
                className="text-button"
                href="https://github.com/day0n/binance-agent-os"
                target="_blank"
                rel="noreferrer"
              >
                查看开源文档
                <ExternalLink size={14} />
              </a>
            </div>
          </section>
        )}

        <footer className="workspace-footer">
          <span>
            <ShieldCheck size={14} />
            独立项目 · 非币安官方产品
          </span>
          <span>Binance Agent OS · 仅研究，不执行交易</span>
        </footer>
      </main>

      <button
        className="support-button"
        aria-label="打开使用指南"
        data-tooltip="使用指南"
        onClick={() => {
          setPage("help");
          window.scrollTo({
            top: 0,
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
              .matches
              ? "instant"
              : "smooth",
          });
        }}
      >
        <Headphones size={25} strokeWidth={2.4} />
      </button>

      {mobileNav && (
        <Dialog title="导航" drawer onClose={() => setMobileNav(false)}>
          <nav className="mobile-navigation" aria-label="移动端导航">
            {modes.map((m) => (
              <button key={m.id} onClick={() => selectMode(m.id)}>
                <m.icon size={20} />
                {m.title}
                <ChevronRight size={16} />
              </button>
            ))}
            <button
              onClick={() => {
                setPage("history");
                setMobileNav(false);
              }}
            >
              <Clock3 size={20} />
              研究记录
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => {
                setPage("help");
                setMobileNav(false);
              }}
            >
              <Info size={20} />
              使用指南
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}切换
              {theme === "dark" ? "浅色" : "深色"}模式
            </button>
            <a
              href="https://github.com/day0n/binance-agent-os"
              target="_blank"
              rel="noreferrer"
            >
              <GitBranch size={20} />
              开源代码
              <ExternalLink size={15} />
            </a>
          </nav>
          <p className="mobile-disclaimer">独立研究工具 · 非币安官方产品</p>
        </Dialog>
      )}

      {settings && (
        <Dialog title="连接与偏好" onClose={() => setSettings(false)}>
          {error && (
            <div className="message-banner error-banner" role="alert">
              <Info size={17} />
              <span>{error}</span>
            </div>
          )}
          <section className="settings-block">
            <div className="settings-title">
              <h3>Binance 官方 MCP</h3>
              <span className={"status-tag" + (connected ? " connected" : "")}>
                {connected ? "已连接" : "未连接"}
              </span>
            </div>
            <p>
              首次授权和币安侧撤权由你本人完成。OAuth 凭据仅加密保存在服务端。
            </p>
            <div className="settings-actions">
              <button
                className="primary-button"
                disabled={busy || !bootstrap}
                onClick={() => void connectBinance()}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Link2 size={16} />
                )}
                {connected ? "重新授权" : "连接币安"}
              </button>
              {connected && (
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
                    <Unplug size={18} />
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
          </section>
          <section className="settings-block">
            <h3>模型服务</h3>
            {bootstrap?.providers.map((p) => (
              <div className="provider-row" key={p.id}>
                <div>
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
                </div>
                <span className={p.available ? "positive" : "subtle"}>
                  {p.available ? "已配置" : "待配置"}
                </span>
              </div>
            ))}
            <p>
              Gemini 通过 Vertex AI 调用，使用 HIGH
              思考档位。不会静默降档或切换模型。
            </p>
          </section>
          <section className="settings-block">
            <label className="switch-label">
              <span>
                <strong>设置风险限额</strong>
                <small>仅应用于下一次研究任务</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label="为下一次任务显式设置风险限额"
                checked={policyEnabled}
                onChange={(e) => {
                  setPolicyEnabled(e.target.checked);
                  requestId.current = null;
                }}
              />
              <span className="switch-track" aria-hidden="true" />
            </label>
            <p>
              未启用时只分析风险，不生成具体仓位调整数量。以下限额需由你确认，不是投资建议。
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
          </section>
          <button
            className="primary-button modal-done"
            onClick={() => setSettings(false)}
          >
            完成
          </button>
        </Dialog>
      )}

      {showEvidence && report && (
        <Dialog
          title="证据与数据来源"
          wide
          onClose={() => setShowEvidence(false)}
        >
          <p className="evidence-intro">
            原始快照与确定性计算独立保存，以下引用均来自当前报告。
          </p>
          {report.evidence.map((e) => (
            <div className="evidence-item" key={e.id}>
              <div>
                <span className="tiny-tag">
                  {e.source === "binance_mcp" ? "官方 MCP" : "确定性计算"}
                </span>
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
                href={"/api/artifacts/" + e.id}
                target="_blank"
                rel="noreferrer"
              >
                查看原始产物
                <ExternalLink size={14} />
              </a>
            </div>
          ))}
        </Dialog>
      )}
    </div>
  );
}
