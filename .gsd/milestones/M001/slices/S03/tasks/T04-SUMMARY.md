---
id: T04
parent: S03
milestone: M001
provides:
  - Reviewer-exit, operator-kill, and startup-recovery reclaim flows with durable audit evidence, fenced review updates, and once-mode startup recovery diagnostics
key_files:
  - packages/review-broker-server/src/runtime/reviewer-manager.ts
  - packages/review-broker-server/src/runtime/broker-service.ts
  - packages/review-broker-server/src/index.ts
  - packages/review-broker-server/src/db/reviews-repository.ts
  - packages/review-broker-server/test/reviewer-recovery.test.ts
  - packages/review-broker-server/test/restart-persistence.test.ts
  - packages/review-broker-server/test/start-broker.smoke.test.ts
key_decisions:
  - Registered a reviewer-manager offline hook from broker-service so live exits and operator kills run the same recovery logic that emits per-review `review.reclaimed` or fenced `review.transition_rejected` evidence
  - Strengthened recovery updates with optional expected status and claimant guards in `reviews-repository.ts` so claim-generation fencing does not clobber newer state transitions or reassigned claims
  - Added `startupRecovery` snapshots plus latest-audit metadata to broker startup/once inspection output so operators can inspect reclaimed review IDs and stale-session outcomes without reading raw SQLite rows first
patterns_established:
  - `context.close()` intentionally detaches reviewer listeners before signalling child shutdown, which leaves a stale reviewer row for restart-recovery tests; use `startBroker(...)` on the same SQLite file to prove `startup_recovery`
observability_surfaces:
  - packages/review-broker-server/test/reviewer-recovery.test.ts
  - packages/review-broker-server/test/restart-persistence.test.ts
  - packages/review-broker-server/test/start-broker.smoke.test.ts
  - packages/review-broker-server/src/index.ts inspectBrokerRuntime()
  - packages/review-broker-server/src/cli/start-broker.ts --once
  - SQLite reviewers, reviews, and audit_events tables
duration: 2h15m
verification_result: passed
completed_at: 2026-03-21T13:04:30Z
blocker_discovered: false
---

# T04: Reclaim reviews on reviewer exit and prove restart-safe recovery

**Added reviewer-exit/operator-kill/startup recovery with fenced reclaims, durable audit evidence, and once-mode startup recovery diagnostics.**

## What Happened

I extended `packages/review-broker-server/src/runtime/reviewer-manager.ts` so observed child exits now run a registered offline hook before the tracked reviewer resolves as stopped. That hook feeds reclaimed/stale/unrecoverable review IDs back into the persisted `reviewer.offline` metadata, while operator kills still emit `reviewer.killed` first and then complete through the same recovery path.

In `packages/review-broker-server/src/runtime/broker-service.ts`, I added `recoverReviewerAssignments(...)` for automatic reclaim flows. It reclaims only `claimed` and `submitted` reviews, appends per-review `review.reclaimed` metadata with `reclaimCause`, and records `review.transition_rejected` with `STALE_CLAIM_GENERATION` when a newer claim wins the race. I also added a `yieldForRecoveryRace` test hook so the stale-claim proof can force the exact concurrency window.

To make those automatic reclaims safe, I made a small local adaptation in `packages/review-broker-server/src/db/reviews-repository.ts`: `updateState(...)` now accepts optional expected status and expected claimant guards in addition to the existing `claim_generation` fence. The recovery path uses all three so it cannot overwrite a newer claim or a different terminal status that happens to reuse the same generation.

In `packages/review-broker-server/src/index.ts`, I added synchronous startup reconciliation for stale reviewer rows. On broker start, any reviewer row that still has a pid but no offline timestamp is marked offline with `startup_recovery`, its limbo-prone reviews are reclaimed, and a structured `startupRecovery` snapshot is retained on the runtime. I also exposed latest audit metadata in `inspectBrokerRuntime()` so once-mode JSON can surface reclaimed review IDs and recovery causes directly.

In `packages/review-broker-server/src/cli/start-broker.ts`, both `broker.started` and `broker.once_complete` now include that `startupRecovery` snapshot. This keeps restart-safe recovery visible through the real CLI inspection path instead of hiding it behind test-only helpers.

