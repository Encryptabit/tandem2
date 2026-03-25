---
id: T03
parent: S02
milestone: M004
provides:
  - Contract tests for OperatorEventEntrySchema and EventFeedResponseSchema (valid parse, strict rejection, nullables)
  - Route tests for /api/events/feed covering default listing, limit, cursor pagination, eventType filter, hasMore semantics, and explicit redaction
  - Integration tests proving event feed works end-to-end after real broker mutations with pagination
key_files:
  - packages/review-broker-core/test/dashboard-contracts.test.ts
  - packages/review-broker-server/test/http-event-feed-routes.test.ts
  - packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts
key_decisions:
  - Redaction test stringifies entire HTTP response body and asserts absence of command/args/cwd/workspaceRoot values AND metadata key names — belt-and-suspenders approach
patterns_established:
  - Route test file mirrors the same setup/teardown pattern as http-dashboard-routes.test.ts (temp dir, startBroker, createDashboardRoutes, createDashboardServer, cleanup in finally blocks)
observability_surfaces:
  - All three test suites serve as regression guardrails for the event feed redaction contract and pagination behavior
duration: 12m
verification_result: passed
completed_at: 2026-03-25
blocker_discovered: false
---

# T03: Contract, route, and integration tests for event feed

**Added 21 contract tests (7 new for event feed schemas), 6 route tests for /api/events/feed with redaction proof, and 2 integration tests for event feed with real broker mutations**

## What Happened

Extended `dashboard-contracts.test.ts` with two new describe blocks: `OperatorEventEntrySchema` (4 tests — valid parse with all fields, nullable fields, strict rejection of extra fields including metadata, missing required fields) and `EventFeedResponseSchema` (3 tests — valid response, empty events array, strict rejection).

Created `http-event-feed-routes.test.ts` with 6 tests covering the full `/api/events/feed` HTTP route surface: reverse chronological ordering, limit parameter with hasMore, cursor pagination with disjoint verification, eventType filtering, empty result for unknown types, and the critical redaction test. The redaction test spawns a reviewer (producing metadata with `command`/`args`/`cwd`), creates a review, then stringifies the entire response body and asserts it contains none of: the raw `process.execPath`, the fixture path, the cwd path, or any `"command"`/`"args"`/`"cwd"`/`"workspaceRoot"`/`"metadata"` JSON keys. It also verifies `summary` IS present on events that have one.

Added 2 integration tests to `broker-mounted-dashboard.integration.test.ts`: one verifying event feed returns `review.created` events after a real broker mutation through the full HTTP stack, and one verifying cursor pagination works across multiple broker mutations with disjoint page verification.

## Verification

All three test suites pass green:
- `dashboard-contracts.test.ts`: 21 tests (14 existing + 7 new)
- `http-event-feed-routes.test.ts`: 6 tests (all new)
- `broker-mounted-dashboard.integration.test.ts`: 8 tests (6 existing + 2 new)
- `review-broker-dashboard build`: passes (dashboard builds cleanly)

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm --filter review-broker-core exec vitest run test/dashboard-contracts.test.ts` | 0 | ✅ pass | 4.6s |
| 2 | `corepack pnpm --filter review-broker-server exec vitest run test/http-event-feed-routes.test.ts` | 0 | ✅ pass | 4.6s |
| 3 | `corepack pnpm --filter review-broker-server exec vitest run test/broker-mounted-dashboard.integration.test.ts` | 0 | ✅ pass | 2.9s |
| 4 | `corepack pnpm --filter review-broker-dashboard build` | 0 | ✅ pass | 3.3s |

## Diagnostics

- Run `corepack pnpm --filter review-broker-core exec vitest run test/dashboard-contracts.test.ts` to verify contract tests
- Run `corepack pnpm --filter review-broker-server exec vitest run test/http-event-feed-routes.test.ts` to verify route tests including the redaction assertion
- Run `corepack pnpm --filter review-broker-server exec vitest run test/broker-mounted-dashboard.integration.test.ts` to verify integration tests
- The redaction test in `http-event-feed-routes.test.ts` is the primary safety net — it will catch any future regression that leaks metadata fields into the event feed response

## Deviations

- Initial edit to integration test file dropped the closing `});` of the parent describe block, causing a syntax error. Fixed immediately by adding the missing bracket.

## Known Issues

None.

## Files Created/Modified

- `packages/review-broker-core/test/dashboard-contracts.test.ts` — extended with 7 new tests for OperatorEventEntrySchema and EventFeedResponseSchema
- `packages/review-broker-server/test/http-event-feed-routes.test.ts` — new file with 6 route tests for /api/events/feed (ordering, limit, pagination, filtering, empty result, redaction)
- `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` — extended with 2 event feed integration tests (mutations + pagination)
- `.gsd/milestones/M004/slices/S02/tasks/T03-PLAN.md` — added Observability Impact section per pre-flight
- `.gsd/milestones/M004/slices/S02/S02-PLAN.md` — marked T03 as done
