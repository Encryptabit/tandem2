---
estimated_steps: 4
estimated_files: 5
skills_used: []
---

# T02: Reviews page, client module, nav updates, and CSS

**Slice:** S03 — Read-only review browser
**Milestone:** M004

## Description

Build the browser-facing reviews page. This follows the exact patterns established by S01 (`overview-client.ts`) and S02 (`events-client.ts`): a static Astro shell page, a client-rendered TypeScript module that fetches JSON from broker-owned routes, SSE-triggered re-fetch, and connection state badge. The reviews page is more complex than events because it has two views (list and detail) switched via the `?id=` query parameter.

## Steps

1. **Create `packages/review-broker-dashboard/src/pages/reviews.astro`:**
   - Follow the `events.astro` pattern exactly — same HTML structure, same header with `<h1>`, nav, status badge, last-refresh span.
   - Nav links: Overview (`/`), Events (`/events/`), Reviews (`/reviews/` with `class="active" aria-current="page"`).
   - Main content: `<div id="reviews-root"><div class="loading-state">Connecting to broker…</div></div>`.
   - Script import: `import '../components/reviews-client.ts';`.
   - Style import at top: `import '../styles/dashboard.css';`.
   - Page title: `Reviews — Review Broker Dashboard`.

2. **Create `packages/review-broker-dashboard/src/components/reviews-client.ts`:**
   - **Inline types** (do NOT import from review-broker-core — same pattern as events-client.ts):
     - `DashboardReviewListItem` — mirrors the Zod schema: `reviewId, title, status, priority, authorId, createdAt, updatedAt, claimedBy, claimedAt, claimGeneration, currentRound, latestVerdict, verdictReason, counterPatchStatus, lastMessageAt, lastActivityAt`.
     - `ReviewListResponse` — `{ reviews: DashboardReviewListItem[], hasMore: boolean }`.
     - `DashboardReviewActivityEntry` — `{ auditEventId, reviewId, eventType, actorId, statusFrom, statusTo, errorCode, summary, createdAt }`.
     - `ReviewDiscussionMessage` — `{ messageId, reviewId, actorId, authorRole, body, createdAt }`.
     - `ReviewProposalDetail` — `{ title, description, diff, affectedFiles, priority }`.
     - `ReviewDetailResponse` — `{ review: DashboardReviewListItem, proposal: ReviewProposalDetail, discussion: ReviewDiscussionMessage[], activity: DashboardReviewActivityEntry[] }`.
     - `ConnectionState`, `StatusFilter` types.
   - **State variables:** `reviews` array, `hasMore` flag, `activeDetail` (ReviewDetailResponse or null), `connectionState`, `lastRefreshAt`, `activeStatusFilter`, `eventSource`.
   - **DOM references:** `statusBadge`, `lastRefreshEl`, `reviewsRoot` (id="reviews-root").
   - **View routing:** Check `URLSearchParams` for `id` param on load. If present, fetch detail. Otherwise, fetch list. Listen to `popstate` for browser back/forward.
   - **List view rendering** (`renderListView`):
     - Status filter chips row: All, Pending, Claimed, Submitted, Approved, Closed. Client-side filtering by status field match.
     - Review rows: each row shows status badge (colored by status — same color scheme as event type badges), title, reviewId (monospace), authorId, updatedAt as relative time. Row is clickable — sets `?id=<reviewId>` via `history.pushState` and fetches detail.
     - "Load more" if hasMore (fetch `/api/reviews?limit=50&status=<filter>` — though the route doesn't support cursor pagination, limit is sufficient for now).
   - **Detail view rendering** (`renderDetailView`):
     - Back button at top: "← Back to reviews" — calls `history.pushState` to remove `?id=` param and renders list.
     - Status header: review title, status badge, reviewId, authorId, round info, timestamps.
     - Proposal section: title, description, diff in `<pre class="diff-block">` with horizontal scroll, affected files list.
     - Discussion section: messages rendered as simple stacked entries (actorId, authorRole badge, body, timestamp). If empty, show "No discussion yet."
     - Activity section: timeline entries reusing the event row pattern from S02 (eventType, summary, status transition arrows, timestamp). If empty, show "No activity yet."
   - **SSE subscription:** Same pattern as events-client.ts — listen on `/api/events`, on `change` event re-fetch the current view (list or detail depending on state).
   - **Connection state badge:** Same updateConnectionState/updateLastRefresh pattern.
   - **Error handling:** If fetch fails, show error state in the view area, keep connection state badge updated.
   - **Init:** Call `init()` at module scope, which checks URL for `?id=` and either fetches list or detail.

3. **Update nav on existing pages:**
   - In `packages/review-broker-dashboard/src/pages/index.astro`, add `<a href="/reviews/">Reviews</a>` to the nav, after the Events link.
   - In `packages/review-broker-dashboard/src/pages/events.astro`, add `<a href="/reviews/">Reviews</a>` to the nav, after the Events link.

4. **Add CSS to `packages/review-broker-dashboard/src/styles/dashboard.css`:**
   - `.review-list` — container for review rows.
   - `.review-row` — clickable row with hover state, padding, border-bottom. Similar to event rows.
   - `.review-row:hover` — subtle background highlight.
   - `.status-chip` — small colored badge for review status. Colors: pending=amber, claimed=blue, submitted=purple, approved=green, closed=gray, changes_requested=red.
   - `.status-filters` — flex row of filter chips (similar to event group filters).
   - `.detail-header` — review detail header section with title, status, metadata.
   - `.detail-section` — container for proposal/discussion/activity sections with heading.
   - `.diff-block` — `<pre>` with monospace font, dark background, horizontal scroll, max-height with vertical scroll.
   - `.discussion-entry` — message entry with actorId label, body, timestamp.
   - `.activity-entry` — activity timeline entry (reuse event row styling patterns).
   - `.back-link` — styled back button at top of detail view.
   - `.affected-files` — list of affected file paths in monospace.
   - Use existing CSS custom properties for colors, spacing, and typography.

## Must-Haves

- [ ] `reviews.astro` page with correct nav, script import, and container elements
- [ ] `reviews-client.ts` with list view, detail view, status filtering, SSE refresh, connection state
- [ ] List view shows review rows with status badge, title, reviewId, timestamps
- [ ] Detail view shows proposal (with diff), discussion thread, and activity timeline
- [ ] View switching via `?id=` query param with browser history support (pushState/popstate)
- [ ] Nav updated on all three pages: Overview, Events, Reviews with active state
- [ ] Dashboard builds producing 3 pages

## Verification

- `corepack pnpm --filter review-broker-dashboard build` — produces 3 pages (check build output or verify `dist/reviews/index.html` exists)
- `test -f packages/review-broker-dashboard/dist/reviews/index.html` — reviews page exists in build output
- Verify nav links in built HTML: `grep -l 'reviews' packages/review-broker-dashboard/dist/index.html packages/review-broker-dashboard/dist/events/index.html`

## Inputs

- `packages/review-broker-dashboard/src/pages/events.astro` — pattern reference for page structure
- `packages/review-broker-dashboard/src/components/events-client.ts` — pattern reference for client module structure (inline types, SSE, fetch, connection state)
- `packages/review-broker-dashboard/src/styles/dashboard.css` — existing CSS to extend
- `packages/review-broker-dashboard/src/pages/index.astro` — needs nav update
- `packages/review-broker-core/src/dashboard.ts` — Zod schemas to mirror as inline types (from T01 output)

## Expected Output

- `packages/review-broker-dashboard/src/pages/reviews.astro` — new reviews page
- `packages/review-broker-dashboard/src/components/reviews-client.ts` — new client module with list/detail views
- `packages/review-broker-dashboard/src/styles/dashboard.css` — extended with review-specific styles
- `packages/review-broker-dashboard/src/pages/index.astro` — nav updated with Reviews link
- `packages/review-broker-dashboard/src/pages/events.astro` — nav updated with Reviews link

## Observability Impact

- **New signals:** The reviews page renders real broker state via `/api/reviews` and `/api/reviews/:id` — operators can now inspect review list and detail visually. Connection state badge and last-refresh timestamp show SSE liveness.
- **Inspection surfaces:** A future agent can verify the reviews page by checking `dist/reviews/index.html` existence after build, or by curling the API routes when the broker is running and observing the client-rendered HTML.
- **Failure visibility:** Fetch failures surface as error-state divs in the reviews root container with the HTTP status or error message. 404s for unknown review IDs render a specific "Review not found" message with a back link. Connection state badge transitions to `error` or `reconnecting` on SSE/fetch failures.
