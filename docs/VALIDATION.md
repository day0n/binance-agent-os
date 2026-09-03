# Validation record

Snapshot: 2026-09-03. This is a partially integrated release, not acceptance of all three financial workflows.

## Verified

| Layer                       | Evidence                                                                                                  | Result                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Static checks               | pnpm lint; pnpm typecheck                                                                                 | Pass                                                                             |
| Unit tests                  | Vitest: finance 13, security 10, agent contracts 6, Gemini 7, UI/contrast 16                              | 52 passed                                                                        |
| Production build            | pnpm build; Vercel Node 24 build                                                                          | Pass; 14 durable steps, 1 workflow                                               |
| Real Gemini single turn     | Vertex AI service account; gemini-3.8-flash; HIGH                                                         | Pass; actual provider usage returned                                             |
| Real Gemini tool round trip | Two model turns, two read-only calls, native signed content replay                                        | Pass; tool call IDs paired independently                                         |
| Optional providers          | Earlier minimal OpenAI and Anthropic calls from local opt-in credentials                                  | Pass locally; neither configured in current production                           |
| Deployment boundary         | Incorrect team project deleted before personal-space redeployment; old project inspect returned not found | Pass; other projects untouched                                                   |
| Public site                 | https://binance-agent-os-alpha.vercel.app                                                                 | HTTP reachable; production deployment READY                                      |
| Bootstrap                   | /api/bootstrap                                                                                            | HTTP 200; Gemini configured, HIGH; Binance not connected; no mapped capabilities |
| OAuth client metadata       | /.well-known/oauth-client.json                                                                            | HTTP 200; HTTPS callback uses the public production origin                       |
| MongoDB                     | Production /api/health/ready performs actual PING                                                         | Pass                                                                             |
| Browser shell               | Production market, portfolio, backtest navigation; settings; model configuration                          | Pass for unauthenticated shell, not financial execution                          |
| Responsive UI               | Browser 390 x 844 viewport; navigation open/close; no horizontal overflow                                 | Pass for tested empty workspace                                                  |

The model smoke tool uses deterministic non-financial fixture inputs to check the protocol. It does not claim to verify Binance market data. Thought contents, credentials, OAuth values, and account balances are not included in this record.

## Blocking real-interface failures

- Redis from the selected reference environment fails locally with node-redis and redis-cli; the remote closes the connection. A TLS probe also failed. Production readiness independently returns HTTP 503 with database=true, redis=false. The source instance requires owner investigation or a replacement connection configuration. No in-memory production fallback was added.
- pnpm test:integration failed before its first assertion because Redis could not connect. Its source exists, but none of its database/HTTP/workflow scenarios is counted as passed. No fixture cleanup across unrelated users or reference-project collections is permitted.
- Binance OAuth requires the account holder. The connect endpoint also requires Redis rate limiting; therefore authorization cannot currently proceed. No tokens or account data have been supplied, no real tools/list has been accepted, and BINANCE_TOOL_BINDINGS_JSON remains empty by design.
- Market research, spot-account review, and strategy backtest have NOT completed against authorized real Binance data. Production availability of a UI and model configuration is not financial-workflow acceptance.

## Not yet verified

- Live OAuth success/cancel/expiry and insufficient Binance permission responses.
- Actual MCP tool schemas, read-only binding hashes, market pagination, tool rate limiting, and missing-market responses.
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

1. Repeat readiness and the localhost integration suite with the approved working Redis instance.
2. Have the user complete official Binance OAuth; review discovered schemas and configure only verified read operations.
3. Run all three workflows, compare report metrics to immutable source and calculation snapshots, and record redacted run IDs and timestamps.
4. Exercise the unverified failure, isolation, recovery and browser scenarios above before describing the project as fully accepted.

## Binance-style UI revision

The feature/binance-ui revision replaces the sidebar shell with the reference-aligned top navigation, overview cards, tabs, custom selectors, history tables and native dialogs. Local browser verification covered dropdown keyboard selection, ETH example consistency, 320/390/768px layouts, light/dark mode, risk switch, history filtering and FAQ disclosure. Tab/Shift+Tab focus wrap, Escape dismissal and trigger focus restoration were tested after correcting a native-dialog focus-boundary issue. See [UI design record](UI.md) for exact type tokens, reference scope and contrast ratios.

The 16 new tests cover UI markup/semantics, deferred chart import and nine explicit color-contrast pairs. They are not a replacement for real financial workflow acceptance or a full automated browser suite. Backend configuration and the Redis/OAuth blockers above are unchanged by this UI revision.
