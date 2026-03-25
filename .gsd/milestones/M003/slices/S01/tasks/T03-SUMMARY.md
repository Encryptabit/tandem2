---
id: T03
parent: S01
milestone: M003
provides:
  - Live broker recovery for timed-out claims, dead reviewers, and startup stale sessions using one reviewer-session-aware reclaim/detach policy path.
key_files:
  - packages/review-broker-server/src/runtime/broker-service.ts
  - packages/review-broker-server/src/runtime/reviewer-manager.ts
  - packages/review-broker-server/src/index.ts
  - packages/review-broker-server/test/claim-timeout-recovery.test.ts
  - packages/review-broker-server/test/reviewer-exit-recovery.test.ts
  - packages/review-broker-server/test/startup-sweep.test.ts
  - packages/review-broker-server/test/reviewer-recovery.test.ts
  - .gsd/KNOWLEDGE.md
key_decisions:
  - Claim-timeout recovery now runs opportunistically before public broker service operations instead of depending on a separate sweeper loop, while reviewer-exit and startup recovery reuse the same repository-backed reclaim/detach path.
patterns_established:
  - Use persisted reviewer session IDs on claims so live exit recovery, timeout recovery, and startup sweep can leave inspectable ownership evidence without exposing raw child-process argv.
  - Use `AppContext.close()` to simulate a broker crash in startup-recovery tests; it leaves stale pid/session ownership behind without writing graceful offline rows.
observability_surfaces:
  - `runtime.getStartupRecoverySnapshot()`; `packages/review-broker-server/src/cli/start-broker.ts --once`; `reviews.getContinuityState()`; `audit.getLatestContinuityForReview()` / `listContinuityForReview()`; SQLite `audit_events` reviewer.offline/review.reclaimed/review.detached rows
duration: 1h30m
verification_result: passed
completed_at: 2026-03-24T07:22:30Z
blocker_discovered: false
---

# T03: Wire live reviewer-exit, stale-claim, and startup-sweep recovery

**Wired session-aware timeout, reviewer-exit, and startup-sweep recovery through the live broker runtime with reclaim/detach proofs.**

## What Happened

The local repo was again ahead of the planner’s snapshot: `app-context.ts`, `reviewer-manager.ts`, `broker-service.ts`, `index.ts`, and the real reviewer fixture already existed, but the live runtime still handled recovery with ad hoc reclaim-only logic. I adapted T03 to that local reality by refactoring the existing runtime instead of creating those files from scratch.

In `packages/review-broker-server/src/runtime/reviewer-manager.ts` I kept broker-owned real subprocess supervision, but added durable reviewer-session IDs on spawn and extended the offline hook/audit payloads to report `detachedReviewIds` and the reviewer session ID alongside reclaim/stale/unrecoverable outcomes. That gives later status/timeline work a stable identity for “which reviewer session owned this claim?” without surfacing raw full argv.

In `packages/review-broker-server/src/runtime/broker-service.ts` I replaced the old reclaim-only recovery path with one policy used everywhere: safe `claimed` work goes through `reviews.reclaimForRecovery(...)`, ambiguous `submitted` work goes through `reviews.detachForRecovery(...)`, and stale races stay durable as `review.transition_rejected`. I also started persisting `reviewerSessionId` onto claims, clearing continuity/action-required flags when work is safely requeued, and running claim-timeout maintenance opportunistically before public broker operations so timed-out work gets recovered without a separate background loop.

In `packages/review-broker-server/src/index.ts` I removed the bespoke startup-recovery implementation and now call the shared `runStartupRecoverySweep(...)` helper before the runtime is considered started. Startup recovery now returns the richer continuity summary shape from the shared contract: reclaimed IDs, detached IDs, action-required IDs, stale/unrecoverable counts, and per-reviewer summaries with reviewer session IDs.

I replaced the three T03 placeholder tests with real runtime proofs:
- `claim-timeout-recovery.test.ts` proves timed-out `claimed` work is reclaimed while timed-out `submitted` work is detached with action-required continuity evidence.
- `reviewer-exit-recovery.test.ts` proves a real fixture subprocess exit reclaims safe claimed work and detaches ambiguous submitted work while writing reviewer-offline evidence.
- `startup-sweep.test.ts` proves restart recovery runs before normal broker work begins and uses the same conservative reclaim-vs-detach rules against one durable SQLite file.

Because the new runtime semantics intentionally changed the older recovery behavior, I also updated `packages/review-broker-server/test/reviewer-recovery.test.ts` so its legacy coverage matches the slice’s conservative detach rule for submitted work.

## Verification

I first ran the task-plan verification bundle directly and it passed. I also reran the nearby reviewer-manager/reviewer-recovery/reviewer-lifecycle regression cluster to make sure the live subprocess path still behaved after the policy refactor.

