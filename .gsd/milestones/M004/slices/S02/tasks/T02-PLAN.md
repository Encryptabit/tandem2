---
estimated_steps: 4
estimated_files: 5
skills_used: []
---

# T02: Events page with live follow, filtering, and cross-page navigation

**Slice:** S02 — Live operator event/log surface
**Milestone:** M004

## Description

Build the operator-facing events page in the dashboard. This adds `events.astro` as a new page, `events-client.ts` as the client-side module for fetching/rendering/filtering the event feed with SSE-triggered live follow, a `<nav>` element to both pages for cross-page switching, and event-log-specific CSS styles.

The events page follows the same client-rendering pattern established in S01: the Astro page is a static shell, all data comes from runtime-fetched JSON via `/api/events/feed`, and SSE `change` events trigger a re-fetch of the latest events (prepending new entries without a full page reload). No Astro server components or build-time data.

## Steps

1. **Add `<nav>` to `packages/review-broker-dashboard/src/pages/index.astro`:**
   - Insert a `<nav>` element inside the existing `<header>`, before or after the `<h1>`. Use simple `<a>` links since these are separate static pages (not SPA).
   - Links: `<a href="/">Overview</a>` and `<a href="/events/">Events</a>`.
   - Mark the current page link as active (e.g. `class="active"` or `aria-current="page"`).

2. **Create `packages/review-broker-dashboard/src/pages/events.astro`:**
   - Same structure as `index.astro`: imports `../styles/dashboard.css`, has `<header>` with the same nav, status badge, last-refresh elements, and a `<main>` with `id="events-root"`.
   - Imports `../components/events-client.ts` in a `<script>` tag.
   - Title: "Events — Review Broker Dashboard".
   - Include a filter bar container (`id="events-filter"`) and the event list container (`id="events-list"`) inside main.

3. **Create `packages/review-broker-dashboard/src/components/events-client.ts`:**
   - **Types:** Inline minimal types mirroring `OperatorEventEntry` and `EventFeedResponse` (same pattern as `overview-client.ts` — no build-time import from core).
   - **State:** Track `events` array, `hasMore` flag, `oldestEventId` (for cursor pagination), `connectionState`, `lastRefreshAt`, `activeFilter` (event type or null), and a `Set<number>` of known event IDs (for dedup on live updates).
   - **Connection state management:** Reuse the same pattern from `overview-client.ts` — update status badge and last-refresh timestamp.
   - **Fetch:** `fetchEvents(options?: { before?: number; eventType?: string })` calls `/api/events/feed` with query params. Default limit 50. Returns parsed `EventFeedResponse`.
   - **Rendering:** `renderEventList()` renders the full event list into `#events-list`. Each event row shows: event type (with color-coded badge), review ID (if present), actor ID, status transition (from → to, if present), summary (if present), and timestamp. Use CSS classes for event-type color coding (review.* = accent/blue, reviewer.* = warning/amber).
   - **Filter bar:** Render a set of filter buttons/chips for common event type prefixes ("All", "Review", "Reviewer") in `#events-filter`. Clicking a filter re-fetches with the filter applied and clears the current list. For "Review" filter, use `eventType` param with prefix matching on the server if available, or filter client-side. Since the route supports exact `eventType` only, implement group filtering client-side: maintain the `activeFilter` as a prefix string, and pass individual `eventType` values to the API only when a specific event type is selected.
   - **Live follow:** Connect to `/api/events` SSE (same endpoint as overview page). On `change` event, fetch latest events (no `before` cursor), diff against known IDs, prepend new events to the list. Show a subtle "live" indicator when following is active.
   - **Load more:** A "Load more" button at the bottom of the event list. Clicking it calls `fetchEvents({ before: oldestEventId })` and appends older events to the list. Hide the button when `hasMore` is false.
   - **Utilities:** Reuse `escapeHtml` and `formatTime` patterns from `overview-client.ts` (inline, not imported).

4. **Add event log styles to `packages/review-broker-dashboard/src/styles/dashboard.css`:**
   - Nav styles: `.nav` with flex layout, `.nav a` styling, `.nav a.active` highlight.
   - Event list: `.event-row` with border-bottom, padding, flex layout. `.event-type-badge` with small rounded pill styling and color variants. `.event-meta` for timestamp and actor. `.event-summary` for the summary text.
   - Filter bar: `.filter-bar` with flex gap, `.filter-chip` with button styling, `.filter-chip.active` highlight.
   - Live indicator: `.live-indicator` with a small pulsing dot animation.
   - Load more: `.load-more-btn` with centered button styling.

## Must-Haves

- [ ] Navigation bar on both `index.astro` and `events.astro` with active state
- [ ] Events page renders event list from `/api/events/feed`
- [ ] Event type color coding distinguishes review events from reviewer events
- [ ] Filter controls work for event type categories
- [ ] SSE-triggered live follow prepends new events without page reload
- [ ] "Load more" pagination loads older events via cursor
- [ ] Connection state badge shows loading/connected/reconnecting/error
- [ ] Dashboard builds cleanly with `pnpm --filter review-broker-dashboard build`

## Verification

- `corepack pnpm --filter review-broker-dashboard build` succeeds
- Verify `dist/events/index.html` exists in the dashboard build output
- Verify `dist/index.html` contains a `<nav>` element

## Inputs

- `packages/review-broker-dashboard/src/pages/index.astro` — existing overview page to add nav to
- `packages/review-broker-dashboard/src/components/overview-client.ts` — reference for client-rendering patterns (SSE, fetch, connection state)
- `packages/review-broker-dashboard/src/styles/dashboard.css` — existing dashboard styles to extend
- `packages/review-broker-core/src/dashboard.ts` — `OperatorEventEntrySchema` and `EventFeedResponseSchema` contracts (from T01) for type reference
- `packages/review-broker-server/src/http/dashboard-server.ts` — `/api/events/feed` route (from T01) that the client consumes

## Expected Output

- `packages/review-broker-dashboard/src/pages/events.astro` — new events page shell
- `packages/review-broker-dashboard/src/components/events-client.ts` — client-side event feed rendering, filtering, live follow
- `packages/review-broker-dashboard/src/pages/index.astro` — updated with navigation bar
- `packages/review-broker-dashboard/src/styles/dashboard.css` — extended with nav, event list, filter, and live indicator styles

## Observability Impact

- **New inspection surface:** `/events/` browser page renders a live, filterable event list from `/api/events/feed`. Operators can visually inspect broker audit events without curl or SQLite access.
- **Connection state:** The events page exposes connection state via a status badge (`loading`/`connected`/`error`/`reconnecting`), matching the overview page pattern — a future agent can verify SSE health by checking the badge's `data-state` attribute.
- **Live follow indicator:** A pulsing "Live" dot confirms SSE-driven event following is active, distinguishing a stale page from a connected one.
- **Failure visibility:** If `/api/events/feed` fails, the page renders an error message with the HTTP status. If no events match a filter, the page shows an empty-state message rather than silently being blank.
