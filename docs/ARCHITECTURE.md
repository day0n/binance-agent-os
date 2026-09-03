# Architecture

## 分层

- domain：共享 Schema、行情标准化、指标、回测、确定性风控。无 HTTP/数据库依赖。
- application：Blueprint/Builder、角色工具白名单、按需 Skill、紧凑研究上下文与证据校验。
- adapters：Binance MCP/OAuth、Gemini/OpenAI/Anthropic、MongoDB、Redis、Cookie 会话。
- workflows：持久编排，每个模型请求、MCP 请求和本地工具调用都有独立步骤。
- app / components：Next.js Route Handlers、工作台、事件、证据与报告图表。

## 有限专业协作

Supervisor → 获取并标准化真实数据 → 按模式选择 Market / Portfolio / Strategy →
研究与回测执行 Bull / Bear 一至两轮 → 确定性风险检查 + Risk Reviewer → Report Composer。

结构化模式决定合法任务图，模型不能增加交易节点、修改用户交易对或突破执行预算。
各节点有独立 Blueprint、工具权限、Skill 范围和迭代上限；共享 Finding 协议让下游能消费统一产物。
缺少新闻、链上、订单簿或衍生品证据时必须说明未覆盖，不用模型常识冒充刚查询的数据。

## ReAct 和恢复

模型输入消息、模型返回、工具结果、节点 Finding 和数据 Context 存为独立 MongoDB 产物。
Workflow journal 只传 runId、artifactId 和有限调度信息，不传连接凭据。
重试先检查稳定产物 ID；成功步骤不应重新访问外部服务。
只并行执行互不依赖的只读工具。

请求由 ownerId + clientRequestId 唯一约束，参数哈希不一致返回 409。
Redis 限流通过后才创建记录；MongoDB 原子 dispatch claim 防止 HTTP 重试重复调度。
外部 start 返回不确定时不盲目再次启动，失败会落入明确的运行状态。

不承诺外部请求 exactly-once：若服务已接受请求但进程在落库前退出，有限步骤重试可能再次收费。
取消先改变持久运行状态，后续步骤和报告提交检查状态；已发出的模型/MCP 网络请求可能继续直到超时。

## 事件与隔离

事件原子追加到 run 文档，稳定数组位置作为 SSE 游标，业务事件 key 去重。
SSE 断开后从 MongoDB 补齐，不依赖 Redis 通知的可靠投递。
只记录语义进度与耗时，不向用户展示私有思考链。
单 run 有模型/工具/时间/token 预算和消息大小限制；事件不逐 token 追加，避免无限文档增长。

所有公共查询验证 Cookie owner，不能用知道 runId 的方式访问另一个用户。
OAuth state 一次性、十分钟有效、绑定 owner；PKCE 与连接令牌使用 AES-256-GCM 加密。
Cookie 使用 HMAC 签名、HttpOnly、SameSite=Lax，生产 Secure；写接口验证 Origin。

## Gemini

采用本地参考项目的 Vertex AI 服务账号鉴权思路，以官方 Google Gen AI SDK 独立实现。
显式使用 global 端点、gemini-3.8-flash 和 HIGH，不发送已弃用的采样/数字思考预算字段。
思考 token 纳入使用量。Gemini 原生 Parts 与签名加密保存，工具结果按具体 call ID 配对；
两个同名并行调用不会相互覆盖。恢复时回放原生 Parts，不合成或伪造签名。

## 金融计算边界

已收盘 K 线按时间排序并拒绝重复/非法 OHLC；时间范围不符明确失败，过期或缺口进入风险检查。
SMA、RSI、收益、波动、回撤等由代码计算，模型只解释结果。
回测在前一根收盘后生成信号，下一根开盘成交；买卖均计费和滑点，最后持仓按市值估值。
USDT 作为计价单位；其他资产没有报价时保留 unknown，已定价小计不是完整净资产。
未知资产、数据缺口和硬风险限制不能被模型解除。未配置政策不输出调仓数量。

## 记忆与完成状态

工作上下文、会话消息、已完成分析摘要和分析档案分开保存。
复用摘要必须同 owner、同资产、父 run 已完成，且当时已经可知。
现货账户摘要不自动进入通用市场记忆；复盘不自动改策略或政策。
最终报告、消息和摘要幂等落库；只有最终状态 CAS 成功才对外发布完成报告。

## 参考与限制

采用 Lumen 的分层、Blueprint、工具目录及 Provider 思路，不复用其私有源码。
采用 TradingAgents 的职责分工、多空复核；AI Hedge Fund 的硬风控分离；
FinRobot 的角色工具组织。出处与许可证见根目录 THIRD_PARTY_NOTICES.md。
完整真实金融验收依赖授权后的官方能力，当前支持范围以 docs/VALIDATION.md 为准。
