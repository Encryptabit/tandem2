---
estimated_steps: 5
estimated_files: 6
skills_used:
  - gsd
  - debug-like-expert
  - review
  - test
---

# T04: Reclaim reviews on reviewer exit and prove restart-safe recovery

**Slice:** S03 — Reviewer lifecycle and recovery
**Milestone:** M001

## Description

Close the slice by making reviewer failure and stale-session recovery part of the runtime contract. This task should ensure reviewer exits leave durable evidence, limbo-prone reviews are reclaimed safely, and the restart/smoke path proves operators can inspect what happened.

## Steps

1. Extend `packages/review-broker-server/src/runtime/reviewer-manager.ts` and `packages/review-broker-server/src/runtime/broker-service.ts` so observed reviewer exits and operator kills append reviewer-global audit rows and trigger recovery hooks.
2. In `packages/review-broker-server/src/index.ts`, reconcile stale reviewer rows on startup and reclaim only `claimed` and `submitted` reviews using `claim_generation`-fenced updates plus per-review `review.reclaimed` metadata that records `reviewer_exit`, `operator_kill`, or `startup_recovery`.
3. Add `packages/review-broker-server/test/reviewer-recovery.test.ts` to prove live reviewer exit recovery and stale-claim protection against newer claims.
4. Extend `packages/review-broker-server/test/restart-persistence.test.ts` and `packages/review-broker-server/test/start-broker.smoke.test.ts` so restarted runtimes and once-mode inspection output show offline reviewers, recovery results, and redaction-safe failure metadata.
5. Re-run the real CLI once-mode smoke path against an S03 database and keep the output aligned with the automated proofs.

## Must-Haves

- [ ] Reviewer exit, operator kill, and startup recovery each leave durable audit/state evidence that operators can inspect later.
- [ ] Recovery reclaims only the intended limbo-prone review states and uses `claim_generation` fencing so a newer claim cannot be overwritten.
- [ ] Restart and once-mode inspection prove reviewer recovery state without requiring an attached debugger or console-only logs.

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/reviewer-recovery.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s03-smoke.sqlite --once`

## Observability Impact

- Signals added/changed: reviewer exit/offline audit events, recovery-cause metadata on `review.reclaimed`, and restart-visible reviewer failure snapshots.
- How a future agent inspects this: `packages/review-broker-server/test/reviewer-recovery.test.ts`, `packages/review-broker-server/test/restart-persistence.test.ts`, `packages/review-broker-server/test/start-broker.smoke.test.ts`, and CLI once-mode output against the seeded S03 smoke database.
- Failure state exposed: crashed reviewers, operator kills, stale-session recovery, and fenced reclaim failures remain visible through persisted tables and structured inspection output.

## Inputs

- `packages/review-broker-server/src/runtime/reviewer-manager.ts` — reviewer lifecycle hooks and subprocess observation from T03.
- `packages/review-broker-server/src/runtime/broker-service.ts` — public reviewer methods and existing reclaim semantics.
- `packages/review-broker-server/src/index.ts` — startup and inspection surface to extend for recovery.
- `packages/review-broker-server/src/db/reviews-repository.ts` — `claim_generation`-fenced review updates to reuse.
- `packages/review-broker-server/src/db/audit-repository.ts` — durable audit surface that already supports nullable `review_id`.
- `packages/review-broker-server/test/restart-persistence.test.ts` — restart-safe proof pattern to extend.
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — once-mode smoke proof to extend.
- `.gsd/milestones/M001/slices/S03/tasks/T03-PLAN.md` — public runtime and diagnostics outputs from the previous task.

## Expected Output

- `packages/review-broker-server/src/runtime/reviewer-manager.ts` — reviewer exit and recovery hooks.
- `packages/review-broker-server/src/runtime/broker-service.ts` — recovery-aware reclaim wiring and audit behavior.
- `packages/review-broker-server/src/index.ts` — startup reconciliation and reviewer-aware inspection output.
- `packages/review-broker-server/test/reviewer-recovery.test.ts` — focused reviewer exit/recovery proof.
- `packages/review-broker-server/test/restart-persistence.test.ts` — restart-safe reviewer recovery proof.
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — smoke proof updated for reviewer recovery diagnostics.
