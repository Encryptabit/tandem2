# S02 Research: Live operator event/log surface

**Depth:** Targeted — known technology (Astro static build, SSE, SQLite), known codebase patterns from S01, but new backend seam (global audit event listing) and new client module. The main uncertainty is redaction policy for audit metadata and the global event feed contract shape, not the delivery architecture.

## Summary

S02 adds the first dashboard surface where operators can watch broker activity as a live, redaction-safe event stream without falling back to CLI or raw SQLite. The backend work is straightforward: the audit_events table already stores structured event data from every broker mutation, but the `AuditRepository` currently only supports review-scoped queries (`listForReview`, `listActivityForReview`, `getLatestForReview`). S02 adds a global event listing method, a redaction-safe projection layer, a new `/api/events/feed` HTTP route, and a client-rendered log/event page that follows and filters the feed.

The delivery architecture is fully proven from S01 — broker-owned HTTP server, Astro static build, client-rendered pages, SSE-triggered re-fetch. The only new moving parts are the global query, the projection/redaction, and the browser log view.

## Requirement Coverage

- **R010** (primary): Make broker audit events, reviewer state, and failure signals inspectable in a browser.
- **R011** (supports): Extends the operator dashboard with a second useful surface.
- **R005** (strengthens): Reviewer state and failure context visible through event feed with redaction safety.

## Recommendation

Three tasks, building bottom-up:

1. **Backend: global event listing + redaction-safe dashboard event contract** — Add `listGlobal(options)` to `AuditRepository` with cursor-based pagination, define an `OperatorEventEntry` schema in `review-broker-core/src/dashboard.ts`, build a projection function that redacts sensitive metadata fields (`command`, `args`, `cwd`, `workspaceRoot`), and add a `/api/events/feed` route to the `DashboardRouteHandler`.

2. **Client: event log page with live follow** — Add `src/pages/events.astro` as a second Astro page with its own client module (`events-client.ts`), render a scrollable event list with live-follow (SSE-triggered re-fetch appending new events), search/filter by event type, and event-type color coding. Add a nav element to both pages for switching between overview and events.

3. **Verification: route tests, integration tests, and browser verification** — Contract tests for the new schema, route tests for `/api/events/feed` with pagination/filtering, integration test with real mutations, and browser verification showing live events appear without page reload.

## Implementation Landscape

### What exists

**Audit events table** (`001_init.sql`):
```sql
CREATE TABLE audit_events (
  audit_event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id TEXT,
  event_type TEXT NOT NULL,
  actor_id TEXT,
  status_from TEXT,
  status_to TEXT,
  error_code TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_events_review_created_at ON audit_events(review_id, created_at DESC);
```

The existing index is `(review_id, created_at DESC)` — good for review-scoped queries but not optimal for a global time-ordered listing. A global listing needs to order by `(created_at DESC, audit_event_id DESC)` and optionally filter by `event_type`. SQLite will table-scan for global queries but this is fine for operator-scale data volumes (hundreds to low thousands of events). A new index is not required unless profiling shows a problem.

**AuditRepository** (`packages/review-broker-server/src/db/audit-repository.ts`):
- `append(input)` — inserts and returns the record
- `listForReview(reviewId)` — all events for one review, time-ascending
- `listActivityForReview(reviewId, options?)` — same but mapped through `ReviewActivityEntrySchema` with limit support
- `getLatestForReview(reviewId)` — most recent event for one review

Missing: any global listing method. S02 adds `listGlobal(options)` with `limit`, `beforeId` (cursor), and optional `eventType` filter.

**17 audit event types** (from `domain.ts`):
- Review lifecycle: `review.created`, `review.claimed`, `review.reclaimed`, `review.submitted`, `review.changes_requested`, `review.approved`, `review.requeued`, `review.closed`
- Review detail: `review.message_added`, `review.counter_patch_accepted`, `review.counter_patch_rejected`, `review.transition_rejected`, `review.diff_rejected`
- Reviewer lifecycle: `reviewer.spawned`, `reviewer.spawn_failed`, `reviewer.killed`, `reviewer.offline`

**Metadata fields needing redaction** (from broker-service.ts and reviewer-manager.ts audit appends):
- `command` — full filesystem path of reviewer process (e.g. `/usr/bin/node`). Redact to basename.
- `args` — process arguments, may contain paths. Redact entirely or replace with argument count.
- `cwd` — working directory path. Redact entirely.
- `workspaceRoot` — filesystem path of the broker workspace. Redact entirely.
- `pid` — process ID. Safe to keep (transient, not sensitive).
- `reviewerId`, `reviewId`, `actorId`, `summary`, `claimGeneration`, `exitCode`, `exitSignal`, `offlineReason`, `reclaimCause`, `outcome`, `errorCode` — all safe to expose.

**S01 infrastructure to reuse**:
- `DashboardRouteHandler` interface in `dashboard-routes.ts` — add `getEventFeed(options)` method
- `createDashboardServer` in `dashboard-server.ts` — add `/api/events/feed` route handler
- SSE broadcast via `routes.onBroadcast` — already sends `change` events on all four notification topics; the events page can use the same SSE connection, listening for `change` events to trigger a re-fetch of the event feed
- `overview-client.ts` patterns: fetch → render → SSE-triggered re-fetch, connection state management, `escapeHtml`, `formatTime`
- `dashboard.css` — all panel/card/detail-row/status-dot styles
- `test-paths.ts` shared test helpers

