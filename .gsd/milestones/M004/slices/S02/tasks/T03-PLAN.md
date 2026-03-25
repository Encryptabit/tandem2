---
estimated_steps: 4
estimated_files: 3
skills_used: []
---

# T03: Contract, route, and integration tests for event feed

**Slice:** S02 — Live operator event/log surface
**Milestone:** M004

## Description

Write the test suite that proves the event feed backend and integration surface works correctly. This includes contract tests for the new Zod schemas, a dedicated route test file for `/api/events/feed` covering pagination/filtering/redaction, and integration tests that exercise the event feed after real broker mutations through the full HTTP stack.

The redaction assertion is the most important test in this slice: the response must never contain `command`, `args`, `cwd`, or `workspaceRoot` — even though the underlying `AuditEventRecord.metadata` stores them. The projection must strip these before the response reaches the wire.

## Steps

1. **Add contract tests to `packages/review-broker-core/test/dashboard-contracts.test.ts`:**
   - Add a new `describe('OperatorEventEntrySchema')` block with tests:
     - Parses a valid operator event entry with all fields populated
     - Parses with nullable fields set to null (`reviewId`, `actorId`, `statusFrom`, `statusTo`, `errorCode`, `summary`)
     - Rejects extra fields (strict mode)
     - Rejects missing required fields (`auditEventId`, `eventType`, `createdAt`)
   - Add a `describe('EventFeedResponseSchema')` block with tests:
     - Parses a valid response with events and hasMore
     - Parses an empty events array with hasMore false
     - Rejects extra fields

2. **Create `packages/review-broker-server/test/http-event-feed-routes.test.ts`:**
   - Follow the same test setup pattern as `http-dashboard-routes.test.ts`: create temp dir, start a broker, create dashboard routes and server, clean up in `afterEach`.
   - Import `EventFeedResponseSchema`, `OperatorEventEntrySchema` from `review-broker-core`.
   - Import `DASHBOARD_DIST_PATH`, `WORKTREE_ROOT`, `FIXTURE_PATH` from `./test-paths.js`.
   - Seed test data: create a review via `broker.createReview()`, then register a reviewer via `broker.registerReviewer()` — these produce audit events.
   - Tests:
     - `GET /api/events/feed returns events in reverse chronological order` — fetch, parse with `EventFeedResponseSchema`, verify events are newest-first by `auditEventId`.
     - `GET /api/events/feed respects limit param` — fetch with `?limit=1`, verify only 1 event returned and `hasMore` is true.
     - `GET /api/events/feed supports cursor pagination with before param` — fetch first page, then fetch with `?before=<oldestId>`, verify disjoint event sets.
     - `GET /api/events/feed filters by eventType` — fetch with `?eventType=review.created`, verify all returned events have that type.
     - `GET /api/events/feed returns empty array for unknown eventType` — fetch with a valid but non-matching type, verify empty events and hasMore false.
     - `GET /api/events/feed redacts metadata — no command, args, cwd, workspaceRoot` — register a reviewer (which appends `reviewer.spawned` with `command`/`args`/`cwd` in metadata), fetch the event feed, stringify the entire response body and assert it does NOT contain the raw command path, args values, or cwd/workspaceRoot paths. Also verify `summary` IS present when the source event had one.

3. **Add integration tests to `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts`:**
   - Add a new `describe('event feed integration')` or add tests to the existing describe block:
     - `event feed returns events after real broker mutations` — start broker, create a review, fetch `/api/events/feed`, verify at least one event with `eventType: 'review.created'` and valid schema.
     - `event feed pagination works across real broker activity` — create multiple reviews, fetch with limit=2, verify `hasMore` is true, fetch next page with `before` cursor, verify continuity.

4. **Run all test suites and confirm green:**
   - `corepack pnpm --filter review-broker-core exec vitest run test/dashboard-contracts.test.ts`
   - `corepack pnpm --filter review-broker-server exec vitest run test/http-event-feed-routes.test.ts`
   - `corepack pnpm --filter review-broker-server exec vitest run test/broker-mounted-dashboard.integration.test.ts`

## Must-Haves

- [ ] Contract tests for `OperatorEventEntrySchema` and `EventFeedResponseSchema` (valid parse, strict rejection, nullables)
- [ ] Route tests covering default listing, limit, cursor pagination, eventType filter, and hasMore semantics
- [ ] Explicit redaction test: response body must not contain raw `command`/`args`/`cwd`/`workspaceRoot` values from metadata
- [ ] Integration tests with real broker mutations proving event feed works end-to-end
- [ ] All three test suites pass

## Verification

- `corepack pnpm --filter review-broker-core exec vitest run test/dashboard-contracts.test.ts` — all tests pass
- `corepack pnpm --filter review-broker-server exec vitest run test/http-event-feed-routes.test.ts` — all tests pass
- `corepack pnpm --filter review-broker-server exec vitest run test/broker-mounted-dashboard.integration.test.ts` — all tests pass

## Inputs

- `packages/review-broker-core/src/dashboard.ts` — `OperatorEventEntrySchema`, `EventFeedResponseSchema` (from T01)
- `packages/review-broker-core/test/dashboard-contracts.test.ts` — existing contract test file to extend
- `packages/review-broker-server/src/http/dashboard-routes.ts` — `getEventFeed()` and `projectOperatorEvent()` (from T01)
- `packages/review-broker-server/src/http/dashboard-server.ts` — `/api/events/feed` route (from T01)
- `packages/review-broker-server/src/db/audit-repository.ts` — `listGlobal()` (from T01)
- `packages/review-broker-server/test/http-dashboard-routes.test.ts` — reference for route test patterns
- `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` — existing integration tests to extend
- `packages/review-broker-server/test/test-paths.ts` — shared test path helpers

## Expected Output

- `packages/review-broker-core/test/dashboard-contracts.test.ts` — extended with OperatorEventEntry and EventFeedResponse contract tests
- `packages/review-broker-server/test/http-event-feed-routes.test.ts` — new route test file with pagination, filtering, and redaction tests
- `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` — extended with event feed integration tests

## Observability Impact

This task adds test coverage, not runtime behavior, so no new runtime signals are introduced. The tests themselves serve as the observability surface:
- Contract tests validate that `OperatorEventEntrySchema` and `EventFeedResponseSchema` reject unexpected fields (including leaked metadata keys), providing a guardrail against future regressions in the redaction contract.
- The explicit redaction test (`http-event-feed-routes.test.ts`) stringifies the full HTTP response and asserts no `command`, `args`, `cwd`, `workspaceRoot`, or `metadata` keys are present — this is the primary safety net for the event feed's security-relevant redaction behavior.
- Integration tests verify the event feed works end-to-end after real broker mutations, catching issues that unit-level tests might miss (DB schema drift, route wiring, projection errors).
