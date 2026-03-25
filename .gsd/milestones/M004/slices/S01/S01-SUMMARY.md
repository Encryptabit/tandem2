---
id: S01
parent: M004
milestone: M004
provides:
  - Broker-owned HTTP listener and mounted Astro dashboard entrypoint served from the broker process itself
  - Shared dashboard transport contracts (OverviewSnapshot, SSE payloads) in review-broker-core with Zod schemas
  - Broker-owned overview snapshot route (GET /api/overview) projecting inspectBrokerRuntime() into the dashboard contract
  - SSE notification bridge (GET /api/events) forwarding topic/version change signals from VersionedNotificationBus
  - Client-side fetch + SSE-triggered re-fetch with explicit connection state (loading/connected/reconnecting/error)
  - Dark-theme operator dashboard UI with overview cards, reviewer state, startup-recovery context, and latest activity panels
  - CLI --dashboard mode with --dashboard-port/--dashboard-host flags and structured broker.dashboard_ready event
  - Repo-level broker:dashboard and package-level start:dashboard scripts for repeatable proof
  - Integration and smoke test suites proving mounted delivery, API alignment, and SSE notification
requires: []
affects:
  - S02
  - S03
  - S04
key_files:
  - packages/review-broker-dashboard/package.json
  - packages/review-broker-dashboard/astro.config.mjs
  - packages/review-broker-dashboard/src/pages/index.astro
  - packages/review-broker-dashboard/src/components/overview-client.ts
  - packages/review-broker-dashboard/src/styles/dashboard.css
  - packages/review-broker-core/src/dashboard.ts
  - packages/review-broker-server/src/http/dashboard-server.ts
  - packages/review-broker-server/src/http/dashboard-routes.ts
  - packages/review-broker-server/src/cli/start-broker.ts
  - packages/review-broker-server/test/http-dashboard-routes.test.ts
  - packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts
  - packages/review-broker-server/test/start-broker.smoke.test.ts
  - packages/review-broker-server/test/test-paths.ts
key_decisions:
  - SSE carries only topic + version; browser must re-fetch the overview snapshot route for authoritative state
  - Overview snapshot uses commandBasename (not full path/argv) for reviewer redaction safety
  - Dashboard content is fully client-rendered via overview-client.ts rather than server-rendered Astro components, since all data depends on runtime-fetched state
  - Client-side types inlined as minimal subset rather than importing review-broker-core at Astro build time, avoiding cross-package build dependency
  - Dashboard dist path resolved from runtime workspaceRoot (not process.cwd) since pnpm --filter changes cwd to the package directory
  - Stale data preserved on refresh failure with connection state badge update rather than clearing the screen
  - Dashboard mode emits structured broker.dashboard_ready event with url/port/distPath for machine-readable startup detection
patterns_established:
  - DashboardRouteHandler interface decouples route logic from HTTP server for unit testing without HTTP
  - Overview projection helpers map internal BrokerRuntimeSnapshot to the redaction-safe dashboard transport contract
  - SSE connections tracked in a Set and cleaned up on server close
  - SSE-triggered re-fetch pattern — EventSource listens for change events, each triggers a full snapshot re-fetch, badge reflects connection health
  - Shared test-paths.ts exports (CLI_PATH, TSX_PATH, DASHBOARD_DIST_PATH) eliminate ad-hoc path construction across test suites
  - CLI flag composition — --dashboard enables HTTP mode, combines with existing --db-path/--once for flexible proof paths
observability_surfaces:
  - GET /api/overview — full OverviewSnapshot JSON with review/reviewer counts, startup recovery, latest activity, and snapshot version
  - GET /api/events — SSE stream with heartbeat on connect and change events on broker mutations (topic + version only)
  - Connection status badge in dashboard header (loading → connected → reconnecting → error)
  - Last refresh timestamp in dashboard header meta
  - Snapshot version counter visible in overview cards
  - broker.dashboard_ready structured event on stdout with url, port, and dashboardDistPath
drill_down_paths:
  - .gsd/milestones/M004/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M004/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M004/slices/S01/tasks/T03-SUMMARY.md
duration: ~1h40m
verification_result: passed
completed_at: 2026-03-25
---

# S01: Broker-mounted dashboard and live overview

**Shipped a broker-owned HTTP surface that mounts an Astro dashboard, serves live overview state from the real broker runtime, and refreshes through SSE-triggered snapshot re-fetch — proving the mounted delivery architecture that all later M004 slices build on.**

## What Happened

The slice retired the highest M004 risk first: whether the broker process can own and serve a real browser dashboard while remaining the single source of truth.

