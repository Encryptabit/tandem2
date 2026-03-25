# S03 UAT: Reviewer lifecycle and recovery

S03 does not require human UI acceptance, so this UAT is a **mechanical acceptance checklist** for broker-owned reviewer lifecycle operations, recovery behavior, and reviewer/failure diagnostics.

## Preconditions
- Working directory: `/home/cari/repos/tandem2/.gsd/worktrees/M001`
- Dependencies are installed for this worktree.
- `corepack`, `tsx`, and the workspace Vitest toolchain are available.
- Remove stale smoke DBs before starting:
  - `rm -f packages/review-broker-server/.tmp/s03-smoke.sqlite*`
  - `rm -f .tmp/s03-uat-recovery.sqlite*`
- The reviewer fixture exists at:
  - `packages/review-broker-server/test/fixtures/reviewer-worker.mjs`

---

## Test Case 1 — Full slice verification contract

**Goal:** Prove the exact slice-level verification commands from the plan all pass.

### Steps
1. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/reviewer-contracts.test.ts`
2. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/reviewer-lifecycle.test.ts packages/review-broker-server/test/reviewer-recovery.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts`
3. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/reviewer-lifecycle.test.ts`
4. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/reviewer-recovery.test.ts`
5. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s03-smoke.sqlite --once`

### Expected outcome
- All five commands exit `0`.
- Step 1 reports **1 passed file** and **4 passed tests**.
- Step 2 reports **5 passed files** and **11 passed tests**.
- Step 3 reports **1 passed file** and **2 passed tests**.
- Step 4 reports **1 passed file** and **3 passed tests**.
- Step 5 emits `broker.started` and `broker.once_complete` JSON containing:
  - `migrations: ["001_init", "002_review_lifecycle_parity", "003_reviewer_lifecycle"]`
  - `migrationCount: 3`
  - `reviewerCount: 0`
  - `trackedReviewerCount: 0`
  - `startupRecovery.recoveredReviewerIds: []`

### Failure signals to inspect
- reviewer contract drift in `review-broker-core`
- missing migration `003_reviewer_lifecycle`
- reviewer test files not being discovered
- CLI `--once` output missing reviewer-aware snapshot fields

---

## Test Case 2 — Public spawn/list/kill behavior through the started broker

**Goal:** Confirm the started runtime owns reviewer lifecycle operations and keeps additive claim behavior compatible.

### Steps
1. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/reviewer-lifecycle.test.ts --testNamePattern "exposes public spawn/list/kill methods through the started broker and keeps arbitrary claimants compatible"`
2. Review the Vitest output.

### Expected outcome
- Exit code is `0`.
- The named test passes.
- The proof includes:
  - initial `listReviewers({})` returns `{ reviewers: [], version: 0 }`
  - `spawnReviewer(...)` returns a live reviewer with redaction-safe command metadata:
    - `command` equals `node`/the basename of `process.execPath`
    - `args` contains `packages/review-broker-server/test/fixtures/reviewer-worker.mjs`
    - `cwd` equals `packages/review-broker-server`
  - reviewer-list wait semantics wake on the `reviewer-state` version bump
  - a review claimed by the registered reviewer appears as `status: "assigned"` with `currentReviewId` set
  - a review claimed by `external-claimant` still succeeds, proving claim compatibility remains additive
  - `killReviewer(...)` returns `outcome: "killed"`
  - the killed reviewer becomes `offline` with `offlineReason: "operator_kill"`
  - the reviewer-owned review is reclaimed to `pending` with `claimGeneration: 2`

### Failure signals to inspect
- reviewer status staying `idle` after the registered reviewer claims a review
- non-registered claimants becoming invalid
- `killReviewer()` stopping the process without reclaiming the active review
- missing `reviewer.spawned` / `reviewer.killed` / `reviewer.offline` audit rows

---

## Test Case 3 — Recovery after reviewer exit and operator kill

**Goal:** Prove limbo-prone reviews are reclaimed after reviewer failure and that the broker leaves durable evidence behind.

### Steps
1. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/reviewer-recovery.test.ts --testNamePattern "reclaims a claimed review after an unexpected reviewer exit and leaves durable recovery diagnostics behind|reclaims a submitted review on operator kill and records the recovery cause in both review and reviewer audit rows"`
2. Review the Vitest output.

### Expected outcome
- Exit code is `0`.
- Both named tests pass.
- The proved failure-path behavior includes:
  - unexpected `SIGKILL` marks the reviewer `offline` with `offlineReason: "reviewer_exit"`
  - operator kill marks the reviewer `offline` with `offlineReason: "operator_kill"`
  - claimed and submitted reviews are reclaimed to `pending`
  - reclaimed reviews clear `claimedBy` and increment `claimGeneration` from `1` to `2`
  - review activity includes `review.reclaimed`
  - reviewer-global audit rows include reclaimed review IDs in `reviewer.offline` metadata
  - runtime inspection shows `reviewerStatusCounts.offline === 1` and `trackedReviewerCount === 0` after the exit path completes

### Failure signals to inspect
- reviewer row goes offline without reclaiming the active review
- activity feed lacks `review.reclaimed`
- reviewer-global audit metadata omits `reclaimedReviewIds`
- exit and operator-kill paths behave differently in ways not captured by `reclaimCause`

---

## Test Case 4 — Recovery fencing during stale-claim race

**Goal:** Confirm automatic recovery does not clobber a newer manual reclaim and re-claim.

### Steps
1. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/reviewer-recovery.test.ts --testNamePattern "does not overwrite a newer claim when reviewer-exit recovery races with a manual reclaim and re-claim"`
2. Review the Vitest output.

