# Binance MCP connection

## 官方地址

- MCP: https://agent.binance.com/mcp/agentic
- OAuth metadata: https://agent.binance.com/.well-known/oauth-authorization-server
- Protected-resource metadata: https://agent.binance.com/.well-known/oauth-protected-resource/gateway-mcp

未授权 initialize 返回 401；不能假设免登录行情。认证使用授权码与 PKCE S256。

## 当前支持边界（2026-09-04）

Binance 官方文档当前列出的客户端包括 Claude、Codex、ChatGPT、VS Code 与 Grok Bot，
并说明其他 Agent 将继续扩展。实测把本站 HTTPS 元数据 URL 作为 `client_id` 发起授权时，
Binance 返回错误 3346001“当前 Agent 暂时不支持”。因此：

- 生产网站不再展示一个必然失败的“连接币安”按钮。
- 不冒用 `codex` client ID，也不从 Codex 凭据存储导出令牌给网站。
- `/api/auth/binance/connect` 当前明确返回 `BINANCE_WEB_CLIENT_UNSUPPORTED`。
- 保留 OAuth 适配器代码，等待 Binance 正式支持自建 Web Agent 后再启用并复验。

官方说明：https://developers.binance.com/en/docs/agent-native/mcp-server/agentic

## 已验证的 Codex 连接

使用官方文档给出的 Codex 客户端标识完成 OAuth：

```sh
codex mcp add binance-mcp-server \
  --url https://agent.binance.com/mcp/agentic \
  --oauth-client-id codex
```

用户本人在 Binance 页面完成授权。项目不读取、导出或复制 Codex 保存的 OAuth 令牌。
本次连接后已通过真实 MCP 完成 `tool_search`、`spot.ticker24hr` 和 `spot.klines` 只读调用。

断开连接删除应用内的加密令牌和未完成 state，不宣称币安侧授权已被撤销。
币安侧撤权由用户在其授权管理完成。

## 工具审核

当前工具发现确认 MCP 通过通用 `tool_execute` 执行已搜索到的工具。已核对的公开市场工具为
`spot.ticker24hr` 与 `spot.klines`；账户读取工具 `spot.getAccount` 仅完成名称和输入结构发现，
尚未执行。生产网站仍不预填无法使用其自身 OAuth 会话执行的工具绑定。

未来 Web Agent 获支持后，为 candles、prices、balances 等能力配置：

- name：官方返回的确切名称。
- schemaHash：该工具 inputSchema 的 SHA-256（工具目录接口会给出）。
- argumentMap：应用固定参数 symbol / interval / startTime / endTime / limit 到官方字段的映射。
- fixedArguments：审核后的固定读操作参数；通用 HTTP 工具必须固定 GET 和安全路径。
- resultPath：返回 JSON 中实际数据所在路径。

配置只可由服务端部署环境提供，不能由模型或浏览器修改。
工具名称完全匹配且 Schema 哈希不变才允许执行；Schema 更新后需要重新审核。
交易、转账、借贷、提现等名称或动作会被拒绝；readOnlyHint 不能独自授予权限。
工具返回为不可信数据，不具备更改系统权限或执行任意代码的能力。

## 数据契约

- candles：官方 OHLCV 数组或明确字段的标准化对象；需要完整时间范围和已收盘数据。
- balances：现货余额列表，资产、free、locked，允许从明确的 balances 字段提取。
- prices：明确 symbol/price 的 USDT 报价列表，不把缺价资产视为零。

如果授权后实际 Schema 不满足这些契约，需要添加经过测试的确定性适配器。
不能通过忽略错误、截短历史或改用虚构数据完成验收。