After that I ran the full slice verification bundle required for an intermediate task. The T01/T02 bundle now passes, the T03 bundle passes except for the still-intentional T04 `recovery-status-surfaces` placeholder, the T04 end-to-end proof still fails as expected, `start-broker.ts --once` succeeds with the richer startup recovery summary, and `broker:continuity` still fails because that root entry remains owned by T04.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/claim-timeout-recovery.test.ts packages/review-broker-server/test/reviewer-exit-recovery.test.ts packages/review-broker-server/test/startup-sweep.test.ts` | 0 | ✅ pass | 1.276s |
| 2 | `test -f /home/cari/repos/tandem2/.gsd/worktrees/M003/packages/review-broker-server/test/fixtures/reviewer-worker.mjs` | 0 | ✅ pass | 0.019s |
| 3 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/reviewer-manager.test.ts packages/review-broker-server/test/reviewer-recovery.test.ts packages/review-broker-server/test/reviewer-lifecycle.test.ts` | 0 | ✅ pass | 0.807s |
| 4 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-core/test/continuity-contracts.test.ts packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/recovery-transitions.test.ts` | 0 | ✅ pass | 1.070s |
| 5 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/claim-timeout-recovery.test.ts packages/review-broker-server/test/reviewer-exit-recovery.test.ts packages/review-broker-server/test/startup-sweep.test.ts packages/review-broker-server/test/recovery-status-surfaces.test.ts` | 1 | ❌ fail | 1.249s |
| 6 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/end-to-end-continuity-proof.test.ts` | 1 | ❌ fail | 0.268s |
| 7 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 broker:continuity` | 243 | ❌ fail | 0.300s |
| 8 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/m003-s01-inspect.sqlite --once` | 0 | ✅ pass | 0.786s |

## Diagnostics

Future agents can inspect the shipped T03 behavior from four layers:

- Live runtime policy: `packages/review-broker-server/src/runtime/broker-service.ts` now contains `recoverTimedOutClaims(...)`, `recoverReviewerAssignments(...)`, and `runStartupRecoverySweep(...)`.
- Subprocess supervision: `packages/review-broker-server/src/runtime/reviewer-manager.ts` now persists reviewer session IDs and records `detachedReviewIds` on `reviewer.offline` events.
- SQLite continuity state: inspect `reviews.getContinuityState(reviewId)`, `audit.getLatestContinuityForReview(reviewId)`, and `audit.listContinuityForReview(reviewId)` for reason, action-required flags, reviewer session IDs, and claim generations.
- Startup/CLI surface: `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/m003-s01-inspect.sqlite --once` now emits the richer `startupRecovery` summary with detached/action-required counts and reviewer session IDs.

The durable audit rows now keep recovery reason, action-required state, reviewer IDs, reviewer session IDs, claim generations, and timestamps inspectable after timeout, reviewer exit, or restart without exposing patch bodies, secrets, or full child-process argv.

## Deviations

- The planner expected greenfield creation of `app-context.ts`, `reviewer-manager.ts`, `broker-service.ts`, `index.ts`, and the reviewer fixture, but those files already existed locally. I adapted T03 into a policy refactor and runtime hardening pass over the existing code instead of recreating them.
- I updated the older `packages/review-broker-server/test/reviewer-recovery.test.ts` coverage alongside the three planned T03 tests because the slice’s conservative detach rule intentionally changed previously-checked behavior for submitted work.

## Known Issues

- `packages/review-broker-server/test/recovery-status-surfaces.test.ts` and `packages/review-broker-server/test/end-to-end-continuity-proof.test.ts` are still intentional T04 placeholders, so the intermediate slice gate remains partially red by design.
- The root `broker:continuity` entrypoint still does not exist and continues to fail until T04 wires the supported continuity inspection command.

## Files Created/Modified

- `packages/review-broker-server/src/runtime/broker-service.ts` — unified timeout, reviewer-exit, and startup recovery around the repository-backed reclaim/detach helpers, added claim-timeout maintenance, and persisted reviewer-session ownership on claims.
- `packages/review-broker-server/src/runtime/reviewer-manager.ts` — added reviewer session IDs on spawn plus richer offline hook/audit payloads with detached-review reporting.
- `packages/review-broker-server/src/index.ts` — replaced bespoke startup recovery with the shared startup sweep and exposed the richer `StartupRecoverySummary` shape from `startBroker()`.
- `packages/review-broker-server/test/claim-timeout-recovery.test.ts` — replaced the placeholder with live timeout reclaim/detach proofs using the real reviewer fixture.
- `packages/review-broker-server/test/reviewer-exit-recovery.test.ts` — replaced the placeholder with real subprocess exit recovery proofs for both reclaim and detach outcomes.
- `packages/review-broker-server/test/startup-sweep.test.ts` — replaced the placeholder with a durable SQLite restart proof that startup cleanup runs before normal work.
- `packages/review-broker-server/test/reviewer-recovery.test.ts` — updated existing recovery coverage to match the conservative detach semantics for submitted work and the new continuity metadata shape.
- `.gsd/DECISIONS.md` — appended D010 documenting the opportunistic claim-timeout maintenance strategy.
- `.gsd/KNOWLEDGE.md` — recorded the `AppContext.close()` crash-simulation pattern for future startup-sweep tests.
- `.gsd/milestones/M003/slices/S01/S01-PLAN.md` — marked T03 complete.
