---
id: S03
parent: M004
milestone: M004
provides:
  - ReviewListResponseSchema and ReviewDetailResponseSchema Zod contracts in review-broker-core
  - DashboardReviewListItemSchema and DashboardReviewActivityEntrySchema with metadata stripped for redaction safety
  - getReviewList and getReviewDetail methods on DashboardRouteHandler composing five existing broker service read APIs
  - GET /api/reviews route with optional status/limit query params
  - GET /api/reviews/:id route returning composite status + proposal + discussion + redacted activity
  - reviews.astro page with reviews-client.ts handling list/detail views, status filtering, SSE refresh, and browser history routing
  - Nav bar updated on all three dashboard pages (Overview, Events, Reviews) with active state
requires:
  - slice: S01
    provides: Broker-owned HTTP listener, dashboard mount, SSE notification bridge, snapshot-is-truth model
  - slice: S02
    provides: Event feed conventions, nav pattern, redaction projection pattern (projectOperatorEvent), events-client.ts boot structure
affects:
  - S04
key_files:
  - packages/review-broker-core/src/dashboard.ts
  - packages/review-broker-server/src/http/dashboard-routes.ts
  - packages/review-broker-server/src/http/dashboard-server.ts
  - packages/review-broker-dashboard/src/pages/reviews.astro
  - packages/review-broker-dashboard/src/components/reviews-client.ts
  - packages/review-broker-dashboard/src/styles/dashboard.css
key_decisions:
  - BrokerService added as an explicit DashboardRouteDependencies field rather than reaching through AppContext — keeps routes decoupled from runtime internals
  - Client-side status filtering via filter chips (consistent with events-client.ts group filtering) while also passing status to the API on re-fetch/SSE paths
  - history.pushState/popstate for detail view routing instead of hash fragments — cleaner URLs and native browser back/forward support
  - Activity entries strip metadata entirely — only summary string is projected forward; belt-and-suspenders tests enforce this at both route and integration levels
patterns_established:
  - projectDashboardReviewListItem and projectDashboardActivityEntry follow the same redaction projection pattern as projectOperatorEvent from S02
  - reviews-client.ts follows the exact boot pattern of events-client.ts — inline types, module-scope init(), SSE subscription, connection state badge
  - Status chips use a consistent color scheme mapped to review statuses (pending=amber, claimed=blue, submitted=purple, approved=green, closed=gray, changes_requested=red)
observability_surfaces:
  - GET /api/reviews returns JSON review list with hasMore pagination
  - GET /api/reviews/:id returns composite detail with review/proposal/discussion/redacted-activity
  - 404 JSON { error: "Review not found" } for unknown review IDs; 400 for missing ID
  - Connection state badge on the reviews page (loading/connected/error/reconnecting)
  - Belt-and-suspenders redaction tests at route and integration layers
drill_down_paths:
  - .gsd/milestones/M004/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M004/slices/S03/tasks/T02-SUMMARY.md
  - .gsd/milestones/M004/slices/S03/tasks/T03-SUMMARY.md
duration: 45m
verification_result: passed
completed_at: 2026-03-25
---

# S03: Read-only review browser

**Read-only review list and detail inspection from the broker dashboard, with shared Zod contracts, activity redaction, status filtering, and SSE live refresh — all composing existing broker service read APIs without mutating state.**

## What Happened

T01 added the backend: four Zod schemas in `review-broker-core/src/dashboard.ts` for review list items, list response, activity entries (metadata stripped), and composite detail response. Extended `DashboardRouteHandler` with `getReviewList` (using the +1 probe hasMore pattern from S02) and `getReviewDetail` (parallel calls to `getReviewStatus`, `getProposal`, `getDiscussion`, `getActivityFeed` with activity projected through `projectDashboardActivityEntry`). Added `BrokerService` as an explicit dependency on `DashboardRouteDependencies` and updated all callers (CLI + 3 test files, 22 call sites). Added `GET /api/reviews` with optional `status`/`limit` query params and `GET /api/reviews/:id` with 404 handling via `BrokerServiceError` code matching. Six contract tests and six route tests including the belt-and-suspenders redaction check.

T02 added the frontend: `reviews.astro` following the `events.astro` page pattern, with `reviews-client.ts` handling two views switched by `?id=` query param. List view renders status filter chips, review rows with colored status badges, titles, reviewer info, and relative timestamps. Detail view shows status header, proposal with diff in scrollable `<pre>`, discussion thread, and activity timeline. SSE subscription triggers re-fetch of whichever view is active. Browser history via pushState/popstate for native back/forward. Nav updated on all three pages with active state. Extended `dashboard.css` with review-specific styles.

T03 closed the slice: four integration tests proving review list, composite detail with redaction, 404 for unknown IDs, and reviews page mount through the full SQLite-backed HTTP stack. All five verification suites green.

## Verification

| # | Check | Result |
|---|-------|--------|
| 1 | `corepack pnpm --filter review-broker-core exec vitest run test/dashboard-contracts.test.ts` — 27 tests | ✅ pass |
| 2 | `corepack pnpm --filter review-broker-server exec vitest run test/http-review-routes.test.ts` — 6 tests | ✅ pass |
| 3 | `corepack pnpm --filter review-broker-server exec vitest run test/broker-mounted-dashboard.integration.test.ts` — 12 tests | ✅ pass |
| 4 | `corepack pnpm --filter review-broker-dashboard build` — 3 pages (index.html, events/index.html, reviews/index.html) | ✅ pass |
| 5 | `corepack pnpm --filter review-broker-core build` — clean build with new exports | ✅ pass |

