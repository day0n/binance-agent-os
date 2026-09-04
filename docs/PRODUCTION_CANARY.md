# Production canary

生产写入默认关闭。`BINANCE_WRITES_ENABLED` 与 `BINANCE_PRODUCTION_WRITES_ENABLED`
必须在用户在场时才打开，做完即关。构建成功或 Preview 通过不等于真实交易已跑通。

## 前置

- Cloud Run 私有访问与 WIF 已确认。
- 固定 NAT IP 已加入生产 API Key 白名单。
- KMS 解密只发生在 Executor。
- Spot Testnet 已人工确认市价、限价、撤单和 client ID 幂等。
- 内部划转不得伪造成 Testnet 已验证。

## 在场步骤

使用用户选定的高流动性 USDT 交易对，每笔单独输入当前账号密码，并留下脱敏记录：

1. 人工确认一笔不超过 5 USDT 的买单。
2. 人工确认 1 USDT Spot → Funding。
3. 人工确认 1 USDT Funding → Spot。

不自动卖出，不自动恢复仓位。后续撤单不返还当日额度。

## 禁止

- 无人值守打开生产写开关。
- 把 canary 写成“实盘交易已全面验收”。
- 使用 OpenCreator 的 Vercel 项目或把 Executor 权限授给 OpenCreator 服务账号。
