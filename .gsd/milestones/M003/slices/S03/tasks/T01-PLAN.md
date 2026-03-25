---
estimated_steps: 4
estimated_files: 5
skills_used:
  - gsd
  - test
  - debug-like-expert
---

# T01: Broaden the end-to-end continuity proof across reviewer exit and restart

**Slice:** S03 — End-to-end crash/restart continuity proof
**Milestone:** M003

## Description

Encode the missing milestone acceptance seam directly in the existing Vitest harness. This task should broaden the current end-to-end proof so one durable SQLite database first survives a live reviewer subprocess exit and then a later crash/restart stale-session sweep, with supported runtime and CLI continuity surfaces all agreeing on the resulting state.

## Steps

1. Extend `packages/review-broker-server/test/end-to-end-continuity-proof.test.ts` so the same SQLite file covers both `reviewer_exit` recovery and a later `startup_recovery` pass created by simulating broker crash with `AppContext.close()` rather than graceful shutdown.
2. Reuse or extract the minimum test helpers needed in `packages/review-broker-server/test/test-paths.ts` so the broadened proof can invoke `start-broker.ts --once` and `inspect-continuity.ts` with stable absolute paths and durable DB reuse.
3. Assert the combined post-restart state through supported broker surfaces only: `getReviewStatus`, `getReviewTimeline`, `inspectRuntimeContinuity`, `start-broker.ts --once`, and `inspect-continuity.ts`, making sure reclaimed vs detached reviews, action-required flags, and recovery reasons remain coherent across the snapshots.
4. If the broadened proof exposes a real mismatch, make only the narrow fix required in `packages/review-broker-server/src/runtime/status-service.ts`, `packages/review-broker-server/src/runtime/broker-service.ts`, or `packages/review-broker-server/src/cli/inspect-continuity.ts`; do not introduce a second recovery policy or a second continuity inspector.

## Must-Haves

- [ ] The proof uses one durable SQLite file and demonstrates both `reviewer_exit` and `startup_recovery` in sequence.
- [ ] Crash simulation uses `AppContext.close()` semantics, not graceful reviewer-offline shutdown behavior.
- [ ] Runtime and CLI continuity surfaces agree on reclaim/detach outcomes, action-required state, and recovery reasons without raw DB inspection.

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/end-to-end-continuity-proof.test.ts packages/review-broker-server/test/startup-sweep.test.ts packages/review-broker-server/test/restart-persistence.test.ts`
- `test -f /home/cari/repos/tandem2/.gsd/worktrees/M003/packages/review-broker-server/test/end-to-end-continuity-proof.test.ts`

## Observability Impact

- Signals added/changed: the assembled proof must validate durable `review.reclaimed`, `review.detached`, and `reviewer.offline` evidence plus continuity snapshots that carry `recoveryReason`, `actionRequiredReason`, and startup recovery summaries.
- How a future agent inspects this: rerun the named Vitest lane, then compare the in-process status/timeline/runtime snapshots with the CLI output from `start-broker.ts --once` and `inspect-continuity.ts` on the same database.
- Failure state exposed: any divergence between runtime and CLI continuity views, or any review left in claimed/stale limbo after restart, becomes a direct proof failure.

## Inputs

- `.gsd/milestones/M003/slices/S03/S03-PLAN.md` — slice goal, must-haves, and verification target for the assembled proof.
- `packages/review-broker-server/test/end-to-end-continuity-proof.test.ts` — existing reviewer-exit proof to broaden.
- `packages/review-broker-server/test/startup-sweep.test.ts` — crash/restart sweep pattern using `AppContext.close()`.
- `packages/review-broker-server/test/restart-persistence.test.ts` — durable restart assertions and startup recovery expectations.
- `packages/review-broker-server/test/continuity-cli.test.ts` — current CLI assertion shape for supported continuity surfaces.
- `packages/review-broker-server/test/test-paths.ts` — stable worktree and fixture path helpers.
- `packages/review-broker-server/src/runtime/app-context.ts` — crash-simulation boundary.
- `packages/review-broker-server/src/runtime/status-service.ts` — shared runtime continuity snapshot used by status/CLI surfaces.
- `packages/review-broker-server/src/runtime/broker-service.ts` — supported broker service inspection path.
- `packages/review-broker-server/src/cli/inspect-continuity.ts` — focused continuity CLI surface.
- `packages/review-broker-server/src/cli/start-broker.ts` — broader once-mode continuity surface.

## Expected Output

- `packages/review-broker-server/test/end-to-end-continuity-proof.test.ts` — broadened assembled proof covering reviewer exit plus crash/restart on one DB.
- `packages/review-broker-server/test/test-paths.ts` — any helper updates needed for stable absolute CLI/runtime proof paths.
- `packages/review-broker-server/src/runtime/status-service.ts` — narrow continuity snapshot fix only if the broadened proof exposes one.
- `packages/review-broker-server/src/runtime/broker-service.ts` — narrow service-surface fix only if the broadened proof exposes one.
- `packages/review-broker-server/src/cli/inspect-continuity.ts` — narrow CLI alignment fix only if the broadened proof exposes one.
