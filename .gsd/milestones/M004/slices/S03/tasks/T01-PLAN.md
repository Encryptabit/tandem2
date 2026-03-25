---
estimated_steps: 5
estimated_files: 6
skills_used: []
---

# T01: Review list/detail contracts, route handlers, HTTP routes, and tests

**Slice:** S03 — Read-only review browser
**Milestone:** M004

## Description

Add the backend layer for the review browser: shared Zod schemas defining the dashboard transport contract for review list and detail responses, route handler methods that compose existing broker service read APIs with activity redaction, HTTP routes with URL param extraction, and comprehensive tests.

The review detail route is the most interesting piece — it composites four broker service calls (`getReviewStatus`, `getProposal`, `getDiscussion`, `getActivityFeed`) into one response, applying the same metadata-stripping redaction pattern established by S02's `projectOperatorEvent`.

## Steps

1. **Add dashboard review schemas to `packages/review-broker-core/src/dashboard.ts`:**
   - `DashboardReviewListItemSchema` — a strict Zod object mirroring `ReviewSummary` fields: `reviewId`, `title`, `status`, `priority`, `authorId`, `createdAt`, `updatedAt`, `claimedBy` (nullable), `claimedAt` (nullable), `claimGeneration`, `currentRound`, `latestVerdict` (nullable), `verdictReason` (nullable), `counterPatchStatus`, `lastMessageAt` (nullable), `lastActivityAt` (nullable). Use the same scalar schemas imported from `contracts.js` (`ReviewIdSchema`, `ReviewStatusSchema`, `ReviewPrioritySchema`, `ActorIdSchema`, `IsoDateTimeSchema`, `ClaimGenerationSchema`, `CurrentRoundSchema`, `ReviewVerdictSchema`, `VerdictReasonSchema`, `CounterPatchStatusSchema`).
   - `ReviewListResponseSchema` — strict `{ reviews: z.array(DashboardReviewListItemSchema), hasMore: z.boolean() }`.
   - `DashboardReviewActivityEntrySchema` — strict object with `auditEventId` (positive int), `reviewId` (string min 1), `eventType` (AuditEventTypeSchema), `actorId` (string min 1, nullable), `statusFrom` (ReviewStatusSchema, nullable), `statusTo` (ReviewStatusSchema, nullable), `errorCode` (string min 1, nullable), `summary` (string, nullable), `createdAt` (IsoDateTimeSchema). Note: no `metadata` field — this is the redaction.
   - `ReviewDetailResponseSchema` — strict object with: `review` (DashboardReviewListItemSchema), `proposal` (strict `{ title: string, description: string, diff: string, affectedFiles: string[], priority: ReviewPrioritySchema }`), `discussion` (array of strict `{ messageId: number, reviewId: string, actorId: string, authorRole: string, body: string, createdAt: string }` — reuse `ReviewDiscussionMessageSchema` from contracts), `activity` (array of `DashboardReviewActivityEntrySchema`).
   - Export inferred types: `DashboardReviewListItem`, `ReviewListResponse`, `DashboardReviewActivityEntry`, `ReviewDetailResponse`.
   - Add necessary imports from `./contracts.js` at the top of the file (many are already imported; add any missing ones like `ReviewPrioritySchema`, `ActorIdSchema`, `ReviewIdSchema`, `ClaimGenerationSchema`, `CurrentRoundSchema`, `ReviewVerdictSchema`, `VerdictReasonSchema`, `CounterPatchStatusSchema`, `ReviewDiscussionMessageSchema`).

2. **Add route handler methods to `packages/review-broker-server/src/http/dashboard-routes.ts`:**
   - Extend the `DashboardRouteHandler` interface with:
     - `getReviewList: (options: { status?: string; limit?: number }) => Promise<ReviewListResponse>`
     - `getReviewDetail: (reviewId: string) => Promise<ReviewDetailResponse>`
   - Import the new types from `review-broker-core`.
   - Add a `projectDashboardReviewListItem` helper that maps a `ReviewSummary` (from the broker service response) to a `DashboardReviewListItem`. All fields are already safe — this is a 1:1 mapping.
   - Add a `projectDashboardActivityEntry` helper that strips `metadata` and extracts `summary` — same pattern as the existing `projectOperatorEvent` function.
   - Implement `getReviewList`: call `runtime.service.listReviews({ status, limit: requestLimit + 1 })`, compute `hasMore` from the +1 probe, project items via `projectDashboardReviewListItem`. Note: `listReviews` is async — the return type of `getReviewList` must be `Promise<ReviewListResponse>`. Cap limit at 100.
   - Implement `getReviewDetail`: call `runtime.service.getReviewStatus({ reviewId })`, `runtime.service.getProposal({ reviewId })`, `runtime.service.getDiscussion({ reviewId })`, `runtime.service.getActivityFeed({ reviewId })` sequentially. Composite the response: map review summary via `projectDashboardReviewListItem`, extract proposal fields (`title`, `description`, `diff`, `affectedFiles`, `priority`), pass through discussion messages, project activity entries via `projectDashboardActivityEntry`. This is async.

