---
id: T02
parent: S03
milestone: M003
provides:
  - Repo and package continuity entrypoints that rerun the full assembled S03 crash/restart proof, plus focused operator regressions that validate the same durable-state story through supported status and CLI surfaces.
key_files:
  - package.json
  - packages/review-broker-server/package.json
  - packages/review-broker-server/test/recovery-status-surfaces.test.ts
  - packages/review-broker-server/test/continuity-cli.test.ts
  - packages/review-broker-server/src/cli/start-broker.ts
key_decisions:
  - Keep internal runtime snapshots unchanged for low-level tests, but sanitize `start-broker.ts --once` `latestReviewer` output to basenames plus lifecycle metadata so the shipped operator proof stays argv-safe.
patterns_established:
  - Delegate the root `broker:continuity` lane to a package-local `test:continuity` script, and re-prove assembled continuity by comparing `inspect-continuity.ts` first against a later idempotent `start-broker.ts --once` run on the same absolute SQLite path.
observability_surfaces:
  - `broker:continuity`, `packages/review-broker-server/package.json` `test:continuity`, `packages/review-broker-server/test/recovery-status-surfaces.test.ts`, `packages/review-broker-server/test/continuity-cli.test.ts`, `packages/review-broker-server/src/cli/start-broker.ts --once`, `packages/review-broker-server/src/cli/inspect-continuity.ts`
duration: 1h
verification_result: passed
completed_at: 2026-03-23T23:37:00-07:00
blocker_discovered: false
---

# T02: Align the shipped continuity acceptance lane and operator proof commands

**Aligned the continuity rerun commands and operator proof tests with the assembled crash/restart story, and sanitized once-mode reviewer output to keep the shipped proof argv-safe.**

## What Happened

I updated the repo and package entrypoints so the shipped continuity lane now reruns the full S03 acceptance bundle instead of the older narrower pair of tests. The root `broker:continuity` command now delegates to `packages/review-broker-server`’s new `test:continuity` script, which runs the assembled end-to-end proof plus the focused recovery/operator regressions required by the slice.

I tightened `packages/review-broker-server/test/recovery-status-surfaces.test.ts` in two ways. First, it now uses the service-owned `inspectRuntimeContinuity()` surface instead of the broader `inspectBrokerRuntime()` helper for the focused status/timeline/runtime regression. Second, it adds a durable assembled continuity case that proves reviewer-exit reclaim/detach behavior and later startup-recovery reclaim/detach behavior on one SQLite file through `getReviewStatus`, `getReviewTimeline`, `getStartupRecoverySnapshot()`, and `inspectRuntimeContinuity()`.

I also rewrote `packages/review-broker-server/test/continuity-cli.test.ts` so it no longer seeds only a narrow startup-recovery fixture. The test now drives the assembled operator story on one durable absolute `--db-path`: live reviewer exit first, broker crash via `AppContext.close()` second, then `inspect-continuity.ts` performs the real startup recovery pass and `start-broker.ts --once` proves the same post-restart continuity state idempotently. The assertions stay on supported broker-owned surfaces only and explicitly check for redaction-safe output.

During verification I found one real gap: `start-broker.ts --once` still emitted raw reviewer argv inside `latestReviewer`. I made the smallest runtime-owned fix by sanitizing only the CLI once-mode projection to emit basenames and lifecycle metadata there, while leaving the internal runtime snapshot contract unchanged for lower-level tests.

## Verification

I first ran the task’s focused verification lane for `recovery-status-surfaces.test.ts` and `continuity-cli.test.ts`; both passed after the once-mode redaction fix.

I then ran the full slice verification bundle. The explicit five-test slice lane passed, the shipped `broker:continuity` entrypoint passed and now resolves through the new package-local continuity script, and the two direct operator commands both exited successfully on the required absolute DB path.

The focused operator regression now proves the assembled reviewer-exit plus startup-recovery continuity story on one durable SQLite file. The direct slice-plan CLI commands also succeeded on the named `.tmp/m003-s03-continuity.sqlite` path; at verification time that path contained an already-idempotent empty continuity state, so those direct command outputs confirmed safe absolute-path startup/inspection behavior rather than re-seeding the assembled proof themselves.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/recovery-status-surfaces.test.ts packages/review-broker-server/test/continuity-cli.test.ts` | 0 | ✅ pass | 2.29s |
| 2 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/end-to-end-continuity-proof.test.ts packages/review-broker-server/test/recovery-status-surfaces.test.ts packages/review-broker-server/test/startup-sweep.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/continuity-cli.test.ts` | 0 | ✅ pass | 2.13s |
| 3 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 broker:continuity` | 0 | ✅ pass | 2.39s |
| 4 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s03-continuity.sqlite --once` | 0 | ✅ pass | 0.74s |
| 5 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/inspect-continuity.ts --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s03-continuity.sqlite --limit 10` | 0 | ✅ pass | 0.86s |

## Diagnostics

For future continuity verification, run:
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 broker:continuity`

For package-local reruns of the same lane, use:
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server run test:continuity`

For operator-facing continuity inspection on a real durable DB, compare:
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/inspect-continuity.ts --db-path /absolute/path/to/review-broker.sqlite --limit 10`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path /absolute/path/to/review-broker.sqlite --once`

The focused regressions to inspect first are:
- `packages/review-broker-server/test/recovery-status-surfaces.test.ts`
- `packages/review-broker-server/test/continuity-cli.test.ts`

The shipped once-mode CLI is now argv-safe in `latestReviewer`; if a future operator proof shows raw reviewer args again, inspect `packages/review-broker-server/src/cli/start-broker.ts` before changing the underlying runtime snapshot contract.

## Deviations

- Added one narrow production fix in `packages/review-broker-server/src/cli/start-broker.ts` because verification exposed a real redaction leak in the once-mode `latestReviewer` payload. The task plan did not list that file in the expected output, but the change stayed within the slice’s observability/redaction scope.

## Known Issues

None.

## Files Created/Modified

- `package.json` — repointed `broker:continuity` to the package-local full S03 continuity lane.
- `packages/review-broker-server/package.json` — added `test:continuity` so package-scoped reruns exercise the assembled acceptance bundle.
- `packages/review-broker-server/test/recovery-status-surfaces.test.ts` — switched the focused runtime regression to `inspectRuntimeContinuity()` and added a durable reviewer-exit plus startup-recovery status-surface proof.
- `packages/review-broker-server/test/continuity-cli.test.ts` — rewrote the operator regression to prove the assembled continuity story through `inspect-continuity.ts` and `start-broker.ts --once` on one absolute durable DB path.
- `packages/review-broker-server/src/cli/start-broker.ts` — sanitized once-mode `latestReviewer` output so the shipped operator proof no longer leaks raw reviewer argv.
- `.gsd/DECISIONS.md` — recorded the operator-surface redaction decision as D018.
- `.gsd/KNOWLEDGE.md` — captured the CLI-vs-runtime snapshot redaction rule for future continuity work.
- `.gsd/milestones/M003/slices/S03/S03-PLAN.md` — marked T02 complete.
- `.gsd/milestones/M003/slices/S03/tasks/T02-SUMMARY.md` — recorded execution details and verification evidence.
