# Chat API

未登录用户可以看产品介绍。发送消息、管理会话、确认动作都必须登录。
所有写接口同时校验登录 Cookie、精确 Origin、`X-CSRF-Token` 和资源 `userId`。

## 账号

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/register` | `{ username, password }` |
| POST | `/api/auth/login` | `{ username, password }`，失败信息模糊 |
| POST | `/api/auth/logout` | 撤销当前会话 |
| POST | `/api/auth/change-password` | `{ currentPassword, newPassword }`，撤销全部会话 |
| GET | `/api/auth/me` | `{ user, csrfToken }`，不含密码字段 |

认证失败 401；CSRF / Origin / 归属失败 403；限流 429。

## 会话与消息

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/chat/messages` | `{ sessionId?, content, requestId }` |
| GET/POST | `/api/chat/sessions` | 列表 / 创建 |
| GET/PATCH/DELETE | `/api/chat/sessions/:id` | 读取、改标题、软删 |
| GET | `/api/chat/sessions/:id/messages` | 展示消息 |
| GET | `/api/chat/sessions/:id/events` | SSE；`Last-Event-ID` 或 `cursor` |
| POST | `/api/chat/sessions/:id/cancel` | 取消当前运行 |

行为：

- 未传 `sessionId` 时自动创建会话。
- 同一用户下 `requestId` 唯一；重复请求返回原运行。
- 同一会话只允许一个活跃运行；每用户最多两个并行会话运行。
- Redis 只做实时通知；断线后从 MongoDB `session_events` 补齐。
- 会话标题取首条用户消息前 28 个字符，不额外消耗模型。
- 模型只读取最近消息、会话摘要、结构化产物和必要证据。
- 不展示私有思维链。

旧 `/api/runs` 保留为兼容入口，需登录和 CSRF，不再作为主 UI。

## 连接与动作

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/connections/binance` | 已保存连接摘要 |
| POST | `/api/connections/binance/encryption-context` | KMS 公钥与 enrollment |
| POST | `/api/connections/binance` | 只接收密文信封，需当前密码 |
| POST | `/api/connections/binance/:id/verify` | Executor 核验权限 |
| DELETE | `/api/connections/binance/:id` | 删除连接，需当前密码 |
| GET | `/api/actions/:id` | 动作提案 |
| POST | `/api/actions/:id/confirm` | `{ proposalHash, password }` |
| POST | `/api/actions/:id/reject` | 拒绝提案 |

确认时服务端重算 `proposalHash`、验证密码、CAS 状态，并写入一次性确认记录（2 分钟、只能消费一次）。
Executor 再次独立校验动作状态、连接权限、额度和交易规则。
