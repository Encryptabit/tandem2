---
id: S04
parent: M004
milestone: M004
provides:
  - Cross-surface acceptance test suite proving overview/events/reviews coherence through reload, reconnect, and startup recovery
  - Flaky integration test fix via sequential describe blocks
  - Full verification matrix across 67 tests in 5 suites with zero failures
  - Browser-verified assembled dashboard rendering real data from one SQLite-backed broker
requires:
  - slice: S01
    provides: Zod-validated dashboard transport contracts and 27 contract tests
  - slice: S02
    provides: HTTP route handlers for overview, event feed, and review API surfaces with 20 route tests
  - slice: S03
    provides: Browser client modules, Astro pages, SSE bridge, and 12 integration tests
affects: []
key_files:
  - packages/review-broker-server/test/dashboard-acceptance.integration.test.ts
  - packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts
  - .gsd/milestones/M004/slices/S04/S04-SUMMARY.md
key_decisions:
  - Added { sequential: true } to integration test describe blocks to eliminate concurrent HTTP server + SQLite lifecycle races
patterns_established:
  - assertNoMetadataLeaks helper for belt-and-suspenders redaction verification across all API surfaces
  - Acceptance test tracks servers in afterEach safety-net array for cleanup on test failure paths
  - Cross-surface coherence pattern: seed data through broker service, then parallel-fetch all snapshot routes to prove consistency
observability_surfaces:
  - Acceptance tests validate Zod schema conformance on all 5 dashboard schemas — schema drift surfaces as structured parse errors
  - Error-response test proves 404 with JSON error body for unknown reviews and unknown static paths
  - All existing broker runtime signals preserved (broker.started, broker.dashboard_ready, SSE heartbeat/change events)
drill_down_paths:
  - .gsd/milestones/M004/slices/S04/tasks/T01-SUMMARY.md
  - .gsd/milestones/M004/slices/S04/tasks/T02-SUMMARY.md
duration: 45m
verification_result: passed
completed_at: 2026-03-25T22:36:00Z
---

# S04: Integrated operator shell and real-runtime acceptance

**Proved the assembled broker-served dashboard stays coherent across all three surfaces through reload, reconnect, and startup-recovery scenarios, verified by 67 passing tests across 5 suites and live browser confirmation against a real SQLite-backed broker.**

## What Happened

This slice was the final-assembly proof for M004. Prior slices delivered contracts (S01), route handlers (S02), and browser client/pages (S03) — all tested in isolation. S04's job was proving everything works together.

T01 created `dashboard-acceptance.integration.test.ts` with 6 test cases exercising cross-surface coherence: all three pages serve HTML, API surfaces agree after mutations, SSE delivers change notifications that trigger re-sync, parallel re-fetch after mutations proves reload consistency, startup recovery is visible through overview and audit events, and error responses return proper 404 status codes with JSON bodies. T01 also fixed a flaky integration test caused by Vitest's default concurrent `describe` blocks racing over shared HTTP server and SQLite lifecycle management — resolved by adding `{ sequential: true }`.

T02 ran all 5 suites together (67 tests), confirmed zero regressions, then browser-verified the assembled dashboard against a live broker serving real data. Overview rendered 2 reviews and 1 reviewer with CONNECTED badge, Events showed 3 audit events with filter controls and LIVE indicator, Reviews listed both reviews with status badges and clicking through showed the full detail view with proposal/diff/activity. Cross-page navigation cycled correctly through all surfaces.

## Verification

Full test matrix — all suites green:

| Suite | File | Tests | Result |
|-------|------|-------|--------|
| Contract | `review-broker-core/test/dashboard-contracts.test.ts` | 27 | ✅ pass |
| Routes | `review-broker-server/test/http-dashboard-routes.test.ts` + `http-event-feed-routes.test.ts` + `http-review-routes.test.ts` | 20 | ✅ pass |
| Integration | `review-broker-server/test/broker-mounted-dashboard.integration.test.ts` | 12 | ✅ pass |
| Acceptance | `review-broker-server/test/dashboard-acceptance.integration.test.ts` | 6 | ✅ pass |
| Smoke | `review-broker-server/test/start-broker.smoke.test.ts` | 2 | ✅ pass |
| **Total** | | **67** | **✅ all pass** |

