# Architecture

## 分层

- domain：账号、Chat、动作、连接、行情标准化、指标、回测、确定性风控。无 HTTP / 数据库 / 模型 SDK。
- application：认证、Chat 路由、动作提案、金融规则、Agent Blueprint、紧凑研究上下文。
- adapters：公共 REST、MCP 适配器、Executor 客户端、Gemini/OpenAI/Anthropic、MongoDB、Redis。
- workflows：Chat、研究子图、动作执行；每个外部调用都是可恢复步骤。
- app / components：Next.js Route Handlers 与 Chat 产品界面。
- packages/executor-contracts、services/binance-executor、infra/gcp：隔离执行平面。

金融与领域代码不得 import Next.js、数据库客户端或模型 SDK。

## Chat 流程

```text
用户消息
  → Supervisor 结构化识别意图
  → 检查缺失参数与权限
  → 获取真实数据并生成 EvidenceRef
  → 按需调用 Market / Portfolio / Strategy
  → 需要研究判断时运行 Bull / Bear
  → 确定性计算与硬风控
  → Risk Reviewer
  → Report Composer 或 ActionProposal
```

Supervisor 不能直接调用交易接口。模型只能生成 `ActionDraft`；
确定性代码负责校验、补充交易规则并形成 `ActionProposal`。
缺少交易对、方向、金额、价格时必须追问，不能猜测。
聊天中的“确认”会被路由到 general，不会执行。

## 数据源

- 行情 / K 线 / 深度：Binance 公共 REST，EvidenceRef.source = `binance_public_rest`。
- 账户 / 交易：Cloud Run Executor + 加密信封，source = `binance_signed_rest`。
- MCP：仅当真实 OAuth 成功且工具 Schema 通过审计时启用，source = `binance_mcp`。
- 不允许 MCP 失败后静默切换并继续声称使用 MCP。

每条 EvidenceRef 记录真实数据源、时间范围、获取时间和快照 hash。

## 状态与恢复

MongoDB 是运行恢复、额度和动作状态的唯一权威来源。
`session_events.seq` 由会话计数器原子递增。SSE 用 `Last-Event-ID` 或 `cursor` 续传；
Redis 丢失只影响实时通知。

同一用户 `requestId` 幂等。同一会话一个活跃运行；每用户最多两个并行运行。
模型 Schema 错误最多修复一次，仍失败则明确结束。模型、数据源或账户不可用时明确失败，
不生成模拟成功结果。

旧匿名 Cookie 会话保留但不可被新用户读取，不自动认领、不删除。

## Gemini

显式使用 global 端点、`gemini-3.8-flash` 和 `HIGH`。
思考 token 计入用量，但不向用户展示私有思维链。
OpenCreator 的 Google 服务账号只继续用于 Gemini，不授予 Executor 权限。

## 金融计算

金额与价格使用 `decimal.js`。技术指标、收益、回撤、手续费、滑点、集中度和交易规则由 TypeScript 计算。
回测只使用已收盘 K 线：前一根收盘出信号，下一根开盘成交。手续费和滑点生效，结果可复现。
