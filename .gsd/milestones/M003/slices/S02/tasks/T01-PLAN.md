---
estimated_steps: 4
estimated_files: 6
skills_used:
  - gsd
  - test
  - debug-like-expert
---

# T01: Extend runtime continuity inspection and refresh restart proof

**Slice:** S02 — Restart sweep and continuity commands
**Milestone:** M003

## Description

Repair the red restart baseline while adding the missing runtime-wide continuity read model. This task should not change the reclaim-vs-detach policy from S01; it should make restart effects inspectable in one place and lock the existing startup behavior into durable proof.

## Steps

1. Extend `packages/review-broker-server/src/db/audit-repository.ts` with a cross-review continuity query that can return recent recovery entries without requiring per-review timeline stitching.
2. Update `packages/review-broker-server/src/runtime/status-service.ts` and `packages/review-broker-server/src/index.ts` so the runtime continuity snapshot includes recent recovery history alongside current ownership, action-required state, and latest recovery data.
3. Refresh `packages/review-broker-server/test/restart-persistence.test.ts` and `packages/review-broker-server/test/start-broker.smoke.test.ts` to the shipped S01 contract: additive migration `004_review_continuity`, startup reclaim-vs-detach behavior, startup ordering, and structured recovery summary fields.
4. Add `packages/review-broker-server/test/runtime-continuity-inspection.test.ts` to prove the new snapshot answers current ownership, recent recovery actions, reviewer state, and action-required cases from one durable SQLite database.

## Must-Haves

- [ ] The task preserves S01’s shared reclaim/detach semantics; it must not introduce a startup-only recovery fork.
- [ ] Runtime continuity inspection returns recent cross-review recovery activity from supported broker read models rather than raw ad hoc SQL in CLI code.
- [ ] The restart and smoke tests prove startup cleanup and visible recovery summary fields against the real runtime contract now in the repo.

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts packages/review-broker-server/test/runtime-continuity-inspection.test.ts`
- `test -f /home/cari/repos/tandem2/.gsd/worktrees/M003/packages/review-broker-server/test/runtime-continuity-inspection.test.ts`

## Observability Impact

- Signals added/changed: runtime continuity snapshots gain a recent recovery feed in addition to ownership, latest recovery, and action-required state.
- How a future agent inspects this: run the named Vitest lane, then inspect `packages/review-broker-server/src/runtime/status-service.ts` output or `inspectBrokerRuntime()` on the same SQLite file.
- Failure state exposed: stale restart expectations, wrong reclaim-vs-detach behavior, or missing recovery visibility become direct test failures with persisted review/reviewer/audit rows to inspect.

## Inputs

- `.gsd/milestones/M003/slices/S02/S02-PLAN.md` — slice goal, must-haves, and verification targets.
- `packages/review-broker-server/src/db/audit-repository.ts` — existing per-review continuity query seam.
- `packages/review-broker-server/src/runtime/status-service.ts` — current runtime continuity read model.
- `packages/review-broker-server/src/index.ts` — broker runtime snapshot and `--once` composition.
- `packages/review-broker-server/test/restart-persistence.test.ts` — stale restart expectations that need to match the S01 contract.
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — stale CLI once expectations for migrations and recovery fields.

## Expected Output

- `packages/review-broker-server/src/db/audit-repository.ts` — cross-review continuity-history query for operator inspection.
- `packages/review-broker-server/src/runtime/status-service.ts` — runtime continuity snapshot extended with recent recovery activity.
- `packages/review-broker-server/src/index.ts` — runtime snapshot export updated to carry the richer continuity data.
- `packages/review-broker-server/test/restart-persistence.test.ts` — restart proof aligned with the S01 migration and detach/reclaim semantics.
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — CLI once proof aligned with current recovery summary fields.
- `packages/review-broker-server/test/runtime-continuity-inspection.test.ts` — focused proof for the new runtime-wide continuity snapshot.
