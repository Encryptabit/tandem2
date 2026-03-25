---
estimated_steps: 4
estimated_files: 9
skills_used:
  - gsd
  - test
  - debug-like-expert
---

# T01: Mount an Astro dashboard shell inside the broker HTTP surface

**Slice:** S01 — Broker-mounted dashboard and live overview
**Milestone:** M004

## Description

Prove the risky delivery seam first. This task should create the mounted dashboard package, define the shared overview transport contract, and teach the broker to serve the dashboard root plus broker-owned overview/SSE routes from the same runtime process.

## Steps

1. Create the new `packages/review-broker-dashboard` Astro package with the minimum config and shell page needed for the broker to mount a real browser entrypoint instead of a placeholder string response.
2. Define the shared dashboard transport schemas in `packages/review-broker-core/src/dashboard.ts`, export them from `packages/review-broker-core/src/index.ts`, add `packages/review-broker-core/test/dashboard-contracts.test.ts`, and regenerate the checked-in `src/*.js` mirrors plus `dist/` exports that downstream runtime code loads.
3. Add a broker-owned HTTP layer in `packages/review-broker-server/src/http/dashboard-server.ts` and `packages/review-broker-server/src/http/dashboard-routes.ts` that serves the dashboard root, an overview snapshot JSON route, and an SSE route carrying topic/version change notifications only.
4. Cover the mounted route contract with `packages/review-broker-server/test/http-dashboard-routes.test.ts`, including startup-recovery projection, broker-owned asset delivery, and the rule that SSE is a re-sync signal rather than durable truth.

## Must-Haves

- [ ] The broker process, not a second app server, serves the dashboard root and the broker-owned overview/SSE routes.
- [ ] Overview snapshot and SSE payload schemas live in `review-broker-core` and are exported for reuse by both server and dashboard code.
- [ ] The SSE route emits liveness/change notification data only; it does not become a second source of truth.

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M004 exec vitest run packages/review-broker-core/test/dashboard-contracts.test.ts packages/review-broker-server/test/http-dashboard-routes.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M004 --filter review-broker-core build && corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M004 --filter review-broker-server build`

## Observability Impact

- Signals added/changed: broker-owned overview snapshot versions and SSE topic/version notifications become visible over HTTP.
- How a future agent inspects this: hit the overview JSON route, connect to the SSE route, and compare payload shape against `packages/review-broker-core/src/dashboard.ts` and the route tests.
- Failure state exposed: HTTP startup/mount failures, schema drift, or incorrect SSE truth semantics show up directly in route tests and response payloads.

## Inputs

- `.gsd/milestones/M004/slices/S01/S01-PLAN.md` — slice goal, must-haves, and proof target for the mounted dashboard seam.
- `package.json` — existing workspace scripts and dependency baseline.
- `pnpm-lock.yaml` — dependency lockfile that must absorb Astro and any HTTP-serving additions.
- `packages/review-broker-core/src/contracts.ts` — canonical broker schema style to follow for dashboard contracts.
- `packages/review-broker-core/src/index.ts` — shared export surface for new dashboard schemas.
- `packages/review-broker-core/src/notifications.ts` — current versioned notification semantics the SSE route must project without redefining.
- `packages/review-broker-server/src/index.ts` — existing startup-recovery and runtime inspection seam used to seed overview data.
- `packages/review-broker-server/src/cli/start-broker.ts` — current standalone broker entrypoint that will need HTTP-aware startup wiring.
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — current real-entrypoint smoke pattern to preserve.

## Expected Output

- `packages/review-broker-dashboard/package.json` — new Astro dashboard package manifest.
- `packages/review-broker-dashboard/astro.config.mjs` — Astro build configuration for the mounted dashboard package.
- `packages/review-broker-dashboard/src/pages/index.astro` — minimal broker-served dashboard shell page.
- `packages/review-broker-core/src/dashboard.ts` — shared overview snapshot and SSE schemas/types.
- `packages/review-broker-core/src/index.ts` — exported dashboard contract surface.
- `packages/review-broker-core/test/dashboard-contracts.test.ts` — regression coverage for the shared dashboard schemas.
- `packages/review-broker-server/src/http/dashboard-server.ts` — broker-owned HTTP listener/mount implementation.
- `packages/review-broker-server/src/http/dashboard-routes.ts` — overview snapshot and SSE route handling.
- `packages/review-broker-server/test/http-dashboard-routes.test.ts` — route-level proof for mounted delivery and contract semantics.