**Astro routing**: Static output mode with file-based routing. Adding `src/pages/events.astro` produces `dist/events/index.html`, served by the existing static asset handler at path `/events/` or `/events`.

### Dashboard event contract shape

The new `OperatorEventEntry` in `review-broker-core/src/dashboard.ts`:

```typescript
// Already exists as reference:
// ReviewActivityEntrySchema has: auditEventId, reviewId, eventType, actorId,
//   statusFrom, statusTo, errorCode, summary, metadata, createdAt

// New dashboard-safe projection:
OperatorEventEntrySchema = z.object({
  auditEventId: z.number().int().positive(),
  reviewId: z.string().min(1).nullable(),
  eventType: AuditEventTypeSchema,
  actorId: z.string().min(1).nullable(),
  statusFrom: ReviewStatusSchema.nullable(),
  statusTo: ReviewStatusSchema.nullable(),
  errorCode: z.string().min(1).nullable(),
  summary: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
});
```

Note: `metadata` is intentionally excluded from the dashboard contract. The `summary` field (already present in most audit appends) gives operators the human-readable context. Raw metadata carries too many redaction-risky fields to expose as a generic blob. If specific metadata values are needed (e.g. `exitCode`), they should be projected as named fields.

### Event feed route contract

```
GET /api/events/feed?limit=50&before=123&eventType=review.created
```

Response: `{ events: OperatorEventEntry[], hasMore: boolean }`

- `limit` — max events to return (default 50, max 200)
- `before` — cursor: return events with `audit_event_id < before` (for pagination)
- `eventType` — optional filter, must be a valid `AuditEventType`
- Events are returned in reverse chronological order (newest first)
- `hasMore` — true if more events exist before the oldest returned event

### Live follow behavior

The events page uses the same SSE `/api/events` connection as the overview page. On any `change` event, the client re-fetches `/api/events/feed` without a `before` cursor (latest events). New events not already in the rendered list are prepended. This is the same "SSE is notification, snapshot is truth" model from S01.

### Navigation

Both pages need a simple nav bar or tab row. Add a `<nav>` element to the header in both `index.astro` and `events.astro`. Since these are separate static HTML pages (not a SPA), navigation is standard `<a>` links.

### Redaction approach

A `projectOperatorEvent(record: AuditEventRecord): OperatorEventEntry` function in `dashboard-routes.ts` (next to the existing overview projection helpers). It strips metadata entirely and surfaces only the explicitly safe fields. The `summary` field from metadata is the only carried-forward string — it's already human-authored in every `audit.append` call.

### What's not needed

- **New SSE topics or event types**: The existing four notification topics already cover all audit-generating mutations. No new SSE plumbing needed.
- **New database migration**: The audit_events table schema is sufficient. Global queries work without a new index at operator scale.
- **Raw subprocess log capture**: The roadmap explicitly notes `stdio: 'ignore'` on reviewer subprocesses. S02 should not attempt to capture raw reviewer stdout/stderr — it surfaces structured broker-owned audit events only.
- **Infinite scroll / virtualization**: At operator scale (< 1000 events in a typical session), a simple paginated list with "load more" is sufficient.

### File changes summary

**New files:**
- `packages/review-broker-dashboard/src/pages/events.astro` — event log page shell
- `packages/review-broker-dashboard/src/components/events-client.ts` — client-side fetch, render, filter, live follow
- `packages/review-broker-server/test/http-event-feed-routes.test.ts` — route-level tests

**Modified files:**
- `packages/review-broker-core/src/dashboard.ts` — add `OperatorEventEntrySchema`, `EventFeedResponseSchema`
- `packages/review-broker-core/src/dashboard.js` + `.js.map` — regenerated JS mirror
- `packages/review-broker-server/src/db/audit-repository.ts` — add `listGlobal(options)` method
- `packages/review-broker-server/src/http/dashboard-routes.ts` — add `getEventFeed()`, projection helper, redaction logic
- `packages/review-broker-server/src/http/dashboard-server.ts` — add `/api/events/feed` route
- `packages/review-broker-dashboard/src/pages/index.astro` — add nav element
- `packages/review-broker-dashboard/src/styles/dashboard.css` — add event log styles (event rows, filter controls, live-follow indicator)
- `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` — add event feed integration tests
- `packages/review-broker-core/test/dashboard-contracts.test.ts` — add contract tests for new schemas

### Verification strategy

1. **Contract tests**: `OperatorEventEntrySchema` and `EventFeedResponseSchema` parse correctly, reject extra fields, handle nullables.
2. **Route tests**: `/api/events/feed` returns valid responses, respects `limit`/`before`/`eventType` params, returns `hasMore` correctly, and redacts metadata (no `command`/`args`/`cwd`/`workspaceRoot` in response).
3. **Integration tests**: Start a real broker, perform mutations (create review, spawn reviewer), fetch `/api/events/feed`, verify events appear in correct order with correct redaction.
4. **Browser verification**: Navigate to `/events`, confirm event list renders, trigger a broker mutation, confirm new event appears without page reload.

### Build/rebuild note

After modifying `packages/review-broker-core/src/dashboard.ts`, the checked-in JS mirrors (`dashboard.js`, `dashboard.js.map`) and the `dist/` output must be regenerated before `review-broker-server` tests can import the new exports. Run `pnpm --filter review-broker-core build` and update the JS mirrors. This is the same pattern from S01 — see KNOWLEDGE entry about stale JS shadows.
