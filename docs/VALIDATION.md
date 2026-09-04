# Validation record

Snapshot: 2026-09-04。分层记录真实接口与尚未执行的项目。
**构建成功、部署成功或模拟测试不等于真实交易已跑通。**

## 已真实通过

| 层 | 证据 | 结果 |
| --- | --- | --- |
| 静态检查 | `pnpm lint`、`pnpm typecheck` | 本分支通过 |
| 单元测试 | Vitest（认证、额度、提案指纹、公共 REST、回测、UI） | 本分支通过 |
| Executor 单测 | `pnpm --filter binance-executor test` | 允许列表、签名、划转不重试 |
| 生产构建 | `pnpm build` | Chat / auth / actions / connections 路由已生成 |
| 真实 Gemini | Vertex `gemini-3.8-flash` / HIGH | 此前本地与配置检查已通过；不是本轮新的生产 workflow 验收 |
| 官方 Agentic MCP（Codex） | 受支持客户端 OAuth + `tool_search` + ticker/klines | 此前真实通过；令牌不得导入网站 |
| 确定性回测 | 真实已收盘 K 线 + 手续费/滑点 | 此前 Codex 数据路径通过 |
| 部署边界脚本 | `assert-deploy-target` | 只允许个人 Vercel 项目 |

## 网站实际使用的链路

- 公共 REST：行情、K 线、深度；`api.binance.com` 被地域拦截时回退官方 `data-api.binance.vision`。
- 聊天市场研究：已收盘 K 线 + 确定性指标生成简报与证据；不编造模拟行情。回测仍走多 Agent 图。
- 本地用户名密码会话。
- API Key 信封 + 计划中的 Cloud Run Executor。
- **不**把网站显示成“MCP 已连接”。

## 自建网站 OAuth

Binance 仍拒绝任意自建网站 Agent OAuth（错误 3346001）。
受支持的 Codex 连接有效，但其 OAuth token 不得导出到 Vercel 网站。

## 自动化测试覆盖

- 用户名规范化、密码边界、scrypt、锁定阈值、模糊登录错误。
- Origin、Cookie 名与寿命、公开用户对象不含哈希。
- 聊天“确认”不进入 action；requestId 校验；SSE 游标；上下文截断。
- 5 / 20 USDT 额度、市价漂移 1%、proposalHash 篡改、划转 uncertain。
- 公共 REST 拒绝账户/提现路径；Vercel 客户端不解密信封。
- Playwright：未登录发送会打开注册/登录；移动端对话/研究页签。

这些是自动测试，不是 Testnet 或 Production canary。

## 尚未执行 / 必须人工在场

| 项 | 状态 |
| --- | --- |
| Cloud Run 私有访问、WIF、固定 NAT IP、KMS 仅在 Executor 解密 | 代码与 Terraform 已写，基础设施未在本轮验收 |
| Spot Testnet：账户读取、市价、限价、撤单、client ID 幂等 | 未执行 |
| Production canary：≤5 USDT 买单、1 USDT 双向划转 | 未执行；写开关保持关闭 |
| 生产网站端到端 Gemini HIGH workflow | 未在本轮重新跑 |
| 官方网站 OAuth | 仍不受支持 |

## 历史只读验收（2026-09-04 之前）

此前生产站点、bootstrap、Mongo/Redis PING、Codex MCP ticker/klines 和本地回测的记录仍然有效，
见本文件旧版描述：那是 MCP 只读检查点，不是三个生产 Web 交易流程的验收。
