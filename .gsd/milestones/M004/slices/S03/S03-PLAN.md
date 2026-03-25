# S03: Read-only review browser

**Goal:** Operators can browse reviews and inspect review detail (status, proposal, discussion, activity) read-only from the broker-served dashboard.
**Demo:** From the same broker-served dashboard, operators can navigate to a Reviews page, see a filterable list of real reviews, click into any review to see its status, proposal with diff, discussion thread, and redaction-safe activity timeline — all backed by real broker state without mutating anything.

## Must-Haves

- Review list and detail Zod schemas in `review-broker-core/src/dashboard.ts` as shared transport contracts
- `getReviewList` and `getReviewDetail` methods on `DashboardRouteHandler` composing existing broker service read APIs
- `GET /api/reviews` route with optional `status` and `limit` query params returning `ReviewListResponse`
- `GET /api/reviews/:reviewId` route returning composite `ReviewDetailResponse` (status + proposal + discussion + redacted activity)
- Activity entries in detail response strip `metadata` entirely — only `summary` string projected (same pattern as `projectOperatorEvent`)
- `reviews.astro` page with `reviews-client.ts` handling list view, detail view (via `?id=` query param), and SSE-triggered refresh
- Navigation bar updated on all three pages: Overview, Events, Reviews — with active state
- Contract tests, route tests, and integration tests pass
- Dashboard builds producing 3 pages (index, events, reviews)

## Proof Level

- This slice proves: integration
- Real runtime required: yes (SQLite-backed broker with real reviews for integration tests)
- Human/UAT required: no (browser verification deferred to S04 integrated acceptance)

## Verification

- `corepack pnpm --filter review-broker-core exec vitest run test/dashboard-contracts.test.ts` — all contract tests pass including new review schemas
- `corepack pnpm --filter review-broker-server exec vitest run test/http-review-routes.test.ts` — route tests pass including redaction belt-and-suspenders
- `corepack pnpm --filter review-broker-server exec vitest run test/broker-mounted-dashboard.integration.test.ts` — integration tests pass including review list/detail through full HTTP stack
- `corepack pnpm --filter review-broker-dashboard build` — produces 3 pages (index.html, events/index.html, reviews/index.html)
- `corepack pnpm --filter review-broker-core build` — clean build with new exports
- `curl` against running broker: `GET /api/reviews/nonexistent-id` returns 404 JSON `{ "error": "Review not found" }` — structured error output for unknown review IDs

## Observability / Diagnostics

- Runtime signals: `GET /api/reviews` and `GET /api/reviews/:id` return JSON responses; errors return structured JSON with status codes (400/404/500)
- Inspection surfaces: review list/detail API routes inspectable via curl; dashboard reviews page renders real broker state
- Failure visibility: 404 for unknown reviewId with JSON error body; activity redaction failures caught by belt-and-suspenders test
- Redaction constraints: `ReviewActivityEntry.metadata` stripped entirely in dashboard projection — `command`, `args`, `cwd`, `workspaceRoot` never appear in API responses

## Integration Closure

- Upstream surfaces consumed: `runtime.service.listReviews()`, `runtime.service.getReviewStatus()`, `runtime.service.getProposal()`, `runtime.service.getDiscussion()`, `runtime.service.getActivityFeed()` from broker-service; `DashboardRouteHandler` interface and `createDashboardRoutes()` from S01; SSE notification bridge from S01; nav pattern from S02
- New wiring introduced in this slice: two new HTTP routes in `dashboard-server.ts`, two new methods on `DashboardRouteHandler`, pathname prefix matching for `/api/reviews/:id` URL params, new Astro page + client module
- What remains before the milestone is truly usable end-to-end: S04 integrated acceptance — reload/reconnect/restart coherence, assembled browser verification against real runtime

## Tasks

- [x] **T01: Review list/detail contracts, route handlers, HTTP routes, and tests** `est:50m`
  - Why: The backend must exist before the frontend can render anything. This task adds the shared Zod schemas, route handler methods that compose the five existing broker service read APIs with activity redaction, HTTP routes with URL param extraction, and contract + route tests proving schema validity and redaction safety.
  - Files: `packages/review-broker-core/src/dashboard.ts`, `packages/review-broker-core/src/dashboard.js`, `packages/review-broker-server/src/http/dashboard-routes.ts`, `packages/review-broker-server/src/http/dashboard-server.ts`, `packages/review-broker-core/test/dashboard-contracts.test.ts`, `packages/review-broker-server/test/http-review-routes.test.ts`
  - Do: (1) Add `DashboardReviewListItemSchema`, `ReviewListResponseSchema`, `DashboardReviewActivityEntrySchema`, and `ReviewDetailResponseSchema` Zod schemas in `dashboard.ts`. The list item reuses `ReviewSummary` fields directly. The activity entry strips `metadata`, keeps only `summary`. The detail response composites status + proposal + discussion + redacted activity. (2) Add `getReviewList` and `getReviewDetail` methods to `DashboardRouteHandler` interface and `createDashboardRoutes`. `getReviewList` calls `runtime.service.listReviews()` and projects. `getReviewDetail` calls `getReviewStatus`, `getProposal`, `getDiscussion`, `getActivityFeed` in sequence and composites with redacted activity via `projectDashboardActivityEntry`. (3) Add `GET /api/reviews` and `GET /api/reviews/:id` HTTP routes in `dashboard-server.ts`. Use pathname prefix matching for the parameterized route. Return 400 for missing reviewId, 404 for `REVIEW_NOT_FOUND` errors. (4) Add contract tests for all new schemas and route tests including the belt-and-suspenders redaction test. (5) Regenerate `dashboard.js` mirror and rebuild `review-broker-core`.
  - Verify: `corepack pnpm --filter review-broker-core exec vitest run test/dashboard-contracts.test.ts` and `corepack pnpm --filter review-broker-server exec vitest run test/http-review-routes.test.ts` both pass
  - Done when: All new contract and route tests pass, `review-broker-core` builds cleanly with new exports, and the redaction belt-and-suspenders test confirms no `metadata`/`command`/`args`/`cwd`/`workspaceRoot` keys appear in stringified review detail responses

