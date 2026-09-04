# 第三方与许可证

本仓库源码采用 Apache-2.0。完整声明见根目录 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。

采用的公开设计思路：

- Lumen：分层、Blueprint、工具目录、Provider 边界。不复用其私有源码或数据。
- TradingAgents：职责分工与多空复核。
- AI Hedge Fund：硬风控与模型解释分离。
- FinRobot：角色工具组织。

官方文档：

- [Binance Agentic MCP](https://developers.binance.com/en/docs/agent-native/mcp-server/agentic)
- [Binance Spot Trade REST](https://developers.binance.com/en/docs/catalog/core-trading-spot-trading/api/rest-api/trade)
- [Binance Spot API docs](https://github.com/binance/binance-spot-api-docs)
- [Cloud KMS 非对称加密](https://docs.cloud.google.com/kms/docs/asymmetric-encryption)
- [Vercel GCP OIDC](https://vercel.com/docs/oidc/gcp)

本应用不是币安官方产品，也不暗示官方背书。
