# Design references and licensing

This repository is an independent TypeScript implementation, licensed under Apache-2.0.
No private Lumen/OpenCreator business source, credentials, media, or account data is included.

Architectural references:

- [TradingAgents](https://github.com/TauricResearch/TradingAgents/tree/9dee508c44662702281a8dbaad1f7b42179b5ba7), Apache-2.0:
  role separation, bounded debate, risk review, point-in-time context.
- [AI Hedge Fund](https://github.com/virattt/ai-hedge-fund/tree/eff8a7320fcf0b473b135690fa1a5b0d9b022a83), MIT:
  separation of signals, deterministic risk limits, execution boundaries and run records.
- [FinRobot](https://github.com/AI4Finance-Foundation/FinRobot/tree/d221910096de87579b02f8f0674652bf1a175f51), Apache-2.0:
  role-scoped data tools, financial calculations and report composition.
- User-provided private reference architecture: Blueprint/Builder, ToolCatalog, ProviderRouter,
  session boundaries, and Vertex AI service-account integration concepts only.

The referenced Python implementations are not vendored or required at runtime.
Dependency versions are recorded in pnpm-lock.yaml; each npm package retains its own license.
If future changes copy third-party source, retain its copyright/license notice and describe modifications.

Official protocol references:

- [Workflow steps and durability](https://workflow-sdk.dev/docs/foundations/workflows-and-steps)
- [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [Gemini 3.8 Flash / HIGH](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-3-8-flash)
- [Gemini thought signatures](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/thought-signatures)
