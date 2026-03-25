# S01: Broker-mounted dashboard and live overview

**Goal:** Restore a broker-served dashboard entrypoint that the broker process itself mounts and that exposes a thin browser overview over real broker/runtime state.
**Demo:** Start one real broker with SQLite-backed state, open the broker-served dashboard in a browser, and watch overview cards plus reviewer/startup-recovery panels render broker-backed state and refresh after a real broker mutation without page reload.

## Requirement Focus

This slice directly advances Active requirement **R011** by restoring the operator dashboard as a thin client over broker state. It also strengthens **R002**, **R003**, and **R005** by sharing typed contracts with the existing broker domain model, reading truth from the real SQLite-backed runtime, and surfacing reviewer/recovery state through broker-owned browser routes. The slice must preserve **R006** and **R007** by keeping the browser on broker-owned HTTP JSON/SSE seams instead of inventing a second frontend store or routing runtime behavior through MCP.

## Decomposition Rationale

The highest-risk gap is not card styling. It is whether this repo can mount and serve a real dashboard from the broker process at all while keeping the broker as the only source of truth. The first task therefore establishes the mounted delivery seam, shared overview contracts, and broker-owned HTTP/SSE routes together so execution proves the hard architectural path immediately.

Once the broker can serve a real dashboard shell, the next risk is truth alignment. The overview UI must not treat SSE as durable state because the existing notification bus is runtime-local. The second task therefore focuses on the thin Astro overview surface itself: it should read authoritative snapshot routes, use SSE only to trigger re-fetch, and make reviewer/recovery context visible without adding a browser-owned store.

The final task closes the slice at the proof level the roadmap asks for. Mounted delivery and UI rendering are not enough unless the real broker, SQLite state, and browser surface are exercised together under live mutation and reconnect-style refresh. That task packages the entrypoints, integration coverage, and browser proof so later slices can build on one trustworthy mounted dashboard foundation.

## Must-Haves

- The broker process must own the HTTP listener and mounted dashboard entrypoint; no second app server or MCP-backed browser path is introduced.
- Overview snapshot and live-update contracts must live in shared typed broker code so the browser reuses canonical domain vocabulary instead of inventing dashboard-only DTOs.
- The browser must treat broker snapshot routes as authoritative truth and use SSE only as liveness/change notification that triggers re-fetch.
- The S01 demo must show real review counts, reviewer state, and startup-recovery context from a real SQLite-backed broker, then visibly refresh after a real broker mutation.

## Proof Level