**T01** established the delivery architecture. Created a new `review-broker-dashboard` Astro package with a minimal shell page, defined shared `OverviewSnapshot` and SSE payload Zod schemas in `review-broker-core/src/dashboard.ts`, and built the broker-owned HTTP layer in `review-broker-server/src/http/`. The HTTP server (`dashboard-server.ts`) mounts Astro's static build output and delegates `/api/overview` and `/api/events` to a `DashboardRouteHandler` (`dashboard-routes.ts`). The handler projects `inspectBrokerRuntime()` into the dashboard contract with `commandBasename` redaction, and polls the `VersionedNotificationBus` at 250ms to push SSE change signals. 14 contract tests and 8 route tests validate schema parsing, strict rejection, redaction rules, and SSE semantics.

**T02** built the real dashboard UI. Replaced the shell page with a client-rendered operator dashboard (`overview-client.ts`) that fetches `/api/overview` for authoritative snapshot data and renders four panels: overview cards (review counts, snapshot version), reviewer state breakdown, startup recovery summary, and latest activity. SSE via EventSource triggers automatic re-fetch on change events — SSE is never treated as durable state. Connection health surfaces through a status badge (connected/reconnecting/error) and last-refresh timestamp. A dark-theme CSS system (`dashboard.css`) uses custom properties and tabular-nums for data-dense layouts. 6 integration tests exercise the full stack with real SQLite and real Astro build output.

**T03** packaged the proof path. Extended `start-broker.ts` with `--dashboard`, `--dashboard-port`, and `--dashboard-host` flags. The dashboard dist path resolves from `runtime.context.workspaceRoot` to handle `pnpm --filter` cwd changes. Added `broker:dashboard` at repo level (builds dashboard first, then starts broker) and `start:dashboard` at package level. Shared `test-paths.ts` exports eliminated ad-hoc path construction. A dashboard smoke test spawns the broker with `--dashboard --dashboard-port 0`, waits for the `broker.dashboard_ready` event, and verifies the API and mounted page.

## Verification

All slice-level verification passed:

| Suite | Tests | Result |
|---|---|---|
| Contract tests (`dashboard-contracts.test.ts`) | 14 | ✅ pass |
| Route tests (`http-dashboard-routes.test.ts`) | 8 | ✅ pass |
| Integration tests (`broker-mounted-dashboard.integration.test.ts`) | 6 | ✅ pass |
| Smoke tests (`start-broker.smoke.test.ts`) | 2 | ✅ pass |
| Dashboard build (`pnpm --filter review-broker-dashboard build`) | — | ✅ clean |
| Core build (`pnpm --filter review-broker-core build`) | — | ✅ clean |
| Server build (`pnpm --filter review-broker-server build`) | — | ✅ clean |

Browser verification confirmed: overview cards show real review counts, connection badge shows CONNECTED, startup recovery panel renders, latest activity shows audit events, and the dashboard refreshes after broker mutations without page reload.

## Requirements Advanced

- **R011** — Restored the operator dashboard as a thin Astro client over broker state, served from the broker process itself. The dashboard reads broker-owned HTTP JSON routes and uses SSE only for liveness/refresh signaling.
- **R002** — Dashboard transport contracts (OverviewSnapshot, SSE payloads) are shared Zod schemas in `review-broker-core`, reusing canonical domain vocabulary instead of inventing dashboard-only DTOs.
- **R005** — Reviewer state and startup-recovery context are visible through the dashboard overview snapshot, projected from the real broker runtime with redaction-safe commandBasename.

## Requirements Validated

- none — R011 is advanced but not yet fully validated; remaining slices need event/log surface (S02), review browsing (S03), and integrated acceptance (S04).

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- **Client-rendered instead of Astro server components**: The plan listed `OverviewCards.astro` and `ReviewerSummary.astro` as separate server-rendered components. Since all dashboard content depends on runtime-fetched data (not build-time props), the rendering logic lives entirely in `overview-client.ts`. The Astro page serves only the shell HTML plus bundled script/style imports. This is structurally simpler and avoids the false impression that Astro SSR is needed.
- **Client-side type inlining**: Rather than importing `review-broker-core` types at Astro build time (which would require cross-package build coordination), the client inlines a minimal type subset. The Zod schemas in core remain the authoritative contract; the client types are a convenience projection.

## Known Limitations

