# Project boundaries

- Use `feature/` or `fix/` branch names, never `codex/`.
- This application only researches and simulates. Never add order placement, transfer, borrowing, or withdrawal tools without a separately approved scope change.
- No production fake-data fallback. Test fixtures belong in tests only.
- Keep credentials out of source, prompts, workflow journals, logs, browser storage, and screenshots.
- Mongo databases must begin with `binance_agent_os`; Redis keys must begin with `binance-agent:`. Never modify the reference project's data.
- Domain and finance code must not import Next.js, database clients, or model SDKs.
- Every externally sourced financial conclusion needs an evidence ID and an as-of time.
- Run lint, typecheck, tests and build before publishing. Record real-interface gaps honestly in docs/VALIDATION.md.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
