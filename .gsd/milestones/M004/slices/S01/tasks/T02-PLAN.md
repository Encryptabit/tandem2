---
estimated_steps: 4
estimated_files: 8
skills_used:
  - gsd
  - frontend-design
  - agent-browser
  - test
---

# T02: Render the live overview, reviewer, and startup-recovery panels as a thin dashboard client

**Slice:** S01 — Broker-mounted dashboard and live overview
**Milestone:** M004

## Description

Turn the mounted shell into the real S01 operator surface. This task should render broker-backed overview cards, reviewer state, and startup-recovery context in Astro while keeping the browser thin: fetch snapshots for truth, use SSE only to decide when to re-fetch, and expose clear loading/error/reconnect state.

## Steps

1. Expand `packages/review-broker-dashboard/src/pages/index.astro` into the actual overview page structure and add the small Astro/client files needed for cards, reviewer/recovery summaries, and styling.
2. Project the authoritative overview payload from existing broker seams in `packages/review-broker-server/src/http/dashboard-routes.ts` and `packages/review-broker-server/src/index.ts`, reusing `inspectBrokerRuntime()` and startup-recovery state instead of inventing a dashboard-only store.
3. Implement browser-side fetch plus SSE-triggered re-fetch in `packages/review-broker-dashboard/src/components/overview-client.ts`, including loading, stale/reconnecting, and error states that make refresh failures inspectable.
4. Extend `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` so a real broker runtime and SQLite file prove the overview route, mounted page, and change-notification loop stay aligned after a real review or reviewer mutation.

## Must-Haves

- [ ] The overview page renders real review counts, reviewer state, and startup-recovery context from the broker snapshot route.
- [ ] Browser state stays snapshot-first: SSE only triggers re-fetch and does not become the durable source of truth.
- [ ] Loading, refresh failure, and reconnect state are visible in the UI so a future operator can tell when the dashboard is stale.

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M004 exec vitest run packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M004 --filter review-broker-dashboard build`
- Browser-check the broker-served local dashboard URL and confirm the overview refreshes after a real create-review or reviewer-state mutation without a manual page reload.

## Observability Impact

- Signals added/changed: the browser now surfaces last refresh, reconnect/error state, and broker-projected reviewer/startup-recovery context.
- How a future agent inspects this: compare the mounted page, the overview JSON route, and the SSE stream while reproducing a broker mutation in the integration test or live browser session.
- Failure state exposed: failed fetches, missed refreshes, or stale UI after reconnect become visible in both the UI state and the integration test expectations.

## Inputs

- `.gsd/milestones/M004/slices/S01/S01-PLAN.md` — slice demo and thin-client constraints.
- `.gsd/milestones/M004/slices/S01/tasks/T01-PLAN.md` — mounted delivery contract and file ownership from the first task.
- `packages/review-broker-dashboard/src/pages/index.astro` — mounted shell page to turn into the overview surface.
- `packages/review-broker-core/src/dashboard.ts` — shared overview snapshot and SSE schemas from T01.
- `packages/review-broker-server/src/index.ts` — runtime inspection and startup-recovery seams to project into the overview snapshot.
- `packages/review-broker-server/src/http/dashboard-routes.ts` — broker-owned route layer that will serve the overview payload.
- `packages/review-broker-server/test/http-dashboard-routes.test.ts` — route proof that should stay aligned while the UI is added.

## Expected Output

- `packages/review-broker-dashboard/src/pages/index.astro` — mounted overview page wired to broker-owned data.
- `packages/review-broker-dashboard/src/components/overview-client.ts` — client refresh logic that re-fetches snapshots after SSE notifications.
- `packages/review-broker-dashboard/src/components/OverviewCards.astro` — overview card rendering for counts and latest-state summaries.
- `packages/review-broker-dashboard/src/components/ReviewerSummary.astro` — reviewer/startup-recovery panel rendering.
- `packages/review-broker-dashboard/src/styles/dashboard.css` — operator-facing dashboard styling.
- `packages/review-broker-server/src/http/dashboard-routes.ts` — overview projection updates needed by the UI.
- `packages/review-broker-server/src/index.ts` — any narrow export/projection support needed for the overview payload.
- `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` — real-runtime proof that overview rendering and refresh stay aligned with broker truth.