## Requirements Advanced

- **R014** — Read-only review browsing delivered through broker-owned API routes with shared Zod contracts, activity redaction, and a dashboard reviews page. Pool management and mutating controls remain deferred.
- **R011** — Third dashboard surface (reviews) added to the broker-mounted Astro dashboard. Full validation awaits S04 integrated acceptance.
- **R002** — Review list/detail transport contracts are shared Zod schemas in review-broker-core reusing canonical domain vocabulary (ReviewSummary, review status, proposal, discussion). 27 contract tests cover all dashboard schemas.

## Requirements Validated

- None newly validated by this slice alone. R014 advanced but not fully validated (mutating controls deferred). R011 requires S04 for full validation.

## New Requirements Surfaced

- None.

## Requirements Invalidated or Re-scoped

- None.

## Deviations

- T01: Task plan suggested accessing broker service via `context.service`, but AppContext doesn't expose a service property. Added `BrokerService` as an explicit dependency on `DashboardRouteDependencies` instead — required updating 22 existing call sites across CLI and test files.
- T02: Status filter chips perform client-side filtering (consistent with events-client.ts group filtering) but also pass `status` as a query param on re-fetch/SSE paths, giving server-side filtering on the reload path.
- T02: Added `formatRelativeTime()` utility for review timestamps — relative timestamps like "5m ago" are more operator-useful than absolute HH:MM:SS for a review list.

## Known Limitations

- The reviews page is client-rendered and not tested through a real browser in this slice — browser verification is deferred to S04 integrated acceptance.
- The integration test for `serves the overview page` (an S01 test) is flaky under parallel execution — passes in isolation, fails occasionally when run alongside other tests that reuse the same port or dist path. Not an S03 issue.

## Follow-ups

- S04 must exercise the reviews page through a real browser against a running broker, including review list navigation, detail view rendering, and SSE-triggered refresh after broker mutations.
- S04 should verify that reload/reconnect leaves the reviews page coherent (snapshot truth model).

## Files Created/Modified

- `packages/review-broker-core/src/dashboard.ts` — 4 new Zod schemas and types for review list/detail
- `packages/review-broker-core/src/dashboard.js` — regenerated JS mirror
- `packages/review-broker-core/src/dashboard.js.map` — regenerated sourcemap
- `packages/review-broker-core/src/index.js` — regenerated JS mirror (re-exports new schemas)
- `packages/review-broker-core/test/dashboard-contracts.test.ts` — 6 new contract tests
- `packages/review-broker-server/src/http/dashboard-routes.ts` — getReviewList, getReviewDetail, projection helpers, BrokerService dependency
- `packages/review-broker-server/src/http/dashboard-server.ts` — GET /api/reviews and GET /api/reviews/:id routes
- `packages/review-broker-server/test/http-review-routes.test.ts` — new file, 6 route tests including redaction belt-and-suspenders
- `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` — 4 new integration tests in review list/detail describe block
- `packages/review-broker-server/src/cli/start-broker.ts` — added service: runtime.service to createDashboardRoutes
- `packages/review-broker-server/test/http-dashboard-routes.test.ts` — added service dependency
- `packages/review-broker-server/test/http-event-feed-routes.test.ts` — added service dependency
- `packages/review-broker-dashboard/src/pages/reviews.astro` — new reviews page
- `packages/review-broker-dashboard/src/components/reviews-client.ts` — new client module
- `packages/review-broker-dashboard/src/styles/dashboard.css` — review-specific styles
- `packages/review-broker-dashboard/src/pages/index.astro` — added Reviews nav link
- `packages/review-broker-dashboard/src/pages/events.astro` — added Reviews nav link

## Forward Intelligence

### What the next slice should know
- The dashboard now has three pages and three API route groups (overview, events, reviews). S04 needs to exercise all three through a real browser against one running broker, verifying coherence after mutations, reconnect, and reload.
- `BrokerService` is now a required field on `DashboardRouteDependencies`. Any new route handler code that needs broker reads should use this dependency rather than reaching into AppContext.
- The reviews detail route calls four broker service methods in parallel via `Promise.all`. If any of those methods throw unexpectedly (not REVIEW_NOT_FOUND), the route returns 500.

### What's fragile
- The `serves the overview page` integration test is occasionally flaky under parallel execution — likely a port or dist-path contention issue. S04 should be aware this may fail in full suite runs but passes in isolation.
- The reviews-client.ts uses inline types that mirror the Zod schemas. If the schemas change, the client types must be updated manually. Schema drift is caught by the route/integration tests, not by type checking.

### Authoritative diagnostics
- `GET /api/reviews` and `GET /api/reviews/:id` are curl-inspectable against a running broker. The responses are the same JSON the dashboard consumes.
- Belt-and-suspenders redaction tests exist at both route level (`http-review-routes.test.ts`) and integration level (`broker-mounted-dashboard.integration.test.ts`). Both stringify the entire response and assert absence of metadata/command/args/cwd/workspaceRoot keys.

### What assumptions changed
- Original plan assumed `context.service` was a property on AppContext — it's not. `BrokerService` was added as an explicit dependency instead, which is a cleaner pattern.
