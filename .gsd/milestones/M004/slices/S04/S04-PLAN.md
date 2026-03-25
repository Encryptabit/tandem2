# S04: Integrated operator shell and real-runtime acceptance

**Goal:** Prove the assembled broker-served dashboard stays coherent across all three surfaces (overview, events, reviews) through reload, reconnect, and startup-recovery scenarios against a real SQLite-backed broker runtime.
**Demo:** A real broker process serves one coherent dashboard where overview, live operator events, and read-only review inspection stay aligned through reload/reconnect/startup-recovery scenarios, giving operators a trustworthy first-stop browser surface for normal diagnosis.

## Must-Haves

- Cross-surface integration test exercising all three pages and all API routes through one running broker with real mutations
- Reload coherence verification: after page reload, authoritative snapshot data is re-fetched (not stale SSE state)
- SSE reconnect verification: SSE disconnect → reconnect leaves each surface coherent
- Startup-recovery visibility: overview renders real recovery context from a broker that actually recovered stale state
- Cross-page navigation works between all three pages (overview → events → reviews → overview)
- All existing test suites (27 contract + 21 route + 12 integration + 2 smoke) still pass
- Known flaky "serves the overview page" integration test investigated and fixed or stabilized
- Requirements R011, R002, R005, R014 validated or advanced through integrated evidence

## Proof Level

- This slice proves: final-assembly
- Real runtime required: yes
- Human/UAT required: no — automated integration tests exercise the real broker-served entrypoint

## Verification

- `corepack pnpm --filter review-broker-server exec vitest run test/dashboard-acceptance.integration.test.ts` — all acceptance tests pass
- `corepack pnpm --filter review-broker-server exec vitest run test/broker-mounted-dashboard.integration.test.ts` — all 12+ existing tests pass (no regressions)
- `corepack pnpm --filter review-broker-server exec vitest run test/start-broker.smoke.test.ts` — smoke tests pass
- `corepack pnpm --filter review-broker-core exec vitest run test/dashboard-contracts.test.ts` — 27 contract tests pass
- `corepack pnpm --filter review-broker-server exec vitest run test/http-dashboard-routes.test.ts test/http-event-feed-routes.test.ts test/http-review-routes.test.ts` — all route tests pass
- Acceptance test includes failure-path check: GET `/api/reviews/nonexistent-id` returns 404 with error body; GET `/no-such-page` returns 404 — proves error surfaces are inspectable

## Observability / Diagnostics

- Runtime signals: existing broker.started, broker.dashboard_ready structured events on stdout; SSE heartbeat + change events; snapshot version counter
- Inspection surfaces: GET /api/overview, GET /api/events/feed, GET /api/reviews, GET /api/reviews/:id, GET /api/events (SSE)
- Failure visibility: connection state badge (loading/connected/reconnecting/error), snapshot version monotonicity, HTTP status codes on all API routes
- Redaction constraints: metadata never appears in event feed or review activity responses; belt-and-suspenders tests enforce this

## Integration Closure

- Upstream surfaces consumed: all three dashboard pages (index.astro, events.astro, reviews.astro), all client modules (overview-client.ts, events-client.ts, reviews-client.ts), all API routes, SSE bridge, shared Zod contracts
- New wiring introduced in this slice: acceptance test suite composing all surfaces against one broker instance
- What remains before the milestone is truly usable end-to-end: nothing — this is the final assembly slice

## Tasks

- [x] **T01: Cross-surface acceptance test suite with reload and reconnect** `est:45m`
  - Why: No prior slice exercised all three dashboard surfaces together against one running broker. S03 explicitly deferred browser/integration testing to S04. This test suite is the milestone's final-assembly proof.
  - Files: `packages/review-broker-server/test/dashboard-acceptance.integration.test.ts`
  - Do: Write an integration test file that spawns a real broker with `startBroker()` + `createDashboardRoutes()` + `createDashboardServer()` (same pattern as existing integration tests), seeds reviews/reviewers/audit events, and verifies: (1) all three pages serve HTML (/, /events/, /reviews/), (2) overview API reflects real counts after mutations, (3) event feed returns real audit events with redaction, (4) review list returns seeded reviews, review detail returns composite data with redacted activity, (5) SSE stream delivers change events after mutation then re-fetch returns updated snapshot, (6) "reload" scenario — re-fetch all snapshot routes after mutations and verify consistency, (7) startup-recovery scenario — seed stale reviewer state, restart broker, verify overview shows recovery counts. Also investigate and fix the flaky "serves the overview page" test in the existing integration suite.
  - Verify: `corepack pnpm --filter review-broker-server exec vitest run test/dashboard-acceptance.integration.test.ts` passes
  - Done when: acceptance test file exists with 6+ test cases covering cross-surface coherence, reload, SSE re-sync, and startup recovery — all green

- [x] **T02: Full suite verification, gap fixes, and milestone closeout** `est:30m`
  - Why: The milestone is not complete until all test suites pass together and requirements are validated through integrated evidence. This task runs the full suite, fixes any narrow gaps or regressions, writes the S04 summary, and updates requirement statuses.
  - Files: `packages/review-broker-server/test/dashboard-acceptance.integration.test.ts`, `.gsd/milestones/M004/slices/S04/S04-SUMMARY.md`
  - Do: Run all dashboard-related test suites together (contracts, routes, integration, acceptance, smoke). Fix any failures or gaps found. Verify the flaky test is resolved. Write the slice summary with verification evidence. Browser-verify the assembled dashboard against a real running broker (overview renders data, events page shows live events, reviews page shows review list/detail, nav works across pages).
  - Verify: All suites green: `corepack pnpm --filter review-broker-core exec vitest run test/dashboard-contracts.test.ts && corepack pnpm --filter review-broker-server exec vitest run`
  - Done when: all test suites pass, S04 summary written with verification matrix, browser verification confirms assembled dashboard renders real data across all three pages

## Files Likely Touched

- `packages/review-broker-server/test/dashboard-acceptance.integration.test.ts` — new acceptance test suite
- `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` — fix flaky test if needed
- `.gsd/milestones/M004/slices/S04/S04-SUMMARY.md` — slice summary
