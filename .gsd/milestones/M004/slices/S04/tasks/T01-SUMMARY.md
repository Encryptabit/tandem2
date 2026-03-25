---
id: T01
parent: S04
milestone: M004
provides:
  - Cross-surface acceptance test suite exercising all dashboard surfaces against one real broker
  - Flaky integration test fix via sequential describe blocks
key_files:
  - packages/review-broker-server/test/dashboard-acceptance.integration.test.ts
  - packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts
key_decisions:
  - Added { sequential: true } to all describe blocks in broker-mounted-dashboard.integration.test.ts to eliminate race conditions from concurrent HTTP server + SQLite lifecycle management
patterns_established:
  - assertNoMetadataLeaks helper for belt-and-suspenders redaction verification across all API surfaces
  - Acceptance test tracks servers in afterEach safety-net array for cleanup on test failure paths
observability_surfaces:
  - Acceptance tests validate Zod schema conformance on all 5 dashboard schemas — schema drift surfaces as structured parse errors
  - Error-response test proves 404 with JSON error body for unknown reviews and unknown static paths
duration: 15m
verification_result: passed
completed_at: 2026-03-25T20:40:00Z
blocker_discovered: false
---

# T01: Cross-surface acceptance test suite with reload and reconnect

**Added 6 cross-surface acceptance tests proving overview/events/reviews coherence through mutations, SSE re-sync, reload, and startup recovery against a real SQLite-backed broker; fixed flaky integration test via sequential execution**

## What Happened

Created `dashboard-acceptance.integration.test.ts` with 6 test cases covering the full cross-surface coherence contract:

1. **All three pages serve** — verifies `/` (overview-root), `/events/` (events-list), `/reviews/` (reviews-root) all return 200 from one broker server
2. **Cross-surface coherence after mutations** — creates a review + discussion message, then verifies all four API surfaces (overview, event feed, review list, review detail) agree on state, with schema validation and belt-and-suspenders redaction checks
3. **SSE notification triggers re-sync** — connects SSE stream, mutates broker, waits for change event with correct payload shape (type/topic/version only), then re-fetches overview to confirm sync
4. **Reload coherence** — creates 2 reviews, then parallel-fetches all snapshot routes to prove they return consistent data (simulating browser reload)
5. **Startup recovery visible** — seeds stale reviewer state, restarts broker, verifies overview shows recovery counts and event feed includes `review.reclaimed`/`reviewer.offline` audit events
6. **Error responses** — verifies 404 for nonexistent review ID (with JSON error body) and unknown static paths

For the flaky test fix: the root cause was Vitest's default concurrent test execution within `describe` blocks. Each integration test spins up its own broker + HTTP server + SQLite database, and concurrent lifecycle management of these resources caused occasional races. Applied `{ sequential: true }` to all three describe blocks in `broker-mounted-dashboard.integration.test.ts`.

## Verification

All five slice-level verification commands pass:

- Acceptance tests: 6/6 pass
- Integration tests: 12/12 pass (no regressions, flaky test stabilized)
- Smoke tests: 2/2 pass
- Contract tests: 27/27 pass
- Route tests: 20/20 pass

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm --filter review-broker-server exec vitest run test/dashboard-acceptance.integration.test.ts` | 0 | ✅ pass | 2.4s |
| 2 | `corepack pnpm --filter review-broker-server exec vitest run test/broker-mounted-dashboard.integration.test.ts` | 0 | ✅ pass | 4.3s |
| 3 | `corepack pnpm --filter review-broker-server exec vitest run test/start-broker.smoke.test.ts` | 0 | ✅ pass | 9.9s |
| 4 | `corepack pnpm --filter review-broker-core exec vitest run test/dashboard-contracts.test.ts` | 0 | ✅ pass | 5.5s |
| 5 | `corepack pnpm --filter review-broker-server exec vitest run test/http-dashboard-routes.test.ts test/http-event-feed-routes.test.ts test/http-review-routes.test.ts` | 0 | ✅ pass | 2.1s |

## Diagnostics

- Run `corepack pnpm --filter review-broker-server exec vitest run test/dashboard-acceptance.integration.test.ts` to verify cross-surface coherence. Failures include the specific API surface (overview/events/reviews) and Zod parse error paths when schema drift occurs.
- The `assertNoMetadataLeaks` helper checks the entire JSON stringification for `"metadata"`, `"command"`, `"args"`, `"cwd"`, `"workspaceRoot"` — a redaction regression surfaces the exact leaked key name.
- Error-response test (test 6) proves 404 status codes with JSON error bodies for unknown review IDs and unknown static paths.

## Deviations

- Events page doesn't have an `events-root` marker as the plan assumed; used `events-list` (the actual DOM element ID) instead.
- Added a 6th test case for error response verification (404 paths) to satisfy the pre-flight observability gap fix requiring a failure-path check.

## Known Issues

None.

## Files Created/Modified

- `packages/review-broker-server/test/dashboard-acceptance.integration.test.ts` — new acceptance test suite with 6 cross-surface tests
- `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` — added `{ sequential: true }` to all 3 describe blocks to fix flaky test
- `.gsd/milestones/M004/slices/S04/S04-PLAN.md` — added failure-path verification step (pre-flight fix)
- `.gsd/milestones/M004/slices/S04/tasks/T01-PLAN.md` — added Observability Impact section (pre-flight fix)