### Expected outcome
- Exit code is `0`.
- The named test passes.
- The proof shows:
  - automatic reviewer-exit recovery intentionally races with a later manual reclaim/re-claim
  - the review remains owned by the newer claimant rather than being reset by stale recovery
  - the broker records `review.transition_rejected` with `STALE_CLAIM_GENERATION`
  - rejection metadata includes the expected and actual claim generations plus the expected and actual claimant IDs

### Failure signals to inspect
- recovery blindly setting the review back to `pending`
- missing `STALE_CLAIM_GENERATION` evidence
- recovery using only one fence and therefore overwriting a newer owner

---

## Test Case 5 — Restart-safe startup recovery and CLI diagnostics

**Goal:** Confirm stale reviewer sessions are reconciled on restart and that the real CLI exposes recovery outcomes without raw DB inspection.

### Steps
1. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/restart-persistence.test.ts --testNamePattern "reconciles stale reviewer sessions on restart, reclaims only claimed and submitted reviews, and preserves inspectable startup-recovery evidence"`
2. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/start-broker.smoke.test.ts --testNamePattern "starts through the real CLI entrypoint in smoke mode, proves startup recovery, and surfaces redaction-safe reviewer diagnostics"`
3. Review the Vitest output.

### Expected outcome
- Both commands exit `0`.
- The restart-persistence proof shows:
  - stale reviewer rows are marked offline with `offlineReason: "startup_recovery"`
  - only reviews in `claimed` or `submitted` are reclaimed
  - an `approved` review remains untouched
  - reopened runtime `getStartupRecoverySnapshot()` contains recovered reviewer IDs plus reclaimed/stale/unrecoverable review lists
- The real CLI smoke proof shows `broker.started` and `broker.once_complete` JSON containing:
  - `startupRecovery.recoveredReviewerIds: ["smoke-reviewer-1"]`
  - `startupRecovery.reclaimedReviewIds` containing the seeded review ID
  - `reviewerStatusCounts: { "offline": 1 }`
  - `latestReviewer.offlineReason: "startup_recovery"`
  - `latestAuditEvent` metadata containing `reviewerId: "smoke-reviewer-1"`
  - reviewer command metadata stored as basename + relative fixture path, not raw absolute command lines

### Failure signals to inspect
- startup recovery reclaiming approved reviews
- `startupRecovery` snapshot missing from CLI output
- reviewer diagnostics leaking absolute or secret-bearing command metadata
- restart proving the DB reopened but not the recovery outcomes

---

## Edge-case checklist

### Edge Case A — Shared reviewer contract stays canonical
- Covered by `packages/review-broker-core/test/reviewer-contracts.test.ts`
- Expected outcome:
  - reviewer offline reasons remain exactly `spawn_failed`, `reviewer_exit`, `operator_kill`, `startup_recovery`
  - reclaim causes remain exactly `reviewer_exit`, `operator_kill`, `startup_recovery`
  - `ReviewerRecord` exposes `currentReviewId` and rejects a duplicated `assignedReviewId`
  - `NOTIFICATION_TOPICS` includes `reviewer-state`

### Edge Case B — Runtime shutdown waits for reviewer cleanup
- Covered by `packages/review-broker-server/test/reviewer-lifecycle.test.ts`
- Expected outcome:
  - `runtime.close()` + `waitUntilStopped()` leaves no live reviewer process behind
  - `getShutdownSnapshot().reviewerShutdown.outcomes.killed === 1` for the seeded reviewer
  - the durable reviewer row ends with `offline_reason: "operator_kill"`

### Edge Case C — Recovery diagnostics remain durable after the process is gone
- Covered by `packages/review-broker-server/test/reviewer-recovery.test.ts`, `restart-persistence.test.ts`, and `start-broker.smoke.test.ts`
- Expected outcome:
  - once the reviewer is offline, operator surfaces can still inspect pid/exit metadata, reclaim cause, reclaimed review IDs, and latest audit information
  - startup recovery remains visible after reopen through both runtime snapshots and CLI JSON

### Edge Case D — Reviewer list invalidation is version-based, not polling-based
- Covered by `packages/review-broker-server/test/reviewer-lifecycle.test.ts`
- Expected outcome:
  - a waiter using `wait: true` with `sinceVersion` wakes when reviewer state changes
  - `listReviewers().version` matches the `reviewer-state` notification topic version

---

## Acceptance decision
S03 is acceptable only if **all five test cases pass** and the edge-case expectations remain true. Any failure means the broker still does not have mechanically proven reviewer lifecycle ownership, safe recovery behavior, or inspectable reviewer diagnostics.
