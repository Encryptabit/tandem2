---
estimated_steps: 4
estimated_files: 6
skills_used:
  - gsd
  - agent-browser
  - test
  - debug-like-expert
---

# T03: Package the real-runtime dashboard proof and operator entrypoints

**Slice:** S01 — Broker-mounted dashboard and live overview
**Milestone:** M004

## Description

Close S01 with one repeatable proof path. This task should make the broker-served dashboard easy to start, verify, and debug against a real SQLite-backed runtime so later slices inherit a trustworthy mounted dashboard foundation instead of ad hoc local commands.

## Steps

1. Extend `packages/review-broker-server/src/cli/start-broker.ts` and the related package/root scripts so the broker can be started in HTTP-serving mode with explicit host/port and absolute SQLite-path handling suitable for repeatable local proof.
2. Tighten `packages/review-broker-server/test/start-broker.smoke.test.ts` and `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` so they cover broker HTTP startup, dashboard mount availability, and live overview refresh after a real broker mutation.
3. Update `packages/review-broker-server/test/test-paths.ts` and any script wiring needed to give the proof stable absolute paths for the broker CLI, dashboard entrypoint, fixtures, and browser-facing local URL.
4. Re-run the named tests plus a real browser proof on the broker-served URL, and leave behind one documented repo/package entrypoint that future agents can use for S01 verification without reconstructing flags or ports.

## Must-Haves

- [ ] Repo/package scripts expose a repeatable broker-served dashboard proof path, not just one-off local commands.
- [ ] Real-entrypoint tests cover broker HTTP startup and dashboard availability alongside the existing SQLite-backed smoke expectations.
- [ ] The live overview proof uses a real broker mutation and a broker-served browser URL, not isolated component rendering alone.

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M004 exec vitest run packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M004 --filter review-broker-dashboard build && corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M004 --filter review-broker-server build`
- Browser-check the broker-served local URL started from the repo/package script and confirm overview cards refresh after a real broker mutation.

## Observability Impact

- Signals added/changed: broker startup output and smoke/integration coverage now include HTTP-serving state and dashboard entrypoint availability.
- How a future agent inspects this: run the repo/package dashboard proof command, watch broker startup output for the local URL, then compare browser behavior with the integration and smoke tests.
- Failure state exposed: broken mount wiring, missing local URL reporting, or refresh regressions fail through the named tests and the repeatable browser proof path.

## Inputs

- `.gsd/milestones/M004/slices/S01/S01-PLAN.md` — slice verification target and real-runtime proof expectations.
- `.gsd/milestones/M004/slices/S01/tasks/T01-PLAN.md` — mounted dashboard delivery/files from the first task.
- `.gsd/milestones/M004/slices/S01/tasks/T02-PLAN.md` — live overview UI and refresh behavior that must now be packaged into a repeatable proof.
- `package.json` — repo-level script surface.
- `packages/review-broker-server/package.json` — package-level broker entrypoints.
- `packages/review-broker-server/src/cli/start-broker.ts` — real broker CLI entrypoint to extend for HTTP startup.
- `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` — live runtime proof harness.
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — real entrypoint smoke harness.
- `packages/review-broker-server/test/test-paths.ts` — absolute path helpers for repeatable proof commands.

## Expected Output

- `package.json` — repo-level dashboard proof scripts.
- `packages/review-broker-server/package.json` — package-level dashboard start/proof scripts.
- `packages/review-broker-server/src/cli/start-broker.ts` — HTTP-serving broker startup flags and output.
- `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` — tightened live overview/runtime proof.
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — smoke coverage for broker HTTP startup and mounted dashboard availability.
- `packages/review-broker-server/test/test-paths.ts` — stable absolute path and local URL helpers for the S01 proof path.