- This slice proves: integration
- Real runtime required: yes
- Human/UAT required: no

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M004 exec vitest run packages/review-broker-core/test/dashboard-contracts.test.ts packages/review-broker-server/test/http-dashboard-routes.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M004 exec vitest run packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M004 --filter review-broker-dashboard build && corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M004 --filter review-broker-core build && corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M004 --filter review-broker-server build`
- Browser verification against the broker-served local URL shows overview cards and reviewer/startup-recovery panels render real data and refresh after a real create-review or reviewer-state mutation without reloading the page.
- Route tests must verify failure-path responses: 404 for unknown static paths, explicit loading/error connection states in the dashboard shell, and SSE payloads that contain only topic/version (never leaked state data).

## Observability / Diagnostics

- Runtime signals: broker-owned overview snapshot versions, SSE topic/version notifications, startup-recovery summary payloads, and latest audit/reviewer projections exposed to the browser.
- Inspection surfaces: broker HTTP JSON routes, broker SSE stream, the browser overview status/refresh state, and the existing `start-broker.ts --once` snapshot surface for comparison.
- Failure visibility: the dashboard should make stale or failed refresh visible through explicit loading/error/reconnect state rather than silently drifting; route/integration tests must also show which topic/version changed.
- Redaction constraints: browser payloads may expose counts, review IDs, reviewer IDs, statuses, timestamps, offline reasons, and command basenames, but must not expose raw diff bodies, raw reviewer argv, or secrets.

## Integration Closure

- Upstream surfaces consumed: `packages/review-broker-server/src/index.ts`, `packages/review-broker-server/src/runtime/broker-service.ts`, `packages/review-broker-server/src/runtime/app-context.ts`, `packages/review-broker-core/src/contracts.ts`, `packages/review-broker-core/src/domain.ts`, and `packages/review-broker-core/src/notifications.ts`.
- New wiring introduced in this slice: a broker HTTP listener, mounted Astro dashboard package, broker-owned overview snapshot/SSE routes, and browser-side re-fetch logic driven by broker notifications.
- What remains before the milestone is truly usable end-to-end: S02 still needs the redaction-safe live operator event/log surface, S03 still needs read-only review browsing, and S04 still needs assembled reconnect/reload acceptance across the full operator shell.

## Tasks

- [x] **T01: Mount an Astro dashboard shell inside the broker HTTP surface** `est:2h`
  - Why: The largest S01 risk is delivery architecture, so the first increment must prove the broker can own the browser entrypoint and its typed overview transport instead of deferring that seam behind isolated frontend scaffolding.
  - Files: `packages/review-broker-dashboard/package.json`, `packages/review-broker-dashboard/astro.config.mjs`, `packages/review-broker-dashboard/src/pages/index.astro`, `packages/review-broker-core/src/dashboard.ts`, `packages/review-broker-core/src/index.ts`, `packages/review-broker-core/test/dashboard-contracts.test.ts`, `packages/review-broker-server/src/http/dashboard-server.ts`, `packages/review-broker-server/src/http/dashboard-routes.ts`, `packages/review-broker-server/test/http-dashboard-routes.test.ts`
  - Do: Create the new Astro dashboard package with a minimal broker-served shell, define shared overview snapshot and SSE schemas in `review-broker-core`, implement a broker-owned HTTP listener plus mounted asset/route handling in `review-broker-server`, and keep the browser transport strictly broker-owned JSON plus SSE notification signals rather than in-process client calls or MCP.
  - Verify: `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M004 exec vitest run packages/review-broker-core/test/dashboard-contracts.test.ts packages/review-broker-server/test/http-dashboard-routes.test.ts`
  - Done when: a real broker process can serve the dashboard root and the typed overview/SSE route contracts are shared from `review-broker-core` and exercised by route tests.
- [x] **T02: Render the live overview, reviewer, and startup-recovery panels as a thin dashboard client** `est:2h`
  - Why: After the mount exists, S01 only becomes trustworthy if the browser surface actually renders broker truth and re-syncs from snapshots instead of inventing a frontend-owned state model.
  - Files: `packages/review-broker-dashboard/src/pages/index.astro`, `packages/review-broker-dashboard/src/components/overview-client.ts`, `packages/review-broker-dashboard/src/components/OverviewCards.astro`, `packages/review-broker-dashboard/src/components/ReviewerSummary.astro`, `packages/review-broker-dashboard/src/styles/dashboard.css`, `packages/review-broker-server/src/http/dashboard-routes.ts`, `packages/review-broker-server/src/index.ts`, `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts`
  - Do: Project the real broker/runtime/startup-recovery state into the overview route, implement dashboard UI panels for counts, reviewer state, startup recovery, and latest activity, wire browser fetch plus SSE-triggered re-fetch with explicit loading/error/reconnect states, and keep snapshots authoritative while using SSE only to decide when to refresh.
  - Verify: `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M004 exec vitest run packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts`
  - Done when: the mounted dashboard visibly renders real overview and reviewer/recovery data from the broker snapshot route and can refresh that state after a broker-owned change notification.
- [x] **T03: Package the real-runtime dashboard proof and operator entrypoints** `est:1h30m`
  - Why: S01 is not complete when the page exists; it is complete when a future agent can rerun one supported proof showing the broker-served dashboard stays coherent through real runtime changes and startup-recovery state.
  - Files: `package.json`, `packages/review-broker-server/package.json`, `packages/review-broker-server/src/cli/start-broker.ts`, `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts`, `packages/review-broker-server/test/start-broker.smoke.test.ts`, `packages/review-broker-server/test/test-paths.ts`
  - Do: Add stable repo/package scripts or flags for starting the broker with the dashboard HTTP surface, extend the integration/smoke harnesses to cover absolute SQLite paths plus HTTP startup, and capture the live-mutation/browser-proof flow that later slices can reuse without rebuilding ad hoc commands.
  - Verify: `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M004 exec vitest run packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts && corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M004 --filter review-broker-dashboard build`
  - Done when: the repo exposes one repeatable broker-served dashboard proof path and the live overview demo can be rerun against a real SQLite-backed broker without guessing scripts or ports.

## Files Likely Touched

- `package.json`
- `pnpm-lock.yaml`
- `packages/review-broker-core/src/dashboard.ts`
- `packages/review-broker-core/src/index.ts`
- `packages/review-broker-core/test/dashboard-contracts.test.ts`
- `packages/review-broker-server/src/index.ts`
- `packages/review-broker-server/src/cli/start-broker.ts`
- `packages/review-broker-server/src/http/dashboard-server.ts`
- `packages/review-broker-server/src/http/dashboard-routes.ts`
- `packages/review-broker-server/test/http-dashboard-routes.test.ts`
- `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts`
- `packages/review-broker-server/test/start-broker.smoke.test.ts`
- `packages/review-broker-server/test/test-paths.ts`
- `packages/review-broker-dashboard/package.json`
- `packages/review-broker-dashboard/astro.config.mjs`
- `packages/review-broker-dashboard/tsconfig.json`
- `packages/review-broker-dashboard/src/pages/index.astro`
- `packages/review-broker-dashboard/src/components/overview-client.ts`
- `packages/review-broker-dashboard/src/components/OverviewCards.astro`
- `packages/review-broker-dashboard/src/components/ReviewerSummary.astro`
- `packages/review-broker-dashboard/src/styles/dashboard.css`