Browser verification against live `broker:dashboard`:
- Overview page: 2 total reviews (1 pending, 1 claimed), 1 reviewer (offline), CONNECTED badge, snapshot v0, startup recovery section, latest activity section — all rendering real data
- Events page: 3 audit events with All/Review/Reviewer filter buttons and LIVE indicator
- Reviews page: 2 reviews listed with status badges and filter buttons; detail view shows proposal with diff, discussion, and activity timeline
- Cross-page navigation: Overview → Events → Reviews → Review Detail → Overview — all transitions work

## Requirements Advanced

- R014 — Dashboard now provides review browsing with list/detail views, status filtering, proposal/discussion/activity inspection — advancing beyond basic overview

## Requirements Validated

- R011 — Operator-facing Astro dashboard restored as thin client over broker state: 3 pages, 5 API routes, SSE live updates, all proven by 67 tests and live browser verification
- R002 — Shared Zod contracts validated end-to-end: contract tests prove schema shapes, acceptance tests prove runtime API responses parse against the same schemas
- R005 — Reviewer lifecycle visible through overview (idle/assigned/offline counts, latest reviewer detail) and event feed (reviewer state change events)
- R010 — Audit events, reviewer state, and failure signals inspectable through dedicated pages: event feed with type filters, startup recovery section with counts
- R003 — SQLite persistence proven through restart scenarios: acceptance test seeds data, restarts broker, and verifies recovery counts propagate to dashboard

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Deviations

- Events page uses `events-list` DOM element ID rather than `events-root` assumed by the plan — matched actual implementation
- Browser verification seeded data via direct SQLite inserts initially, which surfaced a Zod validation gap (`in_review` and `open` are not valid status enum values — corrected to `claimed` and `pending`)

## Known Limitations

- Dashboard is read-only — no mutation controls (review close, reviewer spawn/kill) from the browser
- SSE reconnect timeout and backoff are client-side only — no server-side connection management beyond heartbeat
- The dashboard server doesn't log errors to stdout when request handlers throw — the generic catch returns 500 with no diagnostic information in the server process output
- No authentication or authorization on dashboard routes — suitable for local operator use only

## Follow-ups

- Add error logging to the dashboard server's request handler catch block so 500 errors are visible in broker stdout
- Consider adding write operations (close review, spawn/kill reviewer) as future dashboard controls per R014
- The `broker:dashboard` command's `--db-path` resolves relative to the package directory, not the repo root — document or fix this for operator convenience

## Files Created/Modified

- `packages/review-broker-server/test/dashboard-acceptance.integration.test.ts` — 6 cross-surface acceptance tests
- `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` — flaky test fix via sequential describe blocks
- `.gsd/milestones/M004/slices/S04/S04-PLAN.md` — added failure-path verification step
- `.gsd/milestones/M004/slices/S04/S04-SUMMARY.md` — this summary

## Forward Intelligence

### What the next slice should know
- M004 is complete. The dashboard is a coherent read-only operator surface with 67 tests across 5 suites. Future work should extend from here, not rebuild.
- The acceptance test pattern (real `startBroker()` + `createDashboardRoutes()` + `createDashboardServer()`) is the authoritative way to test cross-surface dashboard behavior.

### What's fragile
- The dashboard server's error handling swallows exceptions silently (returns 500 with no server-side logging) — any new route handler bugs will be hard to diagnose without adding error logging.
- Vitest concurrent `describe` blocks cause races with the integration test's HTTP server + SQLite lifecycle — always use `{ sequential: true }` for these test files.

### Authoritative diagnostics
- `corepack pnpm --filter review-broker-server exec vitest run` — runs all server-side tests including acceptance, integration, and smoke. Individual suite failures isolate to a specific layer.
- `corepack pnpm --filter review-broker-core exec vitest run test/dashboard-contracts.test.ts` — 27 contract tests catch schema drift early.
- `corepack pnpm broker:dashboard` — starts a live broker with dashboard for manual browser verification. Seeded data can be added via the broker service API or direct SQLite inserts (use valid enum values: pending/claimed/submitted/changes_requested/approved/closed).

### What assumptions changed
- Status enum does not include `open` or `in_review` — the canonical statuses are `pending`, `claimed`, `submitted`, `changes_requested`, `approved`, `closed`. This matters when seeding test data directly.
