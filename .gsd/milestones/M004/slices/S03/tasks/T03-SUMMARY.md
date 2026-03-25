---
id: T03
parent: S03
milestone: M004
provides:
  - 4 new integration tests proving review list, detail, 404, and page mount through the full HTTP stack
  - Belt-and-suspenders redaction check through the integration layer (stringified response asserts no metadata/command/args/cwd/workspaceRoot)
  - Verified review-broker-core exports and JS mirrors are complete for all new dashboard schemas
key_files:
  - packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts
key_decisions:
  - No new decisions — this task validates existing T01/T02 work end-to-end
patterns_established:
  - Integration tests for review routes follow the same temp dir + startBroker + createDashboardRoutes + createDashboardServer + try/finally cleanup pattern as the existing overview and event feed integration tests
observability_surfaces:
  - Integration test suite at test/broker-mounted-dashboard.integration.test.ts covers 12 tests across 3 describe blocks (dashboard integration, event feed integration, review list/detail integration)
  - Belt-and-suspenders integration test catches metadata leakage that unit tests might miss by stringifying the full HTTP response body
  - 404 integration test confirms structured JSON error output flows through the real HTTP stack
  - Dashboard mount test confirms /reviews/ serves the built Astro page from the assembled broker server
duration: 8m
verification_result: passed
completed_at: 2026-03-25
blocker_discovered: false
---

# T03: Integration tests and build verification

**Add 4 integration tests proving review list/detail/404/page-mount through the full SQLite-backed HTTP stack, closing the S03 slice with all 5 verification suites green**

## What Happened

Added four integration tests to `broker-mounted-dashboard.integration.test.ts` in a new `review list/detail integration` describe block:

1. **Review list** — creates 2 reviews via `runtime.service.createReview()`, fetches `GET /api/reviews`, parses with `ReviewListResponseSchema`, asserts both reviews present with expected IDs/status and `hasMore === false`.

2. **Review detail** — creates a review, adds a discussion message via `runtime.service.addMessage()`, fetches `GET /api/reviews/:id`, parses with `ReviewDetailResponseSchema`, verifies composite response includes review fields, proposal with diff, discussion with expected body, activity entries with no `metadata` field, plus belt-and-suspenders stringify check for `"command"`, `"args"`, `"cwd"`, `"workspaceRoot"`, `"metadata"`.

3. **404 for unknown review** — fetches `GET /api/reviews/nonexistent-id`, asserts 404 status and JSON body with error message.

4. **Reviews page mount** — fetches `GET /reviews/` from the dashboard server, asserts 200 status and HTML containing `reviews-root`.

Verified `review-broker-core` exports: `src/index.ts` re-exports via `export * from './dashboard.js'` and `src/index.js` mirror is in sync — no changes needed.

## Verification

All 5 slice verification suites pass:
- 12 integration tests (8 existing + 4 new) pass
- 27 contract tests pass
- 6 route tests pass
- Dashboard build produces 3 pages (index.html, events/index.html, reviews/index.html)
- review-broker-core builds cleanly

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm --filter review-broker-server exec vitest run test/broker-mounted-dashboard.integration.test.ts` | 0 | ✅ pass | 1.7s |
| 2 | `corepack pnpm --filter review-broker-core exec vitest run test/dashboard-contracts.test.ts` | 0 | ✅ pass | 0.5s |
| 3 | `corepack pnpm --filter review-broker-server exec vitest run test/http-review-routes.test.ts` | 0 | ✅ pass | 0.9s |
| 4 | `corepack pnpm --filter review-broker-dashboard build` | 0 | ✅ pass | 0.8s |
| 5 | `corepack pnpm --filter review-broker-core build` | 0 | ✅ pass | 2.9s |

## Diagnostics

- Run `corepack pnpm --filter review-broker-server exec vitest run test/broker-mounted-dashboard.integration.test.ts` to re-verify the full integration stack
- The "review list/detail integration" describe block covers the 4 new review-specific tests
- The belt-and-suspenders redaction test in the detail integration test stringifies the full HTTP response and asserts absence of sensitive metadata keys

## Deviations

None. Implementation matched the task plan exactly.

## Known Issues

None.

## Files Created/Modified

- `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` — added `ReviewListResponseSchema` and `ReviewDetailResponseSchema` imports, added 4 new integration tests in `review list/detail integration` describe block
- `.gsd/milestones/M004/slices/S03/tasks/T03-PLAN.md` — added Observability Impact section (pre-flight fix)
