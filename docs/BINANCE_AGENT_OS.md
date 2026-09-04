# Binance Agent OS 产品说明

将一次性任务表单改成多轮 Chat Agent。浏览器里是会话栏、对话和研究画布；
服务端用 Chat Workflow 编排研究与动作提案，MongoDB 保存权威状态。

## 已确定范围

| 包含 | 不包含 |
| --- | --- |
| 用户名密码注册 / 登录 / 退出 / 改密 | Clerk、邮箱验证码、忘记密码、MFA、管理后台 |
| 市场研究、现货体检、策略回测 | 合约、杠杆、Convert、Web3 |
| 现货市价 / 限价 / 单笔撤单 | 外部转账、提现、任意链上操作 |
| Spot ↔ Funding 的 USDT 内部划转 | 非 USDT 划转 |
| 单笔 ≤ 5 USDT，每日 ≤ 20 USDT | 环境变量提高硬上限 |
| 动作卡 + 当前账号密码确认 | 聊天输入“确认”执行 |

## 网站实际链路

```text
浏览器
  → Next.js / Vercel（个人项目 binance-agent-os）
      → Gemini 3.8 Flash / HIGH（Vertex；可继续使用已批准的 Gemini 服务账号）
      → MongoDB / Redis
      → Binance 公共 REST（行情 / K 线 / 深度）
      → Cloud Run Executor（账户、现货、USDT 划转；独立用户 GCP 项目）
```

官方 Agentic MCP 只在受支持客户端及未来获准的网站 OAuth 下启用。
当前自建网站 OAuth 被拒绝，因此生产网站使用 REST + API Key 信封，不显示“MCP 已连接”。

## 硬限制

- 市价买单使用 `quoteOrderQty <= 5 USDT`。
- 市价卖单按最新 best bid 估值，执行前再检查；漂移超过 1% 则提案失效。
- 限价单首版只允许 GTC，且 `quantity × price <= 5 USDT`。
- 内部划转只允许 `MAIN_FUNDING` / `FUNDING_MAIN`，资产固定 USDT。
- Spot Testnet 没有完整 `/sapi/*` 钱包能力，内部划转只能在生产环境做极小额人工验收。
- 成功订单或划转计入当日额度；后续撤单不返还。失败释放预留；`uncertain` 保留预留。

## 部署边界

- Vercel：`niuzj0-5483s-projects` / `binance-agent-os`。
- Cloud Run Executor：用户自有 GCP 项目。OpenCreator 服务账号只继续用于 Gemini。
- 不自动发布参赛帖、不自动提交活动表单、不在用户不在场时执行生产交易。
