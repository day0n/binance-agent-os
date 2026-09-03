# Validation record

Snapshot: 2026-09-04. This is a real MCP integration checkpoint, not acceptance of all three production web workflows.

## Verified

| Layer                       | Evidence                                                                                                  | Result                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Static checks               | pnpm lint; pnpm typecheck                                                                                 | Pass                                                                                     |
| Unit tests                  | Vitest                                                                                                    | 53 passed                                                                                |
| Production build            | pnpm build; Vercel Node 24 build                                                                          | Pass; 14 durable steps, 1 workflow                                                       |
| Real Gemini single turn     | Vertex AI service account; gemini-3.8-flash; HIGH                                                         | Pass; actual provider usage returned                                                     |
| Real Gemini tool round trip | Two model turns, two read-only calls, native signed content replay                                        | Pass; tool call IDs paired independently                                                 |
| Optional providers          | Earlier minimal OpenAI and Anthropic calls from local opt-in credentials                                  | Pass locally; neither configured in current production                                   |
| Deployment boundary         | Incorrect team project deleted before personal-space redeployment; old project inspect returned not found | Pass; other projects untouched                                                           |
| Public site                 | https://binance-agent-os-alpha.vercel.app                                                                 | HTTP reachable; production deployment READY                                              |
| Bootstrap                   | /api/bootstrap                                                                                            | HTTP 200; Gemini configured, HIGH; Binance web OAuth unsupported; no mapped capabilities |
| OAuth client metadata       | /.well-known/oauth-client.json                                                                            | HTTP 200; HTTPS callback uses the public production origin                               |
| MongoDB / Redis             | Production /api/health/ready performs actual PING                                                         | Pass for both; Redis is an isolated personal-scope Upstash resource                      |
| Binance Codex OAuth         | Official `codex` client ID and Agentic MCP endpoint                                                       | Pass; user completed authorization; token was not inspected or exported                  |
| MCP discovery               | Real `tool_search`                                                                                        | Pass; 50 tools reported; exact schemas found for ticker, klines and spot account         |
| MCP public ticker           | `spot.ticker24hr`, BTCUSDT, FULL                                                                          | Pass; 81,176.55 USDT and +4.867% at the observed response                                |
| MCP K lines                 | `spot.klines`, BTCUSDT, 1d, limit 60                                                                      | Pass; 60 rows returned, 59 closed rows accepted by the domain parser                     |
| Real-data calculation       | Existing market parser and buy-hold backtest over those 59 closed rows                                    | Pass; final equity 12,058.18 from 10,000, 20.582% return, 5.608% max drawdown            |
| Browser shell               | Production market, portfolio, backtest navigation; settings; model configuration                          | Pass for unauthenticated shell, not financial execution                                  |
| Responsive UI               | Browser 390 x 844 viewport; navigation open/close; no horizontal overflow                                 | Pass for tested empty workspace                                                          |

The model smoke tool uses deterministic non-financial fixture inputs to check the protocol. The separate MCP rows above are real Binance public-market calls. The backtest used 10 bps fees, 5 bps slippage and next-open execution. Thought contents, credentials, OAuth values, and account balances are not included in this record.

## Blocking production-web limitation

- Binance currently rejects an arbitrary self-built website as an Agentic OAuth client with error 3346001. The supported Codex connection works, but its OAuth token must not be exported into the Vercel website.
- The website therefore disables financial run submission and returns a clear error from its legacy connect endpoint. It does not spoof a supported client or substitute mock data.
- A real MCP market read and deterministic local backtest have passed. Market research with Gemini, spot-account review, and all three durable production web workflows have **not** completed end to end.

## Not yet verified

- A Binance-supported registration or documented OAuth route for this self-built Web Agent.
- Web-client OAuth cancel/expiry and insufficient-permission responses after that support exists.
- Read-only binding hashes, market pagination, tool rate limiting, and missing-market responses in the production workflow.
- End-to-end run completion, page refresh during a live run, SSE reconnection, workflow recovery/retry, duplicate request behavior, cancellation and cross-user access against persisted runs.
- Production Vertex AI requests from a durable workflow. The successful real model smoke was local using the same approved account/model; bootstrap only verifies configuration presence.
- An automated browser end-to-end suite; manual browser checks do not substitute for it.
- Preview environment credentials and OAuth. Only production is configured.

## Implementation limitations

- Roles have separate blueprints, read-only tool sets and budgets, but share a validated finding contract rather than fully distinct per-role result schemas.
- Explicit risk settings currently apply to the next request; a persistent user-preference UI and full chat-message history API are not implemented.
- Run history persists in MongoDB. Reloading the page requires selecting a previous run; the active run is not automatically restored from a URL.
- Provider token counters limit scheduling, but cannot guarantee an already-sent request consumes no extra tokens or that a retried external request is billed exactly once.

## Acceptance after the blockers are resolved

1. Obtain an officially supported OAuth route for this Web Agent, without impersonating another client.
2. Bind only reviewed read operations and rerun the production readiness/integration suite.
3. Run all three workflows, compare report metrics to immutable source and calculation snapshots, and record redacted run IDs and timestamps.
4. Exercise the unverified failure, isolation, recovery and browser scenarios above before describing the project as fully accepted.

## Binance-style UI revision

The feature/binance-ui revision replaces the sidebar shell with the reference-aligned top navigation, overview cards, tabs, custom selectors, history tables and native dialogs. Local browser verification covered dropdown keyboard selection, ETH example consistency, 320/390/768px layouts, light/dark mode, risk switch, history filtering and FAQ disclosure. Tab/Shift+Tab focus wrap, Escape dismissal and trigger focus restoration were tested after correcting a native-dialog focus-boundary issue. See [UI design record](UI.md) for exact type tokens, reference scope and contrast ratios.

The UI tests cover markup/semantics, deferred chart import and explicit color-contrast pairs. They are not a replacement for real financial workflow acceptance or a full automated browser suite.
