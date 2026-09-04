# Configuration and deployment

## 环境变量

| 配置 | 含义 |
| --- | --- |
| APP_ORIGIN | 唯一公开站点，Origin 校验基于它 |
| APP_SECRET | ≥32 随机字节 hex；通用加密，不再签名匿名 Cookie |
| AUTH_PEPPER | 密码与 CSRF 派生；生产必须独立于 APP_SECRET |
| APP_ENV | development / preview / production / test |
| MONGODB_URI / MONGODB_DB | 库名必须以 `binance_agent_os` 开头 |
| REDIS_URL / BAO_REDIS_URL | 实际 PING；键前缀 `binance-agent:` |
| GOOGLE_OC_JSON / GOOGLE_CLOUD_PROJECT | 仅 Gemini / Vertex，不授予 Executor |
| GEMINI_MODEL / GEMINI_THINKING_LEVEL | `gemini-3.8-flash` / `HIGH` |
| BINANCE_WRITES_ENABLED | 默认 false |
| BINANCE_PRODUCTION_WRITES_ENABLED | 默认 false |
| ACTION_MAX_USDT / ACTION_DAILY_MAX_USDT | 只能降低，不能超过 5 / 20 |
| EXECUTOR_URL / GCP_WIF_* / KMS_* | Cloud Run、WIF、KMS 公钥 |
| BINANCE_TOOL_BINDINGS_JSON | 审核后的 MCP 映射；空则网站不用 MCP |
| VERCEL_DEPLOY_SCOPE | 必须是 `niuzj0-5483s-projects` |

不要把真实密钥写入仓库、提示词、workflow journal、日志或截图。
不要从 OpenCreator Vercel 项目复制环境变量。

## 部署空间

`scripts/assert-deploy-target.mjs` 要求：

- 项目名 `binance-agent-os`
- scope `niuzj0-5483s-projects`
- 检测到 OpenCreator scope 立即退出

`scripts/configure-vercel.mjs` 先做上述断言，再写入个人项目环境。
生产与 Preview 分别配置。更换 `APP_SECRET` / `AUTH_PEPPER` 会使现有会话失效。

## 检查命令

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm --filter binance-executor test
pnpm --filter binance-executor build
pnpm migrate:chat -- --dry-run
pnpm assert:deploy
```

如果 Redis 不通，不得改成进程内计数并宣称生产已就绪。
`/api/health` 只表示进程存活。`/api/health/ready` 对 MongoDB / Redis 做实际 PING。
