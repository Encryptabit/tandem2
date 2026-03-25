---
id: T02
parent: S02
milestone: M004
provides:
  - events.astro page shell with nav, filter bar, and event list containers
  - events-client.ts with live follow, client-side group filtering, cursor pagination, and connection state
  - Navigation bar on both overview and events pages with active state
  - Event log CSS styles (nav, filter bar, event rows, live indicator, load more)
key_files:
  - packages/review-broker-dashboard/src/pages/events.astro
  - packages/review-broker-dashboard/src/components/events-client.ts
  - packages/review-broker-dashboard/src/pages/index.astro
  - packages/review-broker-dashboard/src/styles/dashboard.css
key_decisions:
  - Group filtering (All/Review/Reviewer) is client-side since the route only supports exact eventType matching
  - events-client.ts uses a Set<number> of known auditEventIds for dedup on SSE-triggered live follow
patterns_established:
  - Same client-rendering pattern as overview — Astro static shell, runtime JSON fetch, SSE re-fetch on change events
  - Filter bar chips with .active class toggle and re-render on filter change
observability_surfaces:
  - /events/ page renders live, filterable event list from /api/events/feed
  - Connection state badge (loading/connected/error/reconnecting) on events page matches overview pattern
  - Pulsing "Live" indicator confirms SSE-driven event following is active
  - Error state shows HTTP error message when /api/events/feed fails; empty state message for no-match filters
duration: 12m
verification_result: passed
completed_at: 2026-03-25
blocker_discovered: false
---

# T02: Events page with live follow, filtering, and cross-page navigation

**Added events.astro page, events-client.ts with SSE live follow and group filtering, nav bar on both pages, and event log CSS styles**

## What Happened

Created `events.astro` as a new Astro page shell mirroring the `index.astro` structure — same header with nav, status badge, and last-refresh timestamp, plus a `<main>` containing `#events-filter` and `#events-list` containers. The page imports `events-client.ts` in a script tag and `dashboard.css` in the frontmatter.

Created `events-client.ts` following the same client-rendering pattern as `overview-client.ts`: inline types mirroring the core contracts (no build-time import), connection state management via status badge, SSE connection to `/api/events` with `change` event triggering a re-fetch. The module implements:

- **Fetch with pagination:** `fetchEvents()` calls `/api/events/feed?limit=50` with optional `before` cursor and `eventType` query params.
- **Live follow:** On SSE `change` events, fetches latest events and diffs against a `Set<number>` of known IDs to prepend only genuinely new entries.
- **Client-side group filtering:** Three filter chips (All, Review, Reviewer) filter the already-fetched event list by `eventType` prefix (`review.*` or `reviewer.*`). This is client-side because the route only supports exact `eventType` matching.
- **Load more:** A "Load more" button at the bottom fetches older events via the `before` cursor and appends them.
- **Event rendering:** Each row shows event type (color-coded badge — blue/accent for review, amber/warning for reviewer), review ID, actor ID, status transition (from → to), summary, and timestamp.

Added a `<nav class="nav">` element to `index.astro` with Overview and Events links, active state via `class="active"` and `aria-current="page"`.

Extended `dashboard.css` with nav, filter bar, event row, live indicator (pulsing dot animation), and load-more button styles — all using the existing design token variables.

## Verification

- `corepack pnpm --filter review-broker-dashboard build` — succeeds, both pages generated
- `dist/events/index.html` exists in build output
- `dist/index.html` contains a `<nav>` element
- Slice-level: `dashboard-contracts.test.ts` — 14 tests pass
- Slice-level: `broker-mounted-dashboard.integration.test.ts` — 6 tests pass
- Slice-level: `http-event-feed-routes.test.ts` — does not exist yet (T03 scope)

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm --filter review-broker-dashboard build` | 0 | ✅ pass | 2.3s |
| 2 | `test -f dist/events/index.html` | 0 | ✅ pass | <1s |
| 3 | `grep -c '<nav' dist/index.html` | 0 | ✅ pass | <1s |
| 4 | `corepack pnpm --filter review-broker-core exec vitest run test/dashboard-contracts.test.ts` | 0 | ✅ pass | 2.7s |
| 5 | `corepack pnpm --filter review-broker-server exec vitest run test/broker-mounted-dashboard.integration.test.ts` | 0 | ✅ pass | 2.7s |
| 6 | `corepack pnpm --filter review-broker-server exec vitest run test/http-event-feed-routes.test.ts` | 1 | ⏳ skip (T03) | — |

## Diagnostics

- `/events/` page in browser — renders live event feed with connection state badge
- Status badge `data-state` attribute indicates SSE health (`connected`/`reconnecting`/`error`)
- "Live" pulsing dot confirms SSE-driven following is active
- Empty state message appears when no events match the active filter
- Error state shows HTTP error message when `/api/events/feed` is unreachable

## Deviations

None — implementation matched the task plan.

## Known Issues

None.

## Files Created/Modified

- `packages/review-broker-dashboard/src/pages/events.astro` — new events page shell with nav, filter bar, and event list containers
- `packages/review-broker-dashboard/src/components/events-client.ts` — client-side event feed rendering, group filtering, SSE live follow, cursor pagination
- `packages/review-broker-dashboard/src/pages/index.astro` — added `<nav>` element with Overview/Events links and active state
- `packages/review-broker-dashboard/src/styles/dashboard.css` — added nav, filter bar, event row, live indicator, and load-more button styles
- `.gsd/milestones/M004/slices/S02/tasks/T02-PLAN.md` — added Observability Impact section per pre-flight
