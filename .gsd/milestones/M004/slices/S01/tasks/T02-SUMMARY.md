---
id: T02
parent: S01
milestone: M004
provides:
  - Live dashboard UI rendering overview cards, reviewer state, startup-recovery context, and latest activity from broker snapshots
  - Client-side fetch + SSE-triggered re-fetch with explicit loading/error/reconnect state
  - Integration test suite proving mounted dashboard stays aligned with broker truth through mutations
key_files:
  - packages/review-broker-dashboard/src/pages/index.astro
  - packages/review-broker-dashboard/src/components/overview-client.ts
  - packages/review-broker-dashboard/src/styles/dashboard.css
  - packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts
key_decisions:
  - Client-side types inlined as minimal subset rather than importing review-broker-core at Astro build time to avoid cross-package build dependency
  - Single overview-client.ts handles all rendering instead of separate Astro components — the content is fully client-rendered after initial fetch since all data depends on runtime state
  - Stale data preserved on refresh failure with connection state badge update rather than clearing the screen
patterns_established:
  - SSE-triggered re-fetch pattern: EventSource listens for change events, each triggers a full snapshot fetch, badge reflects connection health
  - Integration tests use real Astro dist output (not stub paths) to prove the mounted page and API coexist on one server
observability_surfaces:
  - Connection status badge (loading → connected → reconnecting → error) visible in browser header
  - Last refresh timestamp in header meta shows when the dashboard last successfully fetched
  - Snapshot version counter in overview cards tracks mutation cycles
  - GET /api/overview returns schema-validated OverviewSnapshot
  - GET /api/events delivers SSE change signals with topic + version only
duration: ~30m
verification_result: passed
completed_at: 2026-03-25
blocker_discovered: false
---

# T02: Render the live overview, reviewer, and startup-recovery panels as a thin dashboard client

**Built the real dashboard UI with overview cards, reviewer/recovery panels, SSE-driven refresh, and 6 integration tests proving mounted rendering stays aligned with broker truth**

## What Happened

Replaced the T01 shell page with a fully rendered operator dashboard that fetches and displays live broker state:

1. **Dashboard styling** (`dashboard.css`): Dark theme operator UI with cards grid, detail panels, status indicators, recovery summary grid, and explicit loading/error/reconnect states. Uses CSS custom properties and tabular-nums for data-dense layouts.

2. **Client-side logic** (`overview-client.ts`): Fetches `/api/overview` for authoritative snapshot data, renders four panels (overview cards, reviewer state, startup recovery, latest activity), and wires SSE via EventSource. Change events trigger a full re-fetch — SSE is never treated as durable state. Connection health is surfaced through a status badge (connected/reconnecting/error) and last-refresh timestamp. On refresh failure, stale data is preserved rather than blanked.

3. **Astro page** (`index.astro`): Imports the CSS and client script through Astro's standard build pipeline. Astro bundles and hashes both assets into `dist/_assets/` for cache-busting.

4. **Integration tests** (6 tests): Exercise the full stack — real broker with SQLite, real Astro build output served by the dashboard HTTP server, overview API validation, SSE notification after mutations, startup recovery projection, 404 for unknown paths, and snapshot version increment tracking.

## Verification

- `vitest run packages/review-broker-core/test/dashboard-contracts.test.ts packages/review-broker-server/test/http-dashboard-routes.test.ts` — 22 tests pass (14 contract + 8 route)
- `vitest run packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` — 6 tests pass
- `pnpm --filter review-broker-dashboard build && pnpm --filter review-broker-core build && pnpm --filter review-broker-server build` — all three compile cleanly
- Browser verification against live broker-served dashboard at `http://127.0.0.1:<port>` — 8/8 explicit assertions pass: overview cards show 1 total review (pending), connection badge shows "CONNECTED", startup recovery panel renders, latest activity shows `review.created` audit event

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `vitest run packages/review-broker-core/test/dashboard-contracts.test.ts packages/review-broker-server/test/http-dashboard-routes.test.ts` | 0 | ✅ pass | 1.6s |
| 2 | `vitest run packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` | 0 | ✅ pass | 1.8s |
| 3 | `pnpm --filter review-broker-dashboard build && pnpm --filter review-broker-core build && pnpm --filter review-broker-server build` | 0 | ✅ pass | 3.5s |
| 4 | Browser assertions (8 checks: text visibility, connection state selector) | 0 | ✅ pass | — |

## Diagnostics

- **Dashboard rendering**: Start a broker with dashboard server, open the root URL. Cards show review counts, reviewer status breakdown, startup recovery stats, and latest activity with review IDs and audit events.
- **Connection state**: The status badge in the header transitions through loading → connected → reconnecting → error. Last refresh timestamp updates on each successful fetch.
- **SSE-triggered refresh**: After any broker mutation (create review, spawn reviewer, etc.), the SSE stream delivers a change event that triggers an automatic re-fetch. The snapshot version counter in the overview cards increments visibly.
- **Integration tests**: `broker-mounted-dashboard.integration.test.ts` exercises the full loop with real SQLite, real Astro build output, and schema-validated API responses.

## Deviations

- The task plan listed `OverviewCards.astro` and `ReviewerSummary.astro` as separate component files. Since all dashboard content is client-rendered (it depends on runtime-fetched data, not build-time props), the rendering logic lives entirely in `overview-client.ts` instead of server-rendered Astro components. The Astro page serves only the shell HTML + script/style imports.
- No changes were needed to `dashboard-routes.ts` or `packages/review-broker-server/src/index.ts` — the T01 projection was already sufficient for the full dashboard UI.

## Known Issues

- The `favicon.ico` request returns 404 from the dashboard server since no favicon is included in the Astro build. Cosmetic only — does not affect functionality.
- Client-side types are inlined rather than imported from `review-broker-core`. If the schema changes, both the Zod schemas and the client types need updating. T03 or a later task could add a shared type generation step.

## Files Created/Modified

- `packages/review-broker-dashboard/src/pages/index.astro` — rewrote shell page to import CSS and client script through Astro's build pipeline
- `packages/review-broker-dashboard/src/components/overview-client.ts` — client-side fetch + SSE re-fetch + rendering for all dashboard panels
- `packages/review-broker-dashboard/src/styles/dashboard.css` — operator-facing dark theme with cards, panels, status indicators, and responsive grid
- `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` — 6 integration tests exercising real broker + mounted dashboard + API alignment
