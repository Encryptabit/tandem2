---
id: S02
parent: M004
milestone: M004
provides:
  - OperatorEventEntrySchema and EventFeedResponseSchema shared contracts in review-broker-core
  - listGlobal() on AuditRepository with cursor-based pagination and event-type filtering
  - Redaction-safe projectOperatorEvent() that strips metadata and surfaces only safe fields plus summary
  - getEventFeed() on DashboardRouteHandler returning paginated EventFeedResponse
  - GET /api/events/feed HTTP route with limit, before, and eventType query params
  - events.astro page with client-rendered event list, SSE-triggered live follow, group filtering, and load-more pagination
  - Cross-page navigation bar on both overview and events pages
  - 21 contract tests, 6 route tests, and 2 event feed integration tests
requires:
  - S01 broker-owned HTTP listener, mounted dashboard, SSE bridge, and shared transport contracts
affects:
  - S03
  - S04
key_files:
  - packages/review-broker-core/src/dashboard.ts
  - packages/review-broker-server/src/db/audit-repository.ts
  - packages/review-broker-server/src/http/dashboard-routes.ts
  - packages/review-broker-server/src/http/dashboard-server.ts
  - packages/review-broker-dashboard/src/pages/events.astro
  - packages/review-broker-dashboard/src/components/events-client.ts
  - packages/review-broker-dashboard/src/pages/index.astro
  - packages/review-broker-dashboard/src/styles/dashboard.css
  - packages/review-broker-core/test/dashboard-contracts.test.ts
  - packages/review-broker-server/test/http-event-feed-routes.test.ts
  - packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts
key_decisions:
  - listGlobal() caps at 201 rows internally (not 200) so getEventFeed() can request limit+1 for hasMore detection without a separate count query
  - Redaction strips the entire metadata object — only the summary string is projected forward; command, args, cwd, and workspaceRoot never appear in event feed responses
  - Group filtering (All/Review/Reviewer) is client-side since the route only supports exact eventType matching, not prefix queries
  - events-client.ts uses a Set<number> of known auditEventIds for dedup on SSE-triggered live follow
patterns_established:
  - Same client-rendering pattern as overview — Astro static shell, runtime JSON fetch, SSE re-fetch on change events
  - Same projection pattern as projectLatestReviewer() — explicit safe-field extraction, no pass-through
  - Route test file mirrors http-dashboard-routes.test.ts setup/teardown (temp dir, startBroker, createDashboardRoutes, createDashboardServer, cleanup in finally)
verification_result: passed
completed_at: 2026-03-25
---

# S02: Live operator event/log surface

**Operators can view a live, redaction-safe event feed in the dashboard backed by real broker audit data.**

## What This Slice Delivered

S02 added the first broker-owned operator event/log surface to the dashboard. Before this slice, operators could see the overview but had no browser-visible event history — diagnosis still required CLI tails or raw database reads. Now the dashboard has a `/events` page that renders structured broker audit events with live follow, type filtering, cursor pagination, and explicit redaction safety.

### Backend: event feed contract and route

Added `OperatorEventEntrySchema` and `EventFeedResponseSchema` as shared Zod contracts in `review-broker-core/src/dashboard.ts`. These define the operator-safe shape of audit events — 9 explicitly allowed fields per entry plus a `summary` string extracted from metadata, with `hasMore` pagination semantics.

Extended `AuditRepository` with `listGlobal(options?)` for global reverse-chronological event listing. Supports cursor-based pagination (`beforeId`), event-type filtering (`eventType`), and configurable limit (default 50, capped at 201 internally for the +1 hasMore probe).

Added `projectOperatorEvent()` as the redaction helper in `dashboard-routes.ts`. It strips the entire raw `metadata` object and extracts only the `summary` string if present and non-empty. This follows the same projection pattern as `projectLatestReviewer()` — explicit safe-field extraction, no pass-through of unknown properties.

Wired `getEventFeed()` on `DashboardRouteHandler` and the `GET /api/events/feed` HTTP route into the dashboard server, with query param parsing for `limit`, `before`, and `eventType`.

### Frontend: events page with live follow

Created `events.astro` as the second dashboard page, sharing the same Astro static shell + client-rendering pattern from S01. The `events-client.ts` module handles:

- **Initial fetch and rendering** — fetches `/api/events/feed?limit=50` and renders a scrollable list with event-type color coding (blue for review events, amber for reviewer events)
- **SSE-driven live follow** — listens for `change` events on the existing `/api/events` SSE endpoint, re-fetches the feed, diffs against a `Set<number>` of known event IDs, and prepends genuinely new entries with a pulsing "Live" indicator
- **Client-side group filtering** — All/Review/Reviewer filter chips that match by `eventType` prefix, since the backend only supports exact-type filtering
- **Cursor pagination** — "Load more" button that fetches older events via the `before` cursor

Added a `<nav>` element to both `index.astro` and `events.astro` for cross-page navigation with active state (`aria-current="page"`).

### Test coverage

- **Contract tests (7 new, 21 total):** `OperatorEventEntrySchema` valid parse, nullable fields, strict rejection; `EventFeedResponseSchema` valid response, empty array, strict rejection
- **Route tests (6 new):** default listing, limit with hasMore, cursor pagination with disjoint verification, eventType filter, empty result for unknown types, and the critical belt-and-suspenders redaction test that stringifies the entire response and asserts absence of both metadata values and key names
- **Integration tests (2 new, 8 total):** event feed after real broker mutations, and cursor pagination across multiple broker mutations through the full HTTP stack

## Verification Summary

| Check | Result |
|-------|--------|
| `corepack pnpm --filter review-broker-core exec vitest run test/dashboard-contracts.test.ts` | ✅ 21/21 passed |
| `corepack pnpm --filter review-broker-server exec vitest run test/http-event-feed-routes.test.ts` | ✅ 6/6 passed |
| `corepack pnpm --filter review-broker-server exec vitest run test/broker-mounted-dashboard.integration.test.ts` | ✅ 8/8 passed |
| `corepack pnpm --filter review-broker-dashboard build` | ✅ 2 pages built (index.html + events/index.html) |
| `/api/events/feed?eventType=nonexistent.type` returns empty events + hasMore:false | ✅ covered by route test |

## What the Next Slice Should Know

- **Event feed route is live:** `GET /api/events/feed` accepts `limit`, `before`, and `eventType` query params and returns `EventFeedResponse` JSON. S03 can reference this pattern when adding review-specific routes.
- **Cross-page nav exists:** Both pages now have a `<nav>` with Overview and Events links. S03 should extend this nav with the review browser link.
- **Redaction is strict and tested:** The `projectOperatorEvent()` helper strips metadata entirely. The route test stringifies the whole response and checks for absence of dangerous keys. Any new fields surfaced in event responses must go through explicit projection, not metadata pass-through.
- **Client module pattern is established:** `events-client.ts` mirrors `overview-client.ts` structure — inline types, SSE subscription, re-fetch on change, connection state badge. S03 can follow this pattern for review browsing pages.
- **listGlobal() is the only AuditRepository query that crosses review boundaries.** All other audit queries are review-scoped. If S03 needs cross-review audit data, use this method.

## Deviations from Plan

- Task plan referenced `context.repositories.audit` but `AppContext` exposes repos directly as `context.audit` — fixed during T01.
- `ListGlobalOptions` needed `| undefined` on optional properties due to `exactOptionalPropertyTypes: true` in tsconfig.
- `listGlobal` caps at 201 (not 200) to support the +1 hasMore probe at max limit.

## Known Issues

None.
