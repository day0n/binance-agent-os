# Configuration and deployment

## 环境变量

| 配置                       | 含义                                                    |
| -------------------------- | ------------------------------------------------------- |
| APP_ORIGIN                 | 唯一公开 HTTPS 站点，Origin 校验与未来 OAuth 回调基于它 |
| APP_SECRET                 | 至少 32 随机字节的 hex；签名 Cookie 和加密连接          |
| APP_ENV                    | development / preview / production / test               |
| MONGODB_URI                | 服务端连接；不要把参考项目数据库名当成本应用的目标库    |
| MONGODB_DB                 | 生产 binance_agent_os；开发和预览 binance_agent_os_dev  |
| REDIS_URL                  | 可访问的实例地址；必须实际 PING 成功                    |
| BAO_REDIS_URL              | 独立 Marketplace Redis；配置后优先于旧 REDIS_URL        |
| GOOGLE_OC_JSON             | base64 编码的 Google 服务账号 JSON，仅服务端            |
| GOOGLE_CLOUD_PROJECT       | 与该账号 project_id 相匹配的 GCP 项目                   |
| GOOGLE_CLOUD_LOCATION      | global                                                  |
| GEMINI_MODEL               | gemini-3.8-flash                                        |
| GEMINI_THINKING_LEVEL      | HIGH；不接受静默降档                                    |
| GEMINI_MAX_OUTPUT_TOKENS   | 默认 32768，控制单次输出含思考的上限，不等于思考档位    |
| ROLE_MODELS_JSON           | 可选角色模型 ID 映射，同一 provider 内有效              |
| BINANCE_TOOL_BINDINGS_JSON | 审核后的确切工具映射，默认 {} 会阻止运行                |

OpenAI/Anthropic 接口保留为显式选择的可选 provider；不会自动切换来掩盖 Gemini 错误。
环境缺少密钥会返回配置错误，配置存在不代表真实调用已成功。

## 部署空间

每条 Vercel 命令都显式指定自己的 scope，并检查 .vercel/project.json 的 orgId、projectId。
不要依赖 CLI 当前默认团队。configure-vercel.mjs 额外要求 VERCEL_EXPECTED_ORG_ID 和
VERCEL_DEPLOY_SCOPE 与本地关联一致，且仅操作 binance-agent-os 项目。

脚本以标准输入向 Vercel 添加敏感环境变量，不把值写到命令参数或日志；已存在的键不会覆盖。
只在取得凭据持有人对目标空间的明确授权后使用。复用服务账号会共享 Google Cloud 权限与账单；
更独立的长期方案是专用、最小权限的 Vertex AI 服务账号。

生产与 Preview 分别配置。Binance 当前未支持本自建 Web Agent，网站 OAuth 入口保持禁用；
未来获得官方支持后，预览环境没有单独、公开可访问的固定 Origin 时仍不得启用 OAuth。
生产 APP_SECRET 不要随意更换：更换会使现有 Cookie 和加密令牌失效，必须重新授权。
环境变量变更后需要重新部署；部署完成后分别检查页面、bootstrap 与 ready 接口。

## 检查命令

- pnpm verify：静态检查、单元测试、生产构建。
- pnpm smoke:models gemini：真实单轮 Gemini 调用。
- pnpm exec tsx scripts/smoke-gemini-react.ts：真实两轮工具/签名回放。
- pnpm test:integration：仅 localhost + 开发库；随机 fixture 用户，清理仅限该用户数据。
- /api/health：进程存活，不代表依赖已验证。
- /api/health/ready：已有安全 Cookie 会话下的 MongoDB / Redis 实际 PING，不调用收费模型。

如果 Redis 不通，不得把限流改成进程内计数并宣称生产已就绪。
如果配置地址无法访问，先定位源实例、TLS、网络许可，再决定是否需要新实例授权。
生产项目使用 `BAO_` 前缀绑定独立 Redis，避免 Marketplace 覆盖或泄露参考项目的
`REDIS_URL`。应用仍统一以 `REDIS_URL` 语义使用连接，所有键继续使用
`binance-agent:<environment>:` 前缀。
