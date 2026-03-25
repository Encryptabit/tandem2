# S02: Live operator event/log surface

**Goal:** Operators can view a live, redaction-safe event feed in the dashboard backed by real broker audit data.
**Demo:** From the broker-served dashboard, operators open the events page and watch structured broker/operator events appear in real time without page reload — filtered by type, with redaction of sensitive metadata.

## Must-Haves

- Global event listing query on `AuditRepository` with cursor-based pagination and optional event-type filter
- `OperatorEventEntrySchema` and `EventFeedResponseSchema` in `review-broker-core/src/dashboard.ts` as shared contracts
- Redaction-safe projection: no `command`, `args`, `cwd`, or `workspaceRoot` in event feed responses — only explicitly safe fields plus `summary`
- `/api/events/feed` HTTP route on the broker dashboard server with `limit`, `before`, and `eventType` query params
- `events.astro` page with client-rendered event list, live follow via SSE-triggered re-fetch, and event-type filtering
- Navigation between overview and events pages on both pages
- Contract, route, and integration tests proving schema validity, pagination, redaction, and live update

## Proof Level

- This slice proves: integration
- Real runtime required: yes
- Human/UAT required: no

## Verification

- `corepack pnpm --filter review-broker-core exec vitest run test/dashboard-contracts.test.ts` — contract tests for `OperatorEventEntrySchema` and `EventFeedResponseSchema`
- `corepack pnpm --filter review-broker-server exec vitest run test/http-event-feed-routes.test.ts` — route tests for `/api/events/feed` with pagination, filtering, and redaction
- `corepack pnpm --filter review-broker-server exec vitest run test/broker-mounted-dashboard.integration.test.ts` — integration tests including event feed with real broker mutations
- `corepack pnpm --filter review-broker-dashboard build` — dashboard builds cleanly with the new events page
- `/api/events/feed?eventType=nonexistent.type` returns 200 with empty `events` array and `hasMore: false` — verifies graceful empty-result handling rather than error

## Observability / Diagnostics

- Runtime signals: `GET /api/events/feed` returns structured operator event entries with `hasMore` pagination flag
- Inspection surfaces: `/api/events/feed` route for programmatic access; `/events` page for browser inspection
- Failure visibility: HTTP error responses with status codes; empty event list with connection state indicator in browser
- Redaction constraints: `command`, `args`, `cwd`, `workspaceRoot` never appear in event feed responses — only `summary` from metadata is carried forward

## Integration Closure

- Upstream surfaces consumed: `AuditRepository` from `packages/review-broker-server/src/db/audit-repository.ts`, `DashboardRouteHandler` and `createDashboardRoutes` from `packages/review-broker-server/src/http/dashboard-routes.ts`, `createDashboardServer` from `packages/review-broker-server/src/http/dashboard-server.ts`, SSE bridge from S01
- New wiring introduced in this slice: `listGlobal()` on `AuditRepository`, `getEventFeed()` on `DashboardRouteHandler`, `/api/events/feed` route on dashboard HTTP server, `events.astro` page + `events-client.ts` client module
- What remains before the milestone is truly usable end-to-end: S03 (review browser), S04 (integrated acceptance)

## Tasks

- [x] **T01: Global event listing, redaction-safe contract, and event feed route** `est:45m`
  - Why: The backend seam for the event feed — the global query, shared contract schemas, redaction projection, and HTTP route — must exist before the browser page can consume it.
  - Files: `packages/review-broker-core/src/dashboard.ts`, `packages/review-broker-core/src/dashboard.js`, `packages/review-broker-core/src/dashboard.js.map`, `packages/review-broker-server/src/db/audit-repository.ts`, `packages/review-broker-server/src/http/dashboard-routes.ts`, `packages/review-broker-server/src/http/dashboard-server.ts`
  - Do: Add `OperatorEventEntrySchema` and `EventFeedResponseSchema` to `dashboard.ts`. Add `listGlobal(options)` to `AuditRepository` with `limit`/`beforeId`/`eventType` params. Add `getEventFeed(options)` to `DashboardRouteHandler` with a `projectOperatorEvent()` redaction helper that strips metadata and surfaces only safe fields plus `summary`. Wire `/api/events/feed` GET route into `dashboard-server.ts` with query param parsing. Rebuild `review-broker-core` dist and JS mirrors.
  - Verify: `corepack pnpm --filter review-broker-core build` succeeds; `corepack pnpm --filter review-broker-server exec vitest run test/http-event-feed-routes.test.ts` passes
  - Done when: `/api/events/feed` returns valid `EventFeedResponse` JSON with redacted events, correct pagination, and event-type filtering

