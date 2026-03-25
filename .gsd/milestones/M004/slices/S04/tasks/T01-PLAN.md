---
estimated_steps: 5
estimated_files: 2
skills_used: []
---

# T01: Cross-surface acceptance test suite with reload and reconnect

**Slice:** S04 — Integrated operator shell and real-runtime acceptance
**Milestone:** M004

## Description

Write the final-assembly integration test that exercises all three dashboard surfaces (overview, events, reviews) against one real SQLite-backed broker instance. This is the test S03 explicitly deferred and the proof the milestone's cross-boundary trust model needs.

The test uses the same `startBroker()` + `createDashboardRoutes()` + `createDashboardServer()` composition as the existing integration tests — no new infrastructure needed. The key addition is cross-surface coherence: one broker, real mutations, all routes verified together, plus reload and startup-recovery scenarios.

Also investigate and fix the known flaky "serves the overview page" integration test in `broker-mounted-dashboard.integration.test.ts`.

## Steps

1. **Create `packages/review-broker-server/test/dashboard-acceptance.integration.test.ts`** using the same imports and setup pattern as `broker-mounted-dashboard.integration.test.ts`:
   - Import from `review-broker-core`: `OverviewSnapshotSchema`, `EventFeedResponseSchema`, `ReviewListResponseSchema`, `ReviewDetailResponseSchema`, `SSEChangePayloadSchema`
   - Import from `../src/runtime/app-context.js`: `createAppContext`
   - Import from `../src/runtime/broker-service.js`: `createBrokerService`
   - Import from `../src/index.js`: `startBroker`
   - Import from `../src/http/dashboard-routes.js`: `createDashboardRoutes`
   - Import from `../src/http/dashboard-server.js`: `createDashboardServer`, `DashboardServer`
   - Import from `./test-paths.js`: `WORKTREE_ROOT`, `FIXTURE_PATH`, `DASHBOARD_DIST_PATH`
   - Same `createTempDir()`, `readFixture()`, and `afterEach` cleanup as existing integration tests.

2. **Write the "all three pages serve from one broker" test** — start one broker + dashboard server, verify GET `/` returns 200 with `overview-root`, GET `/events/` returns 200 with `events-root`, GET `/reviews/` returns 200 with `reviews-root`. This proves the mounted dashboard serves all pages.

3. **Write the "cross-surface coherence after mutations" test** — start broker, create a review, add a discussion message. Then verify in one test:
   - GET `/api/overview` → `reviews.total === 1`, `reviews.pending === 1`, schema-valid
   - GET `/api/events/feed` → at least 1 event with `eventType === 'review.created'`, schema-valid, no metadata in stringified response
   - GET `/api/reviews` → 1 review with correct status, schema-valid
   - GET `/api/reviews/:id` → composite detail with proposal, discussion (1 message), redacted activity (no metadata), schema-valid
   This proves all four API surfaces agree on broker state after mutations.

4. **Write the "SSE notification triggers re-sync" test** — connect to `/api/events` SSE, create a review, wait for change event (400ms), verify the SSE payload matches `SSEChangePayloadSchema` with only `type`/`topic`/`version` keys, then re-fetch `/api/overview` and verify the snapshot reflects the new review. This is the "snapshot is truth, SSE is liveness" proof.

5. **Write the "reload coherence" test** — start broker, create 2 reviews, then simulate a reload by fetching all snapshot routes fresh: `/api/overview`, `/api/events/feed`, `/api/reviews`. Verify each returns consistent data (overview shows total=2, event feed has creation events, review list has 2 reviews). This proves the snapshot routes are authoritative truth that survives "reload" (re-fetch from scratch).

6. **Write the "startup recovery visible in overview" test** — follows the same pattern as the existing `overview projection includes startup recovery state` test: seed stale reviewer state (spawn reviewer, create review, claim review, close context), restart broker via `startBroker()`, create dashboard routes/server, verify GET `/api/overview` shows `startupRecovery.recoveredReviewerCount === 1` and `reclaimedReviewCount === 1`. Also verify the event feed includes recovery-related audit events (`review.reclaimed`, `reviewer.offline`).

7. **Investigate and fix the flaky "serves the overview page" test** in `broker-mounted-dashboard.integration.test.ts`. The S03 summary flagged this as "occasionally fails under parallel execution, likely port or dist-path contention." Check if the issue is that `createDashboardServer()` with default port 0 can conflict with other tests. If the flakiness is from parallel test execution within the file, the fix is likely adding `{ sequential: true }` to the describe block or ensuring each test's server is fully closed before the next starts.

## Must-Haves

- [ ] Acceptance test file exists at `packages/review-broker-server/test/dashboard-acceptance.integration.test.ts`
- [ ] Tests cover: all three pages serve, cross-surface coherence after mutations, SSE notification, reload coherence, and startup recovery visibility
- [ ] All acceptance tests pass: `corepack pnpm --filter review-broker-server exec vitest run test/dashboard-acceptance.integration.test.ts`
- [ ] Flaky "serves the overview page" test investigated and either fixed or documented with clear root cause
- [ ] No metadata/command/args/cwd/workspaceRoot leaks in any response — belt-and-suspenders redaction check in cross-surface test

## Verification

- `corepack pnpm --filter review-broker-server exec vitest run test/dashboard-acceptance.integration.test.ts` — all tests pass
- `corepack pnpm --filter review-broker-server exec vitest run test/broker-mounted-dashboard.integration.test.ts` — existing tests still pass (no regressions, flaky test fixed or stabilized)

## Inputs

- `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` — existing integration test patterns to follow
- `packages/review-broker-server/test/test-paths.ts` — shared test path exports (WORKTREE_ROOT, FIXTURE_PATH, DASHBOARD_DIST_PATH)
- `packages/review-broker-server/src/http/dashboard-routes.ts` — DashboardRouteHandler interface and createDashboardRoutes
- `packages/review-broker-server/src/http/dashboard-server.ts` — createDashboardServer function
- `packages/review-broker-server/src/index.ts` — startBroker function
- `packages/review-broker-core/src/dashboard.ts` — all Zod schemas for validation
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — startup recovery seeding pattern (seedStaleReviewerState)

## Expected Output

- `packages/review-broker-server/test/dashboard-acceptance.integration.test.ts` — new acceptance test file with 5-6 test cases covering cross-surface coherence, SSE, reload, and startup recovery
- `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` — potentially modified to fix flaky test

## Observability Impact

- **Signals added:** Each acceptance test validates Zod schema conformance (OverviewSnapshotSchema, EventFeedResponseSchema, ReviewListResponseSchema, ReviewDetailResponseSchema, SSEChangePayloadSchema), which means schema drift surfaces immediately as test failures with structured parse errors.
- **Failure inspection:** Test failures include assertion context (expected vs received values), Zod parse error paths, and HTTP status codes. The `assertNoMetadataLeaks` helper provides belt-and-suspenders redaction verification with the exact leaked key name in the assertion message.
- **Diagnostic surface:** The error-response test verifies that unknown review IDs return 404 with a JSON `{ error }` body and unknown static paths return 404 — proving the failure surfaces are inspectable via HTTP status codes.
- **Future agent inspection:** Run `corepack pnpm --filter review-broker-server exec vitest run test/dashboard-acceptance.integration.test.ts` to verify cross-surface coherence. Failures point to the specific surface (overview/events/reviews) and assertion that broke.
