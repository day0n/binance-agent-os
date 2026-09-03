# Binance MCP connection

## 官方地址

- MCP: https://agent.binance.com/mcp/agentic
- OAuth metadata: https://agent.binance.com/.well-known/oauth-authorization-server
- Protected-resource metadata: https://agent.binance.com/.well-known/oauth-protected-resource/gateway-mcp

本次未授权 initialize 返回 401；不能假设免登录行情。
认证使用授权码 + PKCE S256 + Client ID Metadata Document。
没有把 refresh_token 当成必定可用；过期后要求重新授权。

## 连接

1. 将应用部署到公开 HTTPS，确认 /.well-known/oauth-client.json 无需登录即可读取。
2. APP_ORIGIN 必须匹配该域名；元数据中的回调固定为 /api/auth/binance/callback。
3. 用户本人点击“连接币安”并完成币安授权，应用不替用户确认资金权限。
4. 在“连接与偏好”点击“检查工具目录”，读取实际的 tools/list。

断开连接删除应用内的加密令牌和未完成 state，不宣称币安侧授权已被撤销。
币安侧撤权由用户在其授权管理完成。

## 工具审核

未登录时工具名与 Schema 不可核验，因此仓库不预填猜测的工具名。
审核后为 candles、prices、balances 等能力配置：

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
