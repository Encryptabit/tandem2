---
id: T01
parent: S03
milestone: M004
provides:
  - DashboardReviewListItemSchema, ReviewListResponseSchema, DashboardReviewActivityEntrySchema, ReviewDetailResponseSchema Zod schemas
  - getReviewList and getReviewDetail route handler methods with activity redaction
  - GET /api/reviews and GET /api/reviews/:id HTTP routes with error handling
  - 6 contract tests and 6 route tests including redaction belt-and-suspenders
key_files:
  - packages/review-broker-core/src/dashboard.ts
  - packages/review-broker-server/src/http/dashboard-routes.ts
  - packages/review-broker-server/src/http/dashboard-server.ts
  - packages/review-broker-server/test/http-review-routes.test.ts
  - packages/review-broker-core/test/dashboard-contracts.test.ts
key_decisions:
  - Added BrokerService as a required DashboardRouteDependencies field rather than reaching through AppContext — keeps the routes decoupled from internal context wiring
  - Used Promise.all for the four getReviewDetail sub-calls since they're independent reads with no ordering constraint
patterns_established:
  - projectDashboardReviewListItem and projectDashboardActivityEntry follow the same redaction projection pattern as the existing projectOperatorEvent
observability_surfaces:
  - GET /api/reviews returns JSON review list; GET /api/reviews/:id returns composite detail
  - 404 JSON { error: "Review not found" } for unknown review IDs; 400 for missing ID
  - Belt-and-suspenders test proves no metadata/command/args/cwd/workspaceRoot keys leak in serialized responses
duration: 25m
verification_result: passed
completed_at: 2026-03-25
blocker_discovered: false
---

# T01: Review list/detail contracts, route handlers, HTTP routes, and tests

**Add review list/detail Zod schemas, route handlers with activity redaction, HTTP routes, and 12 tests proving schema validity and metadata stripping**

## What Happened

Added four new Zod schemas to `dashboard.ts`: `DashboardReviewListItemSchema` (mirrors ReviewSummary fields), `ReviewListResponseSchema`, `DashboardReviewActivityEntrySchema` (no metadata field — that's the redaction), and `ReviewDetailResponseSchema` (composite of review + proposal + discussion + redacted activity).

Extended `DashboardRouteHandler` with `getReviewList` and `getReviewDetail` methods. `getReviewList` uses the +1 probe hasMore pattern established by the event feed. `getReviewDetail` calls four broker service methods in parallel and composites the response, with activity entries projected through `projectDashboardActivityEntry` which strips the metadata blob.

Added `BrokerService` as a required dependency on `DashboardRouteDependencies` and updated all callers (CLI, 3 test files totaling 22 call sites) to pass `service: runtime.service`.

Added two HTTP routes in `dashboard-server.ts`: `GET /api/reviews` with optional status/limit query params, and `GET /api/reviews/:reviewId` with 404 handling for REVIEW_NOT_FOUND errors.

## Verification

- 27 contract tests pass (21 existing + 6 new) covering all four new schemas
- 6 route tests pass covering empty list, populated list, status filtering, composite detail, 404 for unknown ID, and belt-and-suspenders redaction
- 14 existing route tests (8 dashboard + 6 event feed) pass with the service dependency addition
- 8 integration tests pass
- review-broker-core builds cleanly with new exports

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm --filter review-broker-core exec vitest run test/dashboard-contracts.test.ts` | 0 | ✅ pass | 0.4s |
| 2 | `corepack pnpm --filter review-broker-server exec vitest run test/http-review-routes.test.ts` | 0 | ✅ pass | 0.8s |
| 3 | `corepack pnpm --filter review-broker-core build` | 0 | ✅ pass | 3.0s |
| 4 | `corepack pnpm --filter review-broker-server exec vitest run test/http-event-feed-routes.test.ts test/http-dashboard-routes.test.ts` | 0 | ✅ pass | 1.4s |
| 5 | `corepack pnpm --filter review-broker-server exec vitest run test/broker-mounted-dashboard.integration.test.ts` | 0 | ✅ pass | 1.6s |

## Diagnostics

- `curl http://localhost:<port>/api/reviews` — returns JSON review list with hasMore pagination
- `curl http://localhost:<port>/api/reviews/<id>` — returns composite detail with review, proposal, discussion, and redacted activity
- `curl http://localhost:<port>/api/reviews/nonexistent` — returns 404 `{ "error": "Review not found" }`
- Belt-and-suspenders test stringifies entire API response and asserts absence of `"metadata"`, `"command"`, `"args"`, `"cwd"`, `"workspaceRoot"` keys

## Deviations

- Status filter test originally tried to close a review from `pending` status, which the state machine rejects. Simplified to test that `status=pending` returns pending reviews and `status=closed` returns empty.
- Task plan suggested using `context.service` for broker calls, but AppContext doesn't have a service property. Added `BrokerService` as an explicit dependency on `DashboardRouteDependencies` instead.

## Known Issues

None.

## Files Created/Modified

- `packages/review-broker-core/src/dashboard.ts` — added 4 new Zod schemas and 4 inferred types for review list/detail
- `packages/review-broker-core/src/dashboard.js` — regenerated JS mirror from tsc build
- `packages/review-broker-core/src/dashboard.js.map` — regenerated sourcemap
- `packages/review-broker-core/src/index.js` — regenerated JS mirror (re-exports new dashboard symbols)
- `packages/review-broker-core/test/dashboard-contracts.test.ts` — added 6 new contract tests for review schemas
- `packages/review-broker-server/src/http/dashboard-routes.ts` — added getReviewList, getReviewDetail, projection helpers, BrokerService dependency
- `packages/review-broker-server/src/http/dashboard-server.ts` — added GET /api/reviews and GET /api/reviews/:id routes with error handling
- `packages/review-broker-server/test/http-review-routes.test.ts` — new file with 6 route tests including redaction belt-and-suspenders
- `packages/review-broker-server/src/cli/start-broker.ts` — added service: runtime.service to createDashboardRoutes call
- `packages/review-broker-server/test/http-dashboard-routes.test.ts` — added service: runtime.service to all createDashboardRoutes calls
- `packages/review-broker-server/test/http-event-feed-routes.test.ts` — added service: runtime.service to all createDashboardRoutes calls
- `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` — added service: runtime.service to all createDashboardRoutes calls
- `.gsd/milestones/M004/slices/S03/S03-PLAN.md` — added diagnostic verification step, marked T01 done
