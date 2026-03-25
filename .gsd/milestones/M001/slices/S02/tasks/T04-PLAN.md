---
estimated_steps: 4
estimated_files: 4
skills_used:
  - gsd
  - test
  - review
  - lint
---

# T04: Prove full lifecycle parity through end-to-end tests and smoke diagnostics

**Slice:** S02 — Full review lifecycle parity
**Milestone:** M001

## Description

Close the slice by proving the whole review lifecycle through a fresh runtime and by keeping the standalone smoke path informative after the second migration. This task should convert the focused T03 behaviors into an end-to-end parity proof that downstream slices can trust.

## Steps

1. Add `packages/review-broker-server/test/review-lifecycle-parity.test.ts` to cover at least two full lifecycle paths: create → claim → discussion → changes_requested → proposer follow-up requeue, and create → claim → approved → close with ordered activity output.
2. Update `packages/review-broker-server/test/restart-persistence.test.ts` so reopen proof covers the richer lifecycle metadata introduced in S02 rather than only the S01 claim state.
3. Update `packages/review-broker-server/test/start-broker.smoke.test.ts` and `packages/review-broker-server/src/cli/start-broker.ts` so the smoke path still proves clean startup after migration 002 and surfaces the migrated runtime state clearly.
4. Run the named slice verification commands exactly as written in `S02-PLAN.md`, adjusting the tests or CLI output until the full contract passes end to end.

## Must-Haves

- [ ] End-to-end parity proof exists in a dedicated Vitest file that exercises both requeue and close paths against the real runtime composition.
- [ ] Restart and smoke tests assert the S02 migration count and persisted lifecycle metadata rather than stopping at S01 row-count checks.
- [ ] The standalone CLI remains a trustworthy diagnostics surface for migrated lifecycle state after the new parity work lands.

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/review-lifecycle-parity.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s02-smoke.sqlite --once`

## Observability Impact

- Signals added/changed: end-to-end parity assertions over persisted lifecycle state and smoke-mode JSON diagnostics for the migrated broker runtime.
- How a future agent inspects this: by rerunning the dedicated parity/restart/smoke tests and by inspecting the SQLite DB created by `start-broker.ts --once`.
- Failure state exposed: migration-count mismatches, lost lifecycle metadata after reopen, and CLI/runtime drift all become mechanically reproducible failures.

## Inputs

- `packages/review-broker-server/src/runtime/broker-service.ts` — implemented S02 lifecycle behavior from T03.
- `packages/review-broker-server/src/cli/start-broker.ts` — standalone smoke path from S01 that must stay aligned with S02 state.
- `packages/review-broker-server/test/restart-persistence.test.ts` — existing reopen proof to enrich.
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — existing smoke proof to enrich.
- `.gsd/milestones/M001/slices/S02/S02-PLAN.md` — slice-level verification contract to satisfy exactly.
- `.gsd/milestones/M001/slices/S02/tasks/T03-PLAN.md` — focused runtime behaviors that the parity test must compose.

## Expected Output

- `packages/review-broker-server/test/review-lifecycle-parity.test.ts` — end-to-end S02 lifecycle proof.
- `packages/review-broker-server/test/restart-persistence.test.ts` — restart proof for persisted lifecycle metadata.
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — smoke proof for migration 002 and runtime diagnostics.
- `packages/review-broker-server/src/cli/start-broker.ts` — CLI diagnostics aligned with the S02 runtime state.
