---
id: T02
parent: S03
milestone: M004
provides:
  - reviews.astro page with nav, status badge, and reviews-client.ts import
  - reviews-client.ts with list/detail views, status filtering, SSE refresh, connection state, browser history support
  - Nav updated on all three pages (Overview, Events, Reviews) with active state
  - Review-specific CSS (status chips, review rows, diff block, discussion entries, activity entries, back link)
key_files:
  - packages/review-broker-dashboard/src/pages/reviews.astro
  - packages/review-broker-dashboard/src/components/reviews-client.ts
  - packages/review-broker-dashboard/src/styles/dashboard.css
  - packages/review-broker-dashboard/src/pages/index.astro
  - packages/review-broker-dashboard/src/pages/events.astro
key_decisions:
  - Used client-side status filtering via the filter chips rather than re-fetching with different status params — keeps the UX snappy for the initial load and matches the events-client.ts pattern for group filtering
  - Used history.pushState/popstate for detail view routing instead of hash fragments — cleaner URLs and supports browser back/forward natively
patterns_established:
  - reviews-client.ts follows the exact same boot pattern as events-client.ts — inline types, module-scope init(), SSE subscription on /api/events, connection state badge updates
  - Status chips use a consistent color scheme mapped to review statuses (pending=amber, claimed=blue, submitted=purple, approved=green, closed=gray, changes_requested=red) via CSS classes derived from the status field
observability_surfaces:
  - Connection state badge shows loading/connected/error/reconnecting in the header
  - Last-refresh timestamp updates on every successful fetch
  - Fetch failures render error-state divs with the HTTP status or error message
  - 404 for unknown review IDs renders "Review not found" with a back link
duration: 12m
verification_result: passed
completed_at: 2026-03-25
blocker_discovered: false
---

# T02: Reviews page, client module, nav updates, and CSS

**Add reviews page with list/detail views, status filtering, SSE live refresh, browser history routing, and review-specific CSS to the broker dashboard**

## What Happened

Created `reviews.astro` following the `events.astro` pattern exactly — same HTML structure, header with nav, status badge, last-refresh span, and script import for the client module.

Built `reviews-client.ts` with two views switched via the `?id=` query parameter. The list view fetches `/api/reviews`, renders status filter chips, and displays review rows with colored status badges, titles, reviewIds (monospace), author/claimer info, and relative timestamps. Clicking a row pushes `?id=<reviewId>` to history and fetches the composite detail. The detail view renders a status header, proposal section with diff in a scrollable `<pre>`, discussion thread (or "No discussion yet"), and activity timeline reusing the event row pattern. A back link returns to the list via pushState. SSE subscription on `/api/events` triggers re-fetch of whichever view is active. Browser back/forward works via `popstate` listener.

Updated nav on all three pages — `index.astro`, `events.astro`, and `reviews.astro` — each showing Overview, Events, Reviews links with the correct active state.

Extended `dashboard.css` with review-specific styles: `.review-list`, `.review-row` with hover, `.status-chip` with six color variants, `.status-filters`, `.detail-header`, `.detail-section`, `.diff-block` with monospace and scroll, `.discussion-entry`, `.activity-entry`, `.back-link`, `.affected-files`, and supporting meta/title/description classes.

## Verification

Dashboard build produces 3 pages (index.html, events/index.html, reviews/index.html). `reviews/index.html` exists in dist. Nav links containing "reviews" confirmed in both index.html and events/index.html. All slice-level verification checks pass: 27 contract tests, 6 review route tests, 8 integration tests, dashboard build, and core build all green.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm --filter review-broker-dashboard build` | 0 | ✅ pass | 3.1s |
| 2 | `test -f packages/review-broker-dashboard/dist/reviews/index.html` | 0 | ✅ pass | 0s |
| 3 | `grep -l 'reviews' packages/review-broker-dashboard/dist/index.html packages/review-broker-dashboard/dist/events/index.html` | 0 | ✅ pass | 0s |
| 4 | `corepack pnpm --filter review-broker-core exec vitest run test/dashboard-contracts.test.ts` | 0 | ✅ pass | 4.0s |
| 5 | `corepack pnpm --filter review-broker-server exec vitest run test/http-review-routes.test.ts` | 0 | ✅ pass | 4.0s |
| 6 | `corepack pnpm --filter review-broker-server exec vitest run test/broker-mounted-dashboard.integration.test.ts` | 0 | ✅ pass | 4.0s |
| 7 | `corepack pnpm --filter review-broker-core build` | 0 | ✅ pass | 4.0s |

## Diagnostics

- Dashboard build output reports "3 page(s) built" — index.html, events/index.html, reviews/index.html
- Reviews page served at `/reviews/` when broker is running; client fetches `/api/reviews` for list and `/api/reviews/:id` for detail
- Connection state badge transitions visible in header: loading → connected on first fetch, error on failure, reconnecting on SSE drop
- Status filter chips perform client-side filtering; the "all" filter shows every review, specific status filters narrow the list
- Detail view accessible via `?id=<reviewId>` query param; unknown IDs show "Review not found" with back link

## Deviations

- Task plan specified the status filter chips should re-fetch with `?status=` on the API. Implemented as client-side filtering for the initial load (consistent with events-client.ts group filtering pattern) but the `fetchList()` function does pass `status` as a query param when a filter is active, so server-side filtering also works for the reload/SSE path.
- Added `formatRelativeTime()` utility (not in the plan) for review timestamps instead of reusing the bare `formatTime()` — relative timestamps like "5m ago" are more useful for a review list than absolute HH:MM:SS.

## Known Issues

None.

## Files Created/Modified

- `packages/review-broker-dashboard/src/pages/reviews.astro` — new reviews page with nav, status badge, and client script import
- `packages/review-broker-dashboard/src/components/reviews-client.ts` — new client module with list/detail views, status filtering, SSE refresh, connection state, browser history support
- `packages/review-broker-dashboard/src/styles/dashboard.css` — extended with review-specific styles (status chips, review rows, diff block, discussion, activity, back link)
- `packages/review-broker-dashboard/src/pages/index.astro` — added Reviews nav link
- `packages/review-broker-dashboard/src/pages/events.astro` — added Reviews nav link
- `.gsd/milestones/M004/slices/S03/tasks/T02-PLAN.md` — added Observability Impact section
