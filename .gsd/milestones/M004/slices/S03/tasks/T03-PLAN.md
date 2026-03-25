---
estimated_steps: 3
estimated_files: 3
skills_used: []
---

# T03: Integration tests and build verification

**Slice:** S03 — Read-only review browser
**Milestone:** M004

## Description

Close the slice by proving the full stack works together: real SQLite-backed broker, real HTTP routes, real Astro build output, and real review data flowing through to the API and mounted pages. The integration tests exercise the review list and detail routes through the assembled stack, and verify the reviews page is served from the mounted dashboard.

## Steps

1. **Add integration tests to `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts`:**
   - Import `ReviewListResponseSchema` and `ReviewDetailResponseSchema` from `review-broker-core`. These are new schemas from T01.
   - Add test: **"review list returns reviews after creating reviews via broker service"** — create 2 reviews via `runtime.service.createReview()`, fetch `GET /api/reviews`, parse with `ReviewListResponseSchema`, assert `reviews.length === 2` and `hasMore === false`. Verify each review has expected `reviewId`, `title`, `status`.
   - Add test: **"review detail returns composite data with proposal, discussion, and redacted activity"** — create a review, add a discussion message via `runtime.service.addMessage()`, fetch `GET /api/reviews/<id>`, parse with `ReviewDetailResponseSchema`, assert: `review.reviewId` matches, `proposal.title` and `proposal.diff` are present, `discussion.length === 1` with expected body, `activity.length >= 1` (audit events from creation and message), and no entry in `activity` has a `metadata` field. Also stringify the entire response and assert absence of `"command"`, `"args"`, `"cwd"`, `"workspaceRoot"` — belt-and-suspenders redaction check.
   - Add test: **"review detail returns 404 for unknown review ID"** — fetch `GET /api/reviews/nonexistent-id`, assert status 404 and JSON body contains error message.
   - Add test: **"reviews page is served from mounted dashboard"** — fetch `GET /reviews/` from the dashboard server, assert status 200 and HTML body contains `reviews-root` or `Reviews` marker text.
   - Follow existing test patterns: temp dir, `startBroker`, `createDashboardRoutes`, `createDashboardServer`, cleanup in `finally`. Use `DASHBOARD_DIST_PATH` from `test-paths.ts`. Use `readFixture` for review diff content if a fixture exists, or inline a minimal diff string.

2. **Ensure `review-broker-core` exports are complete:**
   - Verify `packages/review-broker-core/src/index.ts` re-exports all new types via the existing `export * from './dashboard.js'` line (it should already cover new schemas since they're in `dashboard.ts`).
   - If the JS mirror (`src/index.js`) needs updating for the new exports, update it.
   - Run `corepack pnpm --filter review-broker-core build` to confirm clean build with new exports.

3. **Run all verification commands in sequence:**
   - `corepack pnpm --filter review-broker-core exec vitest run test/dashboard-contracts.test.ts` — all contract tests pass
   - `corepack pnpm --filter review-broker-server exec vitest run test/http-review-routes.test.ts` — all route tests pass
   - `corepack pnpm --filter review-broker-server exec vitest run test/broker-mounted-dashboard.integration.test.ts` — all integration tests pass (existing + new)
   - `corepack pnpm --filter review-broker-dashboard build` — produces 3 pages
   - `corepack pnpm --filter review-broker-core build` — clean build

## Must-Haves

- [ ] Integration test: review list returns schema-valid data after creating reviews
- [ ] Integration test: review detail returns composite data with redacted activity
- [ ] Integration test: 404 for unknown review ID
- [ ] Integration test: reviews page served from mounted dashboard
- [ ] All 4 verification suites pass (contract, route, integration, dashboard build)

## Verification

- `corepack pnpm --filter review-broker-server exec vitest run test/broker-mounted-dashboard.integration.test.ts` — all tests pass including 4 new review integration tests
- `corepack pnpm --filter review-broker-core exec vitest run test/dashboard-contracts.test.ts` — all tests pass
- `corepack pnpm --filter review-broker-server exec vitest run test/http-review-routes.test.ts` — all tests pass
- `corepack pnpm --filter review-broker-dashboard build` — 3 pages built
- `corepack pnpm --filter review-broker-core build` — clean build

## Inputs

- `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` — existing integration tests to extend
- `packages/review-broker-server/test/test-paths.ts` — shared test path constants
- `packages/review-broker-core/src/dashboard.ts` — new Zod schemas to import (from T01)
- `packages/review-broker-server/src/http/dashboard-routes.ts` — route handler with new methods (from T01)
- `packages/review-broker-server/src/http/dashboard-server.ts` — HTTP routes (from T01)
- `packages/review-broker-dashboard/src/pages/reviews.astro` — reviews page (from T02)

## Expected Output

- `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` — extended with 4 new review integration tests
- `packages/review-broker-core/src/index.ts` — verified complete re-exports (likely unchanged)
- `packages/review-broker-core/src/index.js` — verified JS mirror (likely unchanged)

## Observability Impact

- **New integration tests** exercise the full stack (SQLite → broker service → HTTP routes → dashboard mount) and validate schema compliance, redaction, error responses, and page serving — giving future agents concrete evidence of end-to-end health.
- **Belt-and-suspenders redaction check** in the detail integration test stringifies the entire API response and asserts absence of `"metadata"`, `"command"`, `"args"`, `"cwd"`, `"workspaceRoot"` — catches accidental leaks that unit tests might miss.
- **404 integration test** confirms the structured error JSON flows through the real HTTP stack, not just the mocked route handler.
- **Dashboard mount test** confirms the reviews page is actually served at `/reviews/` from the assembled broker server — catches Astro build or static mount regressions.
