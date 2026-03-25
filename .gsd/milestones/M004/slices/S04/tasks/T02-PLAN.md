---
estimated_steps: 4
estimated_files: 4
skills_used: []
---

# T02: Full suite verification, gap fixes, and milestone closeout

**Slice:** S04 — Integrated operator shell and real-runtime acceptance
**Milestone:** M004

## Description

Run every dashboard-related test suite together, fix any failures or regressions, browser-verify the assembled dashboard against a real running broker, and write the slice summary. This task closes S04 and proves M004's final acceptance criteria.

## Steps

1. **Run all dashboard test suites together** and record results:
   - `corepack pnpm --filter review-broker-core exec vitest run test/dashboard-contracts.test.ts` — 27 contract tests
   - `corepack pnpm --filter review-broker-server exec vitest run test/http-dashboard-routes.test.ts test/http-event-feed-routes.test.ts test/http-review-routes.test.ts` — 21 route tests
   - `corepack pnpm --filter review-broker-server exec vitest run test/broker-mounted-dashboard.integration.test.ts` — 12+ integration tests
   - `corepack pnpm --filter review-broker-server exec vitest run test/dashboard-acceptance.integration.test.ts` — T01's acceptance tests
   - `corepack pnpm --filter review-broker-server exec vitest run test/start-broker.smoke.test.ts` — 2 smoke tests
   Fix any failures found. The acceptance test from T01 is the most important signal — it exercises the cross-boundary assembly.

2. **Browser-verify the assembled dashboard** against a real running broker using `corepack pnpm broker:dashboard` or equivalent:
   - Overview page renders real review counts and connection badge shows CONNECTED
   - Events page renders audit events with live follow
   - Reviews page renders review list; clicking a review shows detail with proposal/discussion/activity
   - Navigation between all three pages works
   - This is UAT-style verification using the pi browser tools, confirming the actual browser rendering matches the test evidence.

3. **Fix any narrow gaps** discovered during the full suite run or browser verification. Likely candidates from prior slice summaries:
   - Any client type drift between Zod schemas and inline client types
   - Any SSE reconnect edge case not caught by integration tests
   - Any rendering issue visible only in the real browser
   Keep fixes minimal — this is a closer, not a feature slice.

4. **Write S04 summary** at `.gsd/milestones/M004/slices/S04/S04-SUMMARY.md` with:
   - What was delivered (acceptance test suite, any fixes)
   - Verification matrix (all suites with test counts and results)
   - Requirement coverage evidence (R011, R002, R005, R014, R010, R003)
   - Known limitations
   - Forward intelligence for M004 milestone closeout

## Must-Haves

- [ ] All dashboard test suites pass together (contracts + routes + integration + acceptance + smoke)
- [ ] Browser verification confirms all three pages render real data from one running broker
- [ ] S04 summary written with verification evidence and requirement coverage
- [ ] No regressions in any existing test suite

## Verification

- `corepack pnpm --filter review-broker-core exec vitest run test/dashboard-contracts.test.ts && corepack pnpm --filter review-broker-server exec vitest run` — full suite green
- Browser verification screenshots or assertions confirming dashboard renders correctly

## Inputs

- `packages/review-broker-server/test/dashboard-acceptance.integration.test.ts` — T01's acceptance test (must exist and pass)
- `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` — existing integration tests
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — smoke tests
- `packages/review-broker-core/test/dashboard-contracts.test.ts` — contract tests
- `packages/review-broker-server/test/http-dashboard-routes.test.ts` — overview route tests
- `packages/review-broker-server/test/http-event-feed-routes.test.ts` — event feed route tests
- `packages/review-broker-server/test/http-review-routes.test.ts` — review route tests

## Observability Impact

- **Signals validated (not new):** This task verifies rather than introduces observability. All existing dashboard signals — broker.started, broker.dashboard_ready structured events, SSE heartbeat/change events, snapshot version counter, HTTP status codes — are proven working through the full test suite run.
- **Inspection surface for future agents:** Run `corepack pnpm --filter review-broker-server exec vitest run` to exercise the entire server test surface. Individual suite results identify which layer failed (contract/route/integration/acceptance/smoke).
- **Failure visibility:** Test failures isolate to a specific surface (overview/events/reviews) and include Zod parse error paths for schema drift, HTTP status assertions for route failures, and `assertNoMetadataLeaks` for redaction regressions.

## Expected Output

- `.gsd/milestones/M004/slices/S04/S04-SUMMARY.md` — slice summary with full verification matrix
- `packages/review-broker-server/test/dashboard-acceptance.integration.test.ts` — potentially modified if gaps found
