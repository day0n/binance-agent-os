# Binance Agent OS

中文优先的加密资产研究与风控工作台，面向 Binance Agent OS 赛道一。
Next.js + TypeScript + Vercel Workflow + MongoDB + Redis。

默认推理模型：**Gemini 3.8 Flash / Vertex AI / HIGH**。
应用只研究与模拟，不下单、不转账、不提现。独立项目，非币安官方产品。

## 三条研究路径

- **市场研究**：真实 MCP 行情 → 确定性指标 → 专业分析 → 多空论证 → 风险复核 → 证据报告。
- **现货体检**：授权账户 → 估值小计 / 未定价资产 → 集中度与敞口 → 只读风险报告。
- **策略实验室**：均线交叉、RSI 均值回归、买入持有；含手续费、滑点与下一根开盘成交，保留完整模拟记录。

没有真实数据时明确失败，绝不以演示行情代替真实接口。测试目录中的 fixtures 不进入产品数据路径。

## 当前状态

主体架构和界面已实现；Gemini HIGH 的真实单轮与多轮工具调用已验证。
**三个金融流程的端到端验收仍需用户完成币安 OAuth、审核实际 MCP 工具 Schema，并通过数据库与 Redis 就绪检查。**
空工具映射会安全阻止运行，不代表免登录行情已接通。详见 [验收记录](docs/VALIDATION.md)。

## 本地开发

需要 Node.js 24、pnpm 10.23.0，可访问的 MongoDB、Redis 和 Vertex AI 服务账号。

1. 安装依赖：pnpm install --frozen-lockfile
2. 按 [.env.example](.env.example) 创建被 Git 忽略的 .env.local。
3. 启动：pnpm dev
4. 检查：pnpm lint、pnpm typecheck、pnpm test、pnpm build

敏感配置不能使用 `NEXT_PUBLIC_` 前缀。开发数据库固定使用 binance_agent_os_dev；
生产使用 binance_agent_os；Redis 使用 binance-agent:<environment>: 前缀。

可选的 with-reference-env.mjs 脚本从显式提供的本地配置文件向子进程注入指定连接值，
不复制整份配置，不输出密钥。不要把参考项目的源码、素材或凭据提交到本仓库。

## 文档

- [架构与恢复边界](docs/ARCHITECTURE.md)
- [环境配置与个人空间部署](docs/CONFIGURATION.md)
- [Binance OAuth / MCP 审核](docs/MCP.md)
- [验收记录](docs/VALIDATION.md)
- [UI 样式、排版与交互验收](docs/UI.md)
- [参赛演示脚本](docs/DEMO.md)
- [开源设计参考](THIRD_PARTY_NOTICES.md)

源码采用 Apache-2.0。研究观点不构成投资建议；历史模拟不代表未来收益。
