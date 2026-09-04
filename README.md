# Binance Agent OS

中文优先的多轮 Chat Agent：市场研究、现货账户体检、策略回测，以及需密码确认的小额现货与 USDT 内部划转。
Next.js + TypeScript + Vercel Workflow + MongoDB + Redis + 可选 Cloud Run Executor。

默认推理模型：**Gemini 3.8 Flash / Vertex AI / HIGH**。
独立项目，非币安官方产品。研究观点不构成投资建议。

## 产品能力

- 本地用户名 + 密码账号；公开注册；首版不提供忘记密码。
- 多轮聊天、会话列表、SSE 进度、研究画布与证据。
- 现货市价单、限价单、单笔撤单，以及 Spot ↔ Funding 的 USDT 内部划转。
- 单笔不超过 5 USDT 等值，每用户每 UTC 日累计不超过 20 USDT 等值。
- 交易和划转必须展示精确预览，并重新输入当前账号密码；聊天里输入“确认”不会执行。

不支持合约、杠杆、Convert、Web3、外部转账、提现和任意链上操作。

## 数据与执行边界

- 行情、K 线、深度优先走 Binance 官方公共 REST。
- 网站账户与交易走用户自有 GCP 项目中的私有 Cloud Run Executor + API Key 信封。
- 官方 Agentic MCP 已在受支持客户端（Codex）上真实验证过只读工具；**自建网站 OAuth 仍不受支持**（错误 3346001）。
- 网站不得显示虚假的“MCP 已连接”。MCP 失败后不会静默切换还继续声称使用 MCP。

详见 [产品说明](docs/BINANCE_AGENT_OS.md)、[Chat API](docs/CHAT_API.md)、[执行器](docs/EXECUTOR.md)。

## 当前状态

本地账号、Chat 运行时、公共 REST 路由、加密连接信封、Executor 代码与 Chat UI 已实现。
自动化测试覆盖认证规则、额度、提案指纹、SSE 游标和 UI 壳层。

以下**不是**“真实交易已跑通”：

- 构建成功或部署成功。
- 未打开写入开关时的动作提案。
- 未在用户在场时完成的 Spot Testnet / Production canary。

真实接口分层记录见 [验收](docs/VALIDATION.md)。生产写入默认关闭。

## 本地开发

需要 Node.js 24、pnpm 10.23.0，可访问的 MongoDB、Redis 和 Vertex AI 服务账号。

1. 安装依赖：`pnpm install --frozen-lockfile`
2. 按 [.env.example](.env.example) 创建被 Git 忽略的 `.env.local`
3. 启动：`pnpm dev`
4. 检查：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:e2e`、`pnpm build`

敏感配置不能使用 `NEXT_PUBLIC_` 前缀。开发数据库固定使用 `binance_agent_os_dev`；
生产使用 `binance_agent_os`；Redis 使用 `binance-agent:` 前缀。

只部署到个人 Vercel 作用域 `niuzj0-5483s-projects` 的 `binance-agent-os` 项目，
不部署或修改 OpenCreator 的 Vercel 项目。

## 文档

- [产品定义](docs/BINANCE_AGENT_OS.md)
- [架构与恢复边界](docs/ARCHITECTURE.md)
- [Chat API](docs/CHAT_API.md)
- [安全模型](docs/SECURITY.md)
- [环境配置与个人空间部署](docs/CONFIGURATION.md)
- [Cloud Run Executor](docs/EXECUTOR.md)
- [验收记录](docs/VALIDATION.md)
- [生产 canary](docs/PRODUCTION_CANARY.md)
- [参赛演示脚本](docs/DEMO.md)
- [第三方与许可证](docs/THIRD_PARTY.md)

源码采用 Apache-2.0。
