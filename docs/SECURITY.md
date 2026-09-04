# 安全模型

## 本地账号

- 用户名 ASCII：`[a-z0-9_][a-z0-9_-]{2,31}`，库内小写唯一。
- 密码 12～128 个 UTF-8 字节，不做 Unicode 归一化。
- `scrypt`：N=32768，r=8，p=1，keylen=64，每用户 16 字节 salt，外加 `AUTH_PEPPER`。
- Cookie `bao_auth`：32 字节 opaque token；浏览器只保存原文，MongoDB 只保存 SHA-256。
- HttpOnly、生产 Secure、SameSite=Lax、Path=/、绝对有效期 7 天。
- 登录失败统一模糊错误。连续 10 次失败锁定 15 分钟。
- 改密撤销该用户全部会话。
- 限流：注册每 IP 每小时 5 次；登录每 username+IP 每 15 分钟 10 次；密码确认每用户每 10 分钟 5 次。

## 写接口

同时校验登录 Cookie、精确 Origin、`X-CSRF-Token`、资源 `userId`。
API 查询始终带 `_id + userId`，不能查出后再前端过滤。

## 币安凭据

1. 浏览器向 `/api/connections/binance/encryption-context` 取 KMS RSA 公钥、enrollment 和 AAD。
2. 浏览器用 WebCrypto 生成 AES-256-GCM DEK，加密 API Key/Secret。
3. 用 KMS RSA-OAEP-3072-SHA256 包装 DEK。
4. Vercel 只保存信封，不接触 Secret 明文，也不能用 `APP_SECRET` 解开。
5. Cloud Run 用 KMS 解密并仅在内存中签名请求。

只读与交易 Key 不得使用相同指纹。生产 Key 必须配置 Cloud Run 静态出口 IP 白名单。
任何 Key 都必须关闭提现、杠杆、合约和期权；服务端通过 `apiRestrictions` 核对，不相信用户自报。

## 动作确认

聊天“确认”只会被当成普通文本。执行只接受动作卡上的密码确认。
确认记录绑定 `userId + actionId + proposalHash`，2 分钟过期，只能消费一次。
订单使用确定性 `newClientOrderId`；重试前先按 client ID 查询。
内部划转超时进入 `uncertain`，不得自动重试。

## 日志

禁止记录 Cookie、密码、API Key、Secret、签名、完整请求体和 KMS 明文。
Executor 使用结构化 redaction。审计日志只保存动作摘要、状态变化、操作者和时间。