- [x] **T02: Events page with live follow, filtering, and cross-page navigation** `est:45m`
  - Why: The operator-facing browser surface — the events page must render the feed, follow live updates, support filtering, and provide navigation to and from the overview page.
  - Files: `packages/review-broker-dashboard/src/pages/events.astro`, `packages/review-broker-dashboard/src/components/events-client.ts`, `packages/review-broker-dashboard/src/pages/index.astro`, `packages/review-broker-dashboard/src/styles/dashboard.css`
  - Do: Create `events.astro` shell page with nav, script, and style imports. Create `events-client.ts` with: fetch `/api/events/feed`, render scrollable event list with event-type color coding, search/filter by event type, "load more" pagination via `before` cursor, and SSE-triggered live follow that prepends new events. Add a `<nav>` element to both `index.astro` and `events.astro` for page switching. Add event log CSS styles to `dashboard.css`.
  - Verify: `corepack pnpm --filter review-broker-dashboard build` succeeds; events page HTML exists in dist
  - Done when: The events page renders event entries, supports type filtering, and live-follows new events via SSE re-fetch

- [x] **T03: Contract, route, and integration tests for event feed** `est:40m`
  - Why: The slice is not done until verification proves schema validity, route behavior, redaction safety, and live update flow against a real broker runtime.
  - Files: `packages/review-broker-core/test/dashboard-contracts.test.ts`, `packages/review-broker-server/test/http-event-feed-routes.test.ts`, `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts`
  - Do: Add contract tests for `OperatorEventEntrySchema` and `EventFeedResponseSchema` (valid parse, strict rejection, nullable handling). Create `http-event-feed-routes.test.ts` with route tests for `/api/events/feed`: default listing, `limit` param, `before` cursor pagination, `eventType` filter, `hasMore` flag, and explicit redaction assertion (response must not contain `command`/`args`/`cwd`/`workspaceRoot` fields). Add integration tests to `broker-mounted-dashboard.integration.test.ts` exercising the event feed after real broker mutations.
  - Verify: `corepack pnpm --filter review-broker-core exec vitest run test/dashboard-contracts.test.ts` passes; `corepack pnpm --filter review-broker-server exec vitest run test/http-event-feed-routes.test.ts` passes; `corepack pnpm --filter review-broker-server exec vitest run test/broker-mounted-dashboard.integration.test.ts` passes
  - Done when: All contract, route, and integration tests pass with no failures

## Files Likely Touched

- `packages/review-broker-core/src/dashboard.ts`
- `packages/review-broker-core/src/dashboard.js`
- `packages/review-broker-core/src/dashboard.js.map`
- `packages/review-broker-core/test/dashboard-contracts.test.ts`
- `packages/review-broker-server/src/db/audit-repository.ts`
- `packages/review-broker-server/src/http/dashboard-routes.ts`
- `packages/review-broker-server/src/http/dashboard-server.ts`
- `packages/review-broker-server/test/http-event-feed-routes.test.ts`
- `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts`
- `packages/review-broker-dashboard/src/pages/events.astro`
- `packages/review-broker-dashboard/src/components/events-client.ts`
- `packages/review-broker-dashboard/src/pages/index.astro`
- `packages/review-broker-dashboard/src/styles/dashboard.css`
