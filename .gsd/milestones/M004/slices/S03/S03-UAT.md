# S03: Read-only review browser — UAT

**Milestone:** M004
**Written:** 2026-03-25

## UAT Type

- UAT mode: mixed (artifact-driven contract/route/integration tests + live-runtime API verification)
- Why this mode is sufficient: The slice plan explicitly defers browser verification to S04 integrated acceptance. S03 proof level is integration — real SQLite-backed broker with real reviews. The existing test suites prove schema validity, redaction safety, and full-stack HTTP behavior. Live curl verification confirms the API surfaces work against a running broker.

## Preconditions

- `corepack pnpm --filter review-broker-dashboard build` has been run (dashboard dist exists at `packages/review-broker-dashboard/dist/` with `reviews/index.html`)
- `corepack pnpm --filter review-broker-core build` has been run (dist exports include new review schemas)
- A broker can be started via `corepack pnpm --filter review-broker-server exec tsx src/cli/start-broker.ts --dashboard --db-path /tmp/uat-s03.sqlite`
- For live-runtime tests, at least one review must be created through the broker service (the broker starts with zero reviews)

## Smoke Test

Run `corepack pnpm --filter review-broker-server exec vitest run test/broker-mounted-dashboard.integration.test.ts` — all 12 tests pass, including the 4 new review-specific integration tests. This confirms the full stack works: SQLite → broker service → route handler → HTTP server → response validation.

## Test Cases

### 1. Review list API returns schema-valid response

1. Start the broker with `--dashboard` flag
2. Create 2 reviews via the broker service (or use the integration test fixture)
3. `curl http://localhost:<port>/api/reviews`
4. **Expected:** 200 JSON response with `reviews` array containing 2 items, each with `reviewId`, `status`, `title`, `createdAt`, `updatedAt` fields. Response includes `hasMore: false`. No `metadata`, `command`, `args`, `cwd`, or `workspaceRoot` keys anywhere in the response body.

### 2. Review list supports status filtering

1. With reviews in pending status, `curl http://localhost:<port>/api/reviews?status=pending`
2. **Expected:** Only reviews with `status: "pending"` appear in the response.
3. `curl http://localhost:<port>/api/reviews?status=closed`
4. **Expected:** Empty `reviews` array (no closed reviews exist).

### 3. Review detail returns composite response with redacted activity

1. Create a review, add a discussion message via the service, then `curl http://localhost:<port>/api/reviews/<reviewId>`
2. **Expected:** 200 JSON with `review` (status fields), `proposal` (with diff), `discussion` (array with the message), and `activity` (array of entries with `summary` string only — no `metadata` object).
3. Stringify the entire response and search for `"metadata"`, `"command"`, `"args"`, `"cwd"`, `"workspaceRoot"`.
4. **Expected:** None of those key names appear anywhere in the stringified response.

### 4. Review detail returns 404 for unknown review ID

1. `curl -w '%{http_code}' http://localhost:<port>/api/reviews/nonexistent-id-abc`
2. **Expected:** 404 status code with JSON body `{ "error": "Review not found" }`.

### 5. Dashboard builds with 3 pages

1. Run `corepack pnpm --filter review-broker-dashboard build`
2. Check `packages/review-broker-dashboard/dist/` directory listing
3. **Expected:** `index.html`, `events/index.html`, and `reviews/index.html` all exist. Build output reports "3 page(s) built".

### 6. Reviews page is served from mounted dashboard

1. Start broker with `--dashboard` flag
2. `curl http://localhost:<port>/reviews/`
3. **Expected:** 200 status, HTML content containing `reviews-root` div and the reviews client script reference.

### 7. Nav bar shows all three pages on each page

1. `grep -l 'reviews' packages/review-broker-dashboard/dist/index.html packages/review-broker-dashboard/dist/events/index.html packages/review-broker-dashboard/dist/reviews/index.html`
2. **Expected:** All three files contain "reviews" (confirming the nav link is present on every page).

### 8. Contract tests validate all review schemas

1. Run `corepack pnpm --filter review-broker-core exec vitest run test/dashboard-contracts.test.ts`
2. **Expected:** 27 tests pass, including the 6 new review schema tests covering DashboardReviewListItemSchema, ReviewListResponseSchema, DashboardReviewActivityEntrySchema, and ReviewDetailResponseSchema.

## Edge Cases

### Missing review ID in parameterized route

1. `curl -w '%{http_code}' http://localhost:<port>/api/reviews/`
2. **Expected:** Route should not match the reviews list pattern. Behavior depends on trailing-slash handling, but should not return 400 "Missing review ID" since the list route should handle `/api/reviews` and `/api/reviews/` identically.

### Review with no discussion or activity

1. Create a review but don't add any messages or state transitions
2. `curl http://localhost:<port>/api/reviews/<reviewId>`
3. **Expected:** `discussion` is an empty array, `activity` is an array with at least one entry (the review creation event). No errors.

### Review list with limit param

1. Create 3 reviews, then `curl http://localhost:<port>/api/reviews?limit=2`
2. **Expected:** `reviews` array contains exactly 2 items, `hasMore: true`.

### Activity entry with populated metadata does not leak

1. Create a review that generates activity entries with metadata (e.g., entries from reviewer operations that include command/args)
2. `curl http://localhost:<port>/api/reviews/<reviewId>`
3. **Expected:** Activity entries contain only `summary` string. The metadata blob is fully stripped even if the underlying activity record contains it.

## Failure Signals

- Any test in `http-review-routes.test.ts` or the `review list/detail integration` describe block fails
- `dashboard build` produces fewer than 3 pages or is missing `reviews/index.html`
- `GET /api/reviews/:id` response contains `"metadata"`, `"command"`, `"args"`, `"cwd"`, or `"workspaceRoot"` anywhere in the stringified body
- `GET /api/reviews/nonexistent` returns anything other than 404 with JSON error
- Nav links for "Reviews" missing from index.html or events/index.html
- `review-broker-core build` fails (broken exports for new schemas)

## Requirements Proved By This UAT

- **R014** — Read-only review browsing delivered: list with status filtering, detail with proposal/discussion/activity, all through broker-owned routes composing existing service APIs. Mutating controls remain deferred.
- **R011** — Third dashboard surface (reviews) served from the broker-mounted Astro dashboard alongside overview and events.
- **R002** — Review list/detail transport contracts are shared Zod schemas in review-broker-core reusing canonical domain vocabulary.

## Not Proven By This UAT

- Real browser rendering of the reviews page (deferred to S04 integrated acceptance)
- SSE-triggered live refresh of the reviews page after broker mutations (tested in unit structure but not through a real browser)
- Reload/reconnect coherence of the reviews page (S04 scope)
- Full R014 closure (pool management and mutating controls remain deferred)
- Full R011 validation (requires S04 integrated acceptance across all three dashboard surfaces)

## Notes for Tester

- The `serves the overview page` integration test (an S01 test in the same file) is occasionally flaky under parallel execution. If it fails but the 4 review-specific tests pass, re-run with `-t "review"` to isolate.
- To create reviews for live testing, use the broker CLI or start a broker and call `runtime.service.createReview()`. Reviews need a proposal diff fixture — see `test/fixtures/` for examples.
- The reviews page client code uses `?id=<reviewId>` query params for detail view routing. To test detail view directly: open `http://localhost:<port>/reviews/?id=<reviewId>` in a browser.