- **favicon.ico 404**: No favicon is included in the Astro build. Cosmetic only.
- **SSE polling interval**: The SSE notification bridge polls the VersionedNotificationBus at 250ms via setInterval rather than async waiters. Simple and sufficient for the local operator use case, but not optimal for high-frequency mutation scenarios.
- **Client types not auto-generated**: Client-side types are manually kept in sync with the core Zod schemas. A type generation step could be added later.
- **Fixed proof DB path**: The `broker:dashboard` repo script uses `./.tmp/dashboard-proof.sqlite`. Multiple runs accumulate state; delete for a fresh start.

## Follow-ups

- S02 should reuse the SSE notification bridge and add event/log topic subscriptions alongside the existing overview change signal.
- S03 should reuse the mounted dashboard package and add review list/detail routes through the same `DashboardRouteHandler` pattern.
- S04 should exercise reconnect/reload/restart scenarios against the assembled dashboard to validate the snapshot-is-truth model under real failure conditions.

## Files Created/Modified

- `packages/review-broker-dashboard/package.json` — new Astro dashboard package manifest
- `packages/review-broker-dashboard/astro.config.mjs` — Astro static build configuration
- `packages/review-broker-dashboard/tsconfig.json` — TypeScript config extending Astro strict
- `packages/review-broker-dashboard/src/pages/index.astro` — dashboard shell page with script/style imports
- `packages/review-broker-dashboard/src/components/overview-client.ts` — client-side fetch, SSE, rendering for all dashboard panels
- `packages/review-broker-dashboard/src/styles/dashboard.css` — dark-theme operator UI with cards, panels, status indicators
- `packages/review-broker-core/src/dashboard.ts` — shared OverviewSnapshot and SSE payload Zod schemas
- `packages/review-broker-core/src/dashboard.js` — checked-in JS mirror
- `packages/review-broker-core/src/dashboard.js.map` — sourcemap for JS mirror
- `packages/review-broker-core/src/index.ts` — added dashboard.js re-export
- `packages/review-broker-core/src/index.js` — updated JS mirror with dashboard re-export
- `packages/review-broker-core/test/dashboard-contracts.test.ts` — 14 contract tests
- `packages/review-broker-server/src/http/dashboard-server.ts` — broker-owned HTTP server with static asset serving
- `packages/review-broker-server/src/http/dashboard-routes.ts` — overview snapshot projection and SSE notification forwarding
- `packages/review-broker-server/src/cli/start-broker.ts` — added --dashboard/--dashboard-port/--dashboard-host flags
- `packages/review-broker-server/test/http-dashboard-routes.test.ts` — 8 route-level tests
- `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` — 6 integration tests
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — dashboard mode smoke test
- `packages/review-broker-server/test/test-paths.ts` — shared CLI_PATH, TSX_PATH, DASHBOARD_DIST_PATH, FIXTURES_DIR
- `packages/review-broker-server/package.json` — added start:dashboard script
- `package.json` — added broker:dashboard script

## Forward Intelligence

### What the next slice should know
- The mounted dashboard shell, overview route, and SSE bridge are ready. S02 can add new route handlers to the existing `DashboardRouteHandler` pattern and new SSE topics to the notification bridge without restructuring the HTTP layer.
- The dashboard is fully client-rendered. Adding new panels means adding rendering functions in `overview-client.ts` (or a new client module) and calling them after fetch — there are no Astro server components to coordinate.
- `pnpm broker:dashboard` is the one-command proof path. It builds the dashboard first, then starts the broker with `--dashboard`. Use `--dashboard-port 0` for ephemeral ports in tests.

### What's fragile
- **Client type sync**: If the `OverviewSnapshot` Zod schema in `review-broker-core/src/dashboard.ts` changes shape, the client-side types in `overview-client.ts` must be updated manually. There's no build-time check.
- **SSE polling interval**: The 250ms poll is a tradeoff. If the notification bus gets high-frequency updates, the SSE bridge could flood clients. For operator use this is fine.

### Authoritative diagnostics
- `GET /api/overview` against a running broker returns the canonical OverviewSnapshot — compare against `OverviewSnapshotSchema` in `packages/review-broker-core/src/dashboard.ts` for schema drift.
- The integration test suite (`broker-mounted-dashboard.integration.test.ts`) is the most trustworthy end-to-end signal — it uses real SQLite, real Astro build output, and validates API alignment after mutations.
- The smoke test in `start-broker.smoke.test.ts` exercises the CLI entrypoint end-to-end including the `broker.dashboard_ready` event parsing.

### What assumptions changed
- **Astro server components would render dashboard panels** — they don't. All dashboard content is client-rendered because it depends on runtime-fetched data. The Astro layer is a static build that produces the shell HTML plus bundled assets.
- **Cross-package type imports at Astro build time** — avoided. The client inlines a minimal type subset instead, keeping the Astro build independent of the core package's TypeScript compilation.