- [x] **T02: Reviews page, client module, nav updates, and CSS** `est:40m`
  - Why: The frontend brings the API to operators. This task adds the reviews page shell, the client module that handles list and detail views, extends the nav bar, and adds CSS for review-specific UI elements.
  - Files: `packages/review-broker-dashboard/src/pages/reviews.astro`, `packages/review-broker-dashboard/src/components/reviews-client.ts`, `packages/review-broker-dashboard/src/styles/dashboard.css`, `packages/review-broker-dashboard/src/pages/index.astro`, `packages/review-broker-dashboard/src/pages/events.astro`
  - Do: (1) Create `reviews.astro` page following the `events.astro` pattern — same header, nav with Reviews link active, status badge, main container with `#reviews-root`. Import `reviews-client.ts`. (2) Build `reviews-client.ts` following `events-client.ts` structure: inline types mirroring the new Zod schemas, fetch `/api/reviews` for list, fetch `/api/reviews/<id>` for detail, SSE subscription for live updates, connection state badge. List view shows review rows with status badge, title, reviewId, timestamps. Detail view shows status header, proposal section with diff in `<pre>`, discussion thread, and activity timeline. View switching via `?id=<reviewId>` query param. Status filter chips for the list view. Back button returns to list. (3) Update nav on `index.astro` and `events.astro` to add Reviews link: `<a href="/reviews/">Reviews</a>`. (4) Add CSS for review list rows, status badges with color coding, proposal diff display, discussion thread, and activity timeline. Reuse existing card/panel patterns.
  - Verify: `corepack pnpm --filter review-broker-dashboard build` produces 3 pages (check for `reviews/index.html` in dist output)
  - Done when: Dashboard builds with 3 pages, reviews page includes the client script import and nav with Reviews link, and existing pages have the Reviews nav link

- [x] **T03: Integration tests and build verification** `est:30m`
  - Why: Integration tests prove the full stack works: real SQLite, real broker service, real HTTP routes, real dashboard build output. This closes the slice by exercising review list and detail routes through the assembled stack and verifying the dashboard mount serves the reviews page.
  - Files: `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts`, `packages/review-broker-core/src/index.ts`, `packages/review-broker-core/src/index.js`
  - Do: (1) Add integration tests to `broker-mounted-dashboard.integration.test.ts`: (a) test that `GET /api/reviews` returns a schema-valid review list after creating reviews via the broker service, (b) test that `GET /api/reviews/:id` returns composite detail with proposal, discussion, and redacted activity after creating a review + adding a message + submitting state changes, (c) test that `GET /api/reviews/:id` returns 404 for unknown review IDs, (d) test that the reviews page is served from the mounted dashboard (fetch `/reviews/` returns HTML containing expected markers). (2) Import new schemas (`ReviewListResponseSchema`, `ReviewDetailResponseSchema`) in the integration test. (3) Run all verification commands: contract tests, route tests, integration tests, dashboard build, and core build. Ensure the `review-broker-core` index re-exports are complete for new types.
  - Verify: `corepack pnpm --filter review-broker-server exec vitest run test/broker-mounted-dashboard.integration.test.ts` passes all tests including new review integration tests
  - Done when: All 4 verification commands pass (contract tests, route tests, integration tests, dashboard build), the reviews page is served from the mounted dashboard, and review detail responses contain real proposal/discussion/activity data with no metadata leakage

## Files Likely Touched

- `packages/review-broker-core/src/dashboard.ts`
- `packages/review-broker-core/src/dashboard.js`
- `packages/review-broker-core/src/dashboard.js.map`
- `packages/review-broker-core/src/index.ts`
- `packages/review-broker-core/src/index.js`
- `packages/review-broker-core/test/dashboard-contracts.test.ts`
- `packages/review-broker-server/src/http/dashboard-routes.ts`
- `packages/review-broker-server/src/http/dashboard-server.ts`
- `packages/review-broker-server/test/http-review-routes.test.ts`
- `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts`
- `packages/review-broker-dashboard/src/pages/reviews.astro`
- `packages/review-broker-dashboard/src/components/reviews-client.ts`
- `packages/review-broker-dashboard/src/styles/dashboard.css`
- `packages/review-broker-dashboard/src/pages/index.astro`
- `packages/review-broker-dashboard/src/pages/events.astro`
