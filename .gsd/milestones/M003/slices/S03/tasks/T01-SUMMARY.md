---
id: T01
parent: S03
milestone: M003
provides:
  - Durable assembled continuity proof that exercises live reviewer exit, broker crash via AppContext.close(), and post-restart runtime/CLI inspection on one SQLite file.
key_files:
  - packages/review-broker-server/test/end-to-end-continuity-proof.test.ts
  - packages/review-broker-server/test/test-paths.ts
key_decisions:
  - Use `inspect-continuity.ts` as the first post-crash restart surface so the proof captures the one real `startup_recovery` pass, then compare the resulting durable continuity snapshot against in-process status/timeline reads and `start-broker.ts --once` idempotent output.
patterns_established:
  - Cross-check durable continuity by comparing per-review `getReviewStatus` and `getReviewTimeline` evidence with `inspectRuntimeContinuity`, `inspect-continuity.ts`, and `start-broker.ts --once` snapshots on the same SQLite file.
observability_surfaces:
  - getReviewStatus, getReviewTimeline, inspectRuntimeContinuity, start-broker.ts --once, inspect-continuity.ts --limit 10
duration: 1h
verification_result: passed
completed_at: 2026-03-23T23:25:00-07:00
blocker_discovered: false
---

# T01: Broaden the end-to-end continuity proof across reviewer exit and restart

**Expanded the continuity proof to cover live reviewer exit plus later crash/restart recovery on one durable SQLite database.**

## What Happened

I broadened `packages/review-broker-server/test/end-to-end-continuity-proof.test.ts` so one durable SQLite file now exercises two continuity causes in sequence: a live reviewer subprocess exit first, then a later broker crash simulated with `AppContext.close()` before a fresh restart surface performs startup recovery.

The updated proof now validates four reviews on the same database: reviewer-exit claimed/submitted work and startup-recovery claimed/submitted work. It proves that safe claimed work is reclaimed, ambiguous submitted work is detached and action-required, and no review remains in claimed limbo after the restart path.

To keep the proof on supported surfaces only, the test now cross-checks:
- `getReviewStatus`
- `getReviewTimeline`
- `inspectRuntimeContinuity`
- `inspect-continuity.ts --limit 10`
- `start-broker.ts --once`

I also updated `packages/review-broker-server/test/test-paths.ts` with shared absolute CLI path helpers (`TSX_PATH`, `START_BROKER_CLI_PATH`, `INSPECT_CONTINUITY_CLI_PATH`) so the proof can invoke the shipped CLIs against the same durable DB path without local path duplication.

No runtime or CLI production fix was needed; the broadened proof passed once its field-overlap assertions were aligned to the actual `broker.once_complete` payload shape.

## Verification

I ran the task verification lane first, then the slice-level verification lane and the operator-facing CLI commands. All checks passed.

The updated proof now demonstrates:
- one durable SQLite file covering both `reviewer_exit` and `startup_recovery`
- crash simulation through `AppContext.close()` rather than graceful reviewer shutdown
- coherent reclaim/detach/action-required/recovery-reason state across runtime and CLI continuity surfaces
- idempotent restart inspection, where `inspect-continuity.ts` performs the real startup recovery pass and a later `start-broker.ts --once` reports the same durable continuity state without inventing a second recovery pass

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/end-to-end-continuity-proof.test.ts packages/review-broker-server/test/startup-sweep.test.ts packages/review-broker-server/test/restart-persistence.test.ts` | 0 | ✅ pass | 2.309s |
| 2 | `test -f /home/cari/repos/tandem2/.gsd/worktrees/M003/packages/review-broker-server/test/end-to-end-continuity-proof.test.ts` | 0 | ✅ pass | 0.002s |
| 3 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/end-to-end-continuity-proof.test.ts packages/review-broker-server/test/recovery-status-surfaces.test.ts packages/review-broker-server/test/startup-sweep.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/continuity-cli.test.ts` | 0 | ✅ pass | 2.008s |
| 4 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 broker:continuity` | 0 | ✅ pass | 1.998s |
| 5 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s03-continuity.sqlite --once` | 0 | ✅ pass | 0.691s |
| 6 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/inspect-continuity.ts --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s03-continuity.sqlite --limit 10` | 0 | ✅ pass | 0.669s |

## Diagnostics

For future inspection, rerun the broadened proof first:
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/end-to-end-continuity-proof.test.ts`

If you need to observe a real `startup_recovery` summary on a stale DB, invoke `inspect-continuity.ts` first on that SQLite file. After that first recovery pass, `start-broker.ts --once` should report the same durable continuity snapshot but an empty `startupRecovery`, which is the expected idempotent post-restart shape.

Primary observability surfaces validated here:
- `packages/review-broker-server/test/end-to-end-continuity-proof.test.ts`
- `packages/review-broker-server/src/runtime/status-service.ts` via `getReviewStatus`, `getReviewTimeline`, and `inspectRuntimeContinuity`
- `packages/review-broker-server/src/cli/inspect-continuity.ts`
- `packages/review-broker-server/src/cli/start-broker.ts --once`

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `packages/review-broker-server/test/end-to-end-continuity-proof.test.ts` — broadened the assembled continuity proof to cover live reviewer exit, broker crash via `AppContext.close()`, restart recovery, and cross-surface runtime/CLI agreement on one DB.
- `packages/review-broker-server/test/test-paths.ts` — added shared absolute CLI path helpers used by durable proof tests.
- `.gsd/milestones/M003/slices/S03/S03-PLAN.md` — marked T01 complete.
- `.gsd/milestones/M003/slices/S03/tasks/T01-SUMMARY.md` — recorded the execution narrative and verification evidence.