For proof, I added `packages/review-broker-server/test/reviewer-recovery.test.ts` with three focused cases: unexpected reviewer exit reclaim, operator-kill reclaim for a submitted review, and a forced stale-claim race that proves the recovery fence does not overwrite a newer claimant. I extended `packages/review-broker-server/test/restart-persistence.test.ts` to reopen a stale-session database through `startBroker(...)` and verify that only `claimed`/`submitted` reviews are reclaimed while an `approved` review remains untouched. I rewrote `packages/review-broker-server/test/start-broker.smoke.test.ts` to seed a real stale reviewer session and then assert the once-mode JSON plus raw SQLite state both show startup recovery and redaction-safe reviewer diagnostics.

Because operator-kill now reclaims the tracked review immediately, I also updated `packages/review-broker-server/test/reviewer-lifecycle.test.ts` so its offline reviewer expectations match the new contract: the killed reviewer is offline with `currentReviewId: null`, and the claimed review is back in `pending` with incremented `claimGeneration`.

## Verification

I verified the focused T04 proofs first, then reran the exact slice verification commands and the package build. The new recovery tests passed, the restart/CLI smoke coverage passed, the existing reviewer lifecycle suite was updated to match the stricter reclaim behavior, `review-broker-server` built cleanly, and the real `tsx src/cli/start-broker.ts --once` path emitted the expected startup recovery JSON.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server run build` | 0 | ✅ pass | n/a |
| 2 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/reviewer-recovery.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts` | 0 | ✅ pass | 0.89s |
| 3 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/reviewer-contracts.test.ts` | 0 | ✅ pass | 0.32s |
| 4 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/reviewer-lifecycle.test.ts packages/review-broker-server/test/reviewer-recovery.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts` | 0 | ✅ pass | 1.09s |
| 5 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/reviewer-lifecycle.test.ts` | 0 | ✅ pass | 0.53s |
| 6 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/reviewer-recovery.test.ts` | 0 | ✅ pass | 0.53s |
| 7 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s03-smoke.sqlite --once` | 0 | ✅ pass | n/a |

## Diagnostics

Inspect the shipped recovery surfaces with:
- `packages/review-broker-server/test/reviewer-recovery.test.ts` for live reviewer exit, operator kill, and stale-claim race proofs.
- `packages/review-broker-server/test/restart-persistence.test.ts` for restart-safe stale-session reconciliation and selective reclaim behavior.
- `packages/review-broker-server/test/start-broker.smoke.test.ts` for the real `--once` startup recovery proof.
- `packages/review-broker-server/src/index.ts` `inspectBrokerRuntime()` for latest reviewer state plus latest audit metadata.
- `packages/review-broker-server/src/cli/start-broker.ts --once` for structured `startupRecovery`, latest reviewer snapshots, and latest audit metadata.
- SQLite `audit_events` rows for `review.reclaimed`, `review.transition_rejected`, and `reviewer.offline` metadata including reclaim causes, stale fences, and reclaimed review IDs.

## Deviations

- I updated `packages/review-broker-server/src/db/reviews-repository.ts` even though it was listed as an input rather than an expected output file, because automatic recovery needed optional expected-status and expected-claimant guards in addition to `claim_generation` fencing.
- I also updated `packages/review-broker-server/test/reviewer-lifecycle.test.ts` so the earlier lifecycle proof reflects the new T04 behavior where operator kill immediately reclaims the reviewer-owned active review.

## Known Issues

- None.

## Files Created/Modified

- `packages/review-broker-server/src/runtime/reviewer-manager.ts` — added the offline recovery hook contract and persisted recovery-result metadata on `reviewer.offline` audit rows.
- `packages/review-broker-server/src/runtime/broker-service.ts` — added automatic reviewer recovery wiring, fenced reclaim logic, and stale-race observability.
- `packages/review-broker-server/src/index.ts` — added startup reconciliation, startup recovery snapshots, and latest-audit metadata in runtime inspection output.
- `packages/review-broker-server/src/db/reviews-repository.ts` — added optional expected status/claimant guards for safe recovery updates.
- `packages/review-broker-server/src/cli/start-broker.ts` — surfaced `startupRecovery` through `broker.started` and `broker.once_complete` JSON.
- `packages/review-broker-server/test/reviewer-recovery.test.ts` — added focused live recovery coverage for reviewer exit, operator kill, and stale-claim protection.
- `packages/review-broker-server/test/restart-persistence.test.ts` — added restart-safe stale-session recovery proof with selective reclaim expectations.
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — updated the real CLI smoke test to seed and inspect startup recovery.
- `packages/review-broker-server/test/reviewer-lifecycle.test.ts` — aligned the lifecycle proof with T04 reclaim behavior after operator kill.
- `.gsd/milestones/M001/slices/S03/S03-PLAN.md` — marked T04 complete.
