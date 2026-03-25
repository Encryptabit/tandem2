---
id: T01
parent: S02
milestone: M004
provides:
  - OperatorEventEntrySchema and EventFeedResponseSchema contracts in review-broker-core
  - listGlobal() on AuditRepository with cursor/limit/filter support
  - projectOperatorEvent() redaction helper stripping raw metadata
  - getEventFeed() on DashboardRouteHandler returning EventFeedResponse
  - /api/events/feed GET route on dashboard HTTP server
key_files:
  - packages/review-broker-core/src/dashboard.ts
  - packages/review-broker-server/src/db/audit-repository.ts
  - packages/review-broker-server/src/http/dashboard-routes.ts
  - packages/review-broker-server/src/http/dashboard-server.ts
key_decisions:
  - listGlobal() caps at 201 internally (not 200) to allow getEventFeed() to probe limit+1 for hasMore detection
  - Redaction strips entire metadata object — only summary string is projected forward
patterns_established:
  - projectOperatorEvent() follows the same projection pattern as projectLatestReviewer() — explicit safe-field extraction, no pass-through
observability_surfaces:
  - GET /api/events/feed returns structured EventFeedResponse JSON with hasMore pagination flag
  - Supports ?eventType= filtering and ?before= cursor pagination
  - Empty events array for unknown event types (graceful empty result, not error)
duration: 25m
verification_result: passed
completed_at: 2026-03-25
blocker_discovered: false
---

# T01: Global event listing, redaction-safe contract, and event feed route

**Added OperatorEventEntrySchema/EventFeedResponseSchema contracts, listGlobal() on AuditRepository, redaction-safe projectOperatorEvent(), getEventFeed() on DashboardRouteHandler, and /api/events/feed HTTP route**

## What Happened

Added `OperatorEventEntrySchema` (strict Zod object with 9 safe fields) and `EventFeedResponseSchema` (events array + hasMore boolean) to `review-broker-core/src/dashboard.ts`, importing `AuditEventTypeSchema` from the contracts module.

Extended `AuditRepository` with `listGlobal(options?)` — a global event listing query supporting cursor-based pagination (`beforeId`), event-type filtering (`eventType`), and configurable limit (default 50, capped at 201 internally to support the +1 hasMore probe from the route handler).

Added `projectOperatorEvent()` as a redaction helper in `dashboard-routes.ts` that strips the entire raw `metadata` object and extracts only the `summary` string if present and non-empty. Fields like `command`, `args`, `cwd`, and `workspaceRoot` never appear in the projected output. Added `getEventFeed()` to `DashboardRouteHandler` which requests `limit+1` rows from `listGlobal()` to determine `hasMore`, then projects through `projectOperatorEvent()`.

Wired `/api/events/feed` GET route into `dashboard-server.ts` between the existing `/api/events` SSE route and the static asset handler, with query param parsing for `limit`, `before`, and `eventType`.

Rebuilt `review-broker-core` dist and updated checked-in JS mirrors.

## Verification

- `corepack pnpm --filter review-broker-core build` — passes, new schemas compile and export correctly
- `node -e "..."` export check — confirms `OperatorEventEntrySchema` and `EventFeedResponseSchema` are available from dist
- Existing `http-dashboard-routes.test.ts` — all 8 tests pass (no regressions)
- Smoke test: started broker, created review, fetched `/api/events/feed` — got 200 with valid `EventFeedResponse` JSON, 1 event with `review.created` type and summary, redaction check passed (no command/args/cwd/workspaceRoot/metadata fields), filtered query with nonexistent type returned empty array with hasMore:false

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm --filter review-broker-core build` | 0 | ✅ pass | 2.4s |
| 2 | `node -e "..." (export check)` | 0 | ✅ pass | <1s |
| 3 | `corepack pnpm --filter review-broker-server exec vitest run test/http-dashboard-routes.test.ts` | 0 | ✅ pass | 4.0s |
| 4 | Smoke test (start broker, create review, fetch /api/events/feed, verify shape + redaction) | 0 | ✅ pass | <2s |

## Diagnostics

- `curl http://localhost:<port>/api/events/feed` — returns the full event feed as JSON
- `curl http://localhost:<port>/api/events/feed?eventType=review.created` — filtered by event type
- `curl http://localhost:<port>/api/events/feed?before=<id>&limit=10` — cursor-based pagination
- Empty `events` array with `hasMore: false` when no events match (graceful, not error)
- HTTP 500 on internal errors (caught by dashboard-server's top-level try/catch)

## Deviations

- Task plan referenced `context.repositories.audit` but `AppContext` exposes repos directly as `context.audit` — fixed to match actual interface.
- `ListGlobalOptions` needed `| undefined` on optional properties due to `exactOptionalPropertyTypes: true` in tsconfig.
- `listGlobal` caps at 201 (not 200) to allow the route handler's +1 hasMore probe to work at max limit.

## Known Issues

None.

## Files Created/Modified

- `packages/review-broker-core/src/dashboard.ts` — added `OperatorEventEntrySchema`, `EventFeedResponseSchema`, and inferred type exports
- `packages/review-broker-core/src/dashboard.js` — regenerated JS mirror
- `packages/review-broker-core/src/dashboard.js.map` — regenerated sourcemap
- `packages/review-broker-server/src/db/audit-repository.ts` — added `ListGlobalOptions` interface and `listGlobal()` method
- `packages/review-broker-server/src/http/dashboard-routes.ts` — added `getEventFeed()`, `projectOperatorEvent()`, updated imports and interface
- `packages/review-broker-server/src/http/dashboard-server.ts` — added `/api/events/feed` GET route handler
- `.gsd/milestones/M004/slices/S02/S02-PLAN.md` — added failure-path verification check per pre-flight