3. **Add HTTP routes to `packages/review-broker-server/src/http/dashboard-server.ts`:**
   - Add `GET /api/reviews` route: parse `status` and `limit` query params, call `routes.getReviewList(options)`, return JSON. Place this route BEFORE the static asset fallback.
   - Add `GET /api/reviews/:reviewId` route: match `pathname.startsWith('/api/reviews/') && !pathname.endsWith('/api/reviews/')`, extract reviewId from the third path segment (`pathname.split('/')[3]`). Call `routes.getReviewDetail(reviewId)`. Catch `BrokerServiceError` with code `REVIEW_NOT_FOUND` and return 404 JSON `{ error: 'Review not found' }`. Return 400 JSON for missing/empty reviewId. Place this route AFTER `/api/reviews` exact match to avoid conflicts.
   - Import `BrokerServiceError` from the broker service module (check where it's exported — likely `../runtime/broker-service.js` or the index).

4. **Add contract tests to `packages/review-broker-core/test/dashboard-contracts.test.ts`:**
   - Test `DashboardReviewListItemSchema` parses a valid review list item with all fields.
   - Test `DashboardReviewListItemSchema` rejects extra fields (strict mode).
   - Test `ReviewListResponseSchema` parses valid response with reviews and hasMore.
   - Test `DashboardReviewActivityEntrySchema` parses valid activity entry without metadata.
   - Test `DashboardReviewActivityEntrySchema` rejects an entry that has a `metadata` field.
   - Test `ReviewDetailResponseSchema` parses a valid composite response.

5. **Add route tests in a new file `packages/review-broker-server/test/http-review-routes.test.ts`:**
   - Follow the pattern from `http-event-feed-routes.test.ts`: temp dir, `startBroker`, `createDashboardRoutes`, `createDashboardServer`, cleanup in `finally`.
   - Test `GET /api/reviews` returns empty list initially.
   - Test `GET /api/reviews` returns reviews after creating reviews via the broker service, validates against `ReviewListResponseSchema`.
   - Test `GET /api/reviews?status=pending` filters correctly.
   - Test `GET /api/reviews/:id` returns composite detail after creating a review with a message, validates against `ReviewDetailResponseSchema`.
   - Test `GET /api/reviews/:id` returns 404 for unknown review ID.
   - Test belt-and-suspenders redaction: create a review with activity, fetch detail, stringify the entire response, assert absence of `"metadata"`, `"command"`, `"args"`, `"cwd"`, `"workspaceRoot"` keys.
   - Import `WORKTREE_ROOT`, `FIXTURE_PATH`, `DASHBOARD_DIST_PATH` from `./test-paths.js`.

6. **Regenerate `packages/review-broker-core/src/dashboard.js` and rebuild:**
   - Run `corepack pnpm --filter review-broker-core build` to regenerate the JS mirror and dist.
   - Copy the updated `dashboard.js` output to `src/dashboard.js` if the build process doesn't do it automatically (check existing pattern — S01/S02 manually maintained the `.js` mirror alongside `.ts`).

## Must-Haves

- [ ] `DashboardReviewListItemSchema`, `ReviewListResponseSchema`, `DashboardReviewActivityEntrySchema`, `ReviewDetailResponseSchema` Zod schemas in `dashboard.ts`
- [ ] `getReviewList` and `getReviewDetail` on `DashboardRouteHandler` interface and implementation
- [ ] `GET /api/reviews` and `GET /api/reviews/:id` HTTP routes with proper error handling
- [ ] Activity redaction strips `metadata` entirely — `projectDashboardActivityEntry` projects only safe fields
- [ ] Contract tests for all new schemas (at least 6 tests)
- [ ] Route tests including redaction belt-and-suspenders (at least 6 tests)
- [ ] `review-broker-core` builds cleanly with new exports

## Verification

- `corepack pnpm --filter review-broker-core exec vitest run test/dashboard-contracts.test.ts` — all tests pass (21 existing + ~6 new)
- `corepack pnpm --filter review-broker-server exec vitest run test/http-review-routes.test.ts` — all ~6 route tests pass
- `corepack pnpm --filter review-broker-core build` — clean build

## Observability Impact

- Signals added: `GET /api/reviews` and `GET /api/reviews/:id` return structured JSON; errors return structured JSON with appropriate HTTP status codes (400, 404, 500)
- How a future agent inspects this: `curl http://localhost:<port>/api/reviews` and `curl http://localhost:<port>/api/reviews/<id>` against a running broker
- Failure state exposed: 404 JSON body for unknown reviews, 400 for missing review ID

## Inputs

- `packages/review-broker-core/src/dashboard.ts` — existing dashboard schemas to extend (OverviewSnapshot, EventFeed schemas)
- `packages/review-broker-core/src/contracts.ts` — ReviewSummary, ReviewProposal, ReviewDiscussionMessage, ReviewActivityEntry, and scalar schemas for field definitions
- `packages/review-broker-server/src/http/dashboard-routes.ts` — existing DashboardRouteHandler interface and createDashboardRoutes implementation
- `packages/review-broker-server/src/http/dashboard-server.ts` — existing HTTP server with /api/overview, /api/events, /api/events/feed routes
- `packages/review-broker-server/src/runtime/broker-service.ts` — broker service with listReviews, getReviewStatus, getProposal, getDiscussion, getActivityFeed methods
- `packages/review-broker-server/test/http-event-feed-routes.test.ts` — pattern reference for route test setup/teardown
- `packages/review-broker-server/test/test-paths.ts` — shared test path constants
- `packages/review-broker-core/test/dashboard-contracts.test.ts` — existing contract tests to extend

## Expected Output

- `packages/review-broker-core/src/dashboard.ts` — extended with review list/detail Zod schemas and exported types
- `packages/review-broker-core/src/dashboard.js` — regenerated JS mirror of dashboard.ts
- `packages/review-broker-core/src/dashboard.js.map` — regenerated sourcemap
- `packages/review-broker-server/src/http/dashboard-routes.ts` — extended with getReviewList, getReviewDetail, projection helpers
- `packages/review-broker-server/src/http/dashboard-server.ts` — extended with GET /api/reviews and GET /api/reviews/:id routes
- `packages/review-broker-core/test/dashboard-contracts.test.ts` — extended with ~6 new contract tests
- `packages/review-broker-server/test/http-review-routes.test.ts` — new file with ~6 route tests
