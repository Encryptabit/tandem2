---
estimated_steps: 5
estimated_files: 7
skills_used: []
---

# T01: Global event listing, redaction-safe contract, and event feed route

**Slice:** S02 — Live operator event/log surface
**Milestone:** M004

## Description

Build the backend seam for the operator event feed. This adds the shared `OperatorEventEntrySchema` and `EventFeedResponseSchema` contracts to `review-broker-core`, extends `AuditRepository` with a global event listing method, adds a redaction-safe projection function and `getEventFeed()` method to `DashboardRouteHandler`, and wires the `/api/events/feed` GET route into the dashboard HTTP server.

The redaction rule is strict: the response must never expose raw `metadata` blobs. Only explicitly safe fields are projected. The `summary` string from metadata (already human-authored in every `audit.append` call) is the only metadata value carried forward. Fields like `command`, `args`, `cwd`, and `workspaceRoot` must never appear in the response.

## Steps

1. **Add `OperatorEventEntrySchema` and `EventFeedResponseSchema` to `packages/review-broker-core/src/dashboard.ts`:**
   - `OperatorEventEntrySchema` is a strict Zod object with fields: `auditEventId` (positive int), `reviewId` (string min 1, nullable), `eventType` (use `AuditEventTypeSchema` from `contracts.js`), `actorId` (string min 1, nullable), `statusFrom` (`ReviewStatusSchema.nullable()`), `statusTo` (`ReviewStatusSchema.nullable()`), `errorCode` (string min 1, nullable), `summary` (string, nullable), `createdAt` (`IsoDateTimeSchema`).
   - `EventFeedResponseSchema` is a strict Zod object with `events` (array of `OperatorEventEntrySchema`) and `hasMore` (boolean).
   - Export inferred types: `OperatorEventEntry`, `EventFeedResponse`.
   - Import `AuditEventTypeSchema` from `./contracts.js` (it's already imported in the file for other schemas — check existing imports).

2. **Rebuild `review-broker-core` JS mirrors and dist:**
   - Run `corepack pnpm --filter review-broker-core build` to regenerate `dist/`.
   - Regenerate the checked-in `src/dashboard.js` and `src/dashboard.js.map` (use `npx tsc --project packages/review-broker-core/tsconfig.json` or the package build command, then copy the generated JS to match the existing mirror pattern).

3. **Add `listGlobal(options)` to `AuditRepository` in `packages/review-broker-server/src/db/audit-repository.ts`:**
   - Interface: `listGlobal(options?: ListGlobalOptions): AuditEventRecord[]`
   - `ListGlobalOptions`: `{ limit?: number; beforeId?: number; eventType?: string }`
   - Default limit: 50, max: 200. Clamp in implementation.
   - Query: `SELECT ... FROM audit_events WHERE (audit_event_id < @beforeId OR @beforeId IS NULL) AND (event_type = @eventType OR @eventType IS NULL) ORDER BY created_at DESC, audit_event_id DESC LIMIT @limit`
   - Return mapped `AuditEventRecord[]` using the existing `mapAuditEventRow` helper.
   - Add `listGlobal` to the `AuditRepository` interface definition.

4. **Add `projectOperatorEvent()` redaction helper and `getEventFeed()` to `DashboardRouteHandler` in `packages/review-broker-server/src/http/dashboard-routes.ts`:**
   - `projectOperatorEvent(record: AuditEventRecord): OperatorEventEntry` — extracts only the safe fields from an `AuditEventRecord`. The `summary` is extracted from `record.metadata.summary` if it's a non-empty string, otherwise null. No other metadata fields are carried.
   - Add `getEventFeed(options)` to the `DashboardRouteHandler` interface: `getEventFeed: (options: { limit?: number; beforeId?: number; eventType?: string }) => EventFeedResponse`
   - Implementation: call `context.repositories.audit.listGlobal(options)` with limit clamped to 1–200 (default 50), request limit+1 rows to determine `hasMore`, then project each record through `projectOperatorEvent()`.
   - Import `OperatorEventEntry`, `EventFeedResponse` from `review-broker-core`.
   - Import `AuditEventRecord` from the audit repository.

5. **Wire `/api/events/feed` GET route into `packages/review-broker-server/src/http/dashboard-server.ts`:**
   - Add a handler for `pathname === '/api/events/feed' && req.method === 'GET'` in the request handler, placed after the existing `/api/overview` and `/api/events` routes.
   - Parse query params from `url.searchParams`: `limit` (parseInt, optional), `before` (parseInt, optional → `beforeId`), `eventType` (string, optional).
   - Call `routes.getEventFeed({ limit, beforeId, eventType })`.
   - Return 200 JSON response with `Content-Type: application/json` and `Cache-Control: no-cache`.

## Must-Haves

- [ ] `OperatorEventEntrySchema` and `EventFeedResponseSchema` defined as strict Zod schemas in `review-broker-core/src/dashboard.ts`
- [ ] `listGlobal(options)` method on `AuditRepository` with cursor/limit/filter support
- [ ] `projectOperatorEvent()` strips all metadata — only `summary` is carried from metadata, no `command`/`args`/`cwd`/`workspaceRoot`
- [ ] `getEventFeed()` on `DashboardRouteHandler` returns `EventFeedResponse` with correct `hasMore` flag
- [ ] `/api/events/feed` route wired in dashboard-server.ts and returns valid JSON
- [ ] `review-broker-core` dist and JS mirrors rebuilt

## Verification

- `corepack pnpm --filter review-broker-core build` succeeds without errors
- Manually verify the new exports are available: `node -e "const d = require('./packages/review-broker-core/dist/dashboard.js'); console.log(Object.keys(d).filter(k => k.includes('Event')))"` from the worktree root
- Write a quick smoke check: start a broker with the new route handler, call `/api/events/feed`, confirm 200 response with valid JSON shape

## Observability Impact

- Signals added: `GET /api/events/feed` returns structured `EventFeedResponse` JSON — the first global event inspection surface
- How a future agent inspects this: `curl http://localhost:<port>/api/events/feed` returns the event feed; add `?eventType=review.created` for filtering, `?before=<id>` for pagination
- Failure state exposed: HTTP 500 on internal errors; empty `events` array when no events match

## Inputs

- `packages/review-broker-core/src/dashboard.ts` — existing dashboard contract schemas to extend
- `packages/review-broker-core/src/contracts.ts` — `AuditEventTypeSchema`, `IsoDateTimeSchema`, `ReviewStatusSchema` imports
- `packages/review-broker-server/src/db/audit-repository.ts` — existing `AuditRepository` interface and `mapAuditEventRow` to extend
- `packages/review-broker-server/src/http/dashboard-routes.ts` — existing `DashboardRouteHandler` and projection helpers to extend
- `packages/review-broker-server/src/http/dashboard-server.ts` — existing HTTP server request handler to add new route

## Expected Output

- `packages/review-broker-core/src/dashboard.ts` — extended with `OperatorEventEntrySchema`, `EventFeedResponseSchema`, and type exports
- `packages/review-broker-core/src/dashboard.js` — regenerated JS mirror
- `packages/review-broker-core/src/dashboard.js.map` — regenerated sourcemap
- `packages/review-broker-server/src/db/audit-repository.ts` — extended with `listGlobal()` method and `ListGlobalOptions` interface
- `packages/review-broker-server/src/http/dashboard-routes.ts` — extended with `getEventFeed()`, `projectOperatorEvent()`, and updated interface
- `packages/review-broker-server/src/http/dashboard-server.ts` — extended with `/api/events/feed` route handler
