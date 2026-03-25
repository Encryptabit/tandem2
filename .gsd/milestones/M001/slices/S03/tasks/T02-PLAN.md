---
estimated_steps: 5
estimated_files: 7
skills_used:
  - gsd
  - best-practices
  - debug-like-expert
  - test
---

# T02: Persist reviewer state and isolate child-process management

**Slice:** S03 — Reviewer lifecycle and recovery
**Milestone:** M001

## Description

Add the durable reviewer persistence seam and a dedicated runtime manager for reviewer child processes. This task should create the storage and orchestration foundation that S03 builds on while keeping process/listener cleanup isolated from `broker-service.ts`.

## Steps

1. Add `packages/review-broker-server/src/db/migrations/003_reviewer_lifecycle.sql` to create the reviewer-state table and indexes without editing prior migrations.
2. Implement `packages/review-broker-server/src/db/reviewers-repository.ts` to persist reviewer launch metadata, pid, liveness/offline timestamps, exit code, signal, and other redaction-safe runtime fields needed for inspection.
3. Add `packages/review-broker-server/src/runtime/reviewer-manager.ts` as the focused subprocess seam that spawns a real local reviewer fixture, updates durable state on start/exit/kill, and cleans up process listeners deterministically.
4. Wire the reviewers repository and manager into `packages/review-broker-server/src/runtime/app-context.ts`, keeping reviewer assignment derived from live reviewer rows plus `reviews.claimed_by` rather than storing a second assignment column.
5. Prove the migration and manager behavior with bootstrap coverage plus a focused manager test that exercises a real fixture process.

## Must-Haves

- [ ] Reviewer rows persist enough launch and exit metadata to support later list/kill/recovery flows and operator inspection.
- [ ] Reviewer subprocess orchestration lives in `reviewer-manager.ts`, not as ad hoc branches inside `broker-service.ts`.
- [ ] The manager test uses a real local child process fixture and demonstrates clean listener/process cleanup after spawn and stop.

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/reviewer-manager.test.ts`
- `test -f /home/cari/repos/tandem2/.gsd/worktrees/M001/packages/review-broker-server/test/fixtures/reviewer-worker.mjs`

## Observability Impact

- Signals added/changed: durable reviewer rows with pid/liveness/exit metadata and manager-observed offline transitions.
- How a future agent inspects this: `packages/review-broker-server/test/reviewer-manager.test.ts`, `packages/review-broker-server/test/sqlite-bootstrap.test.ts`, and direct reads from the `reviewers` table in the test database.
- Failure state exposed: stuck child processes, missing exit metadata, and migration drift become inspectable in focused test failures and persisted reviewer rows.

## Inputs

- `packages/review-broker-core/src/domain.ts` — reviewer status vocabulary already present and ready for durable server use.
- `packages/review-broker-core/src/contracts.ts` — shared reviewer lifecycle schemas produced by T01.
- `packages/review-broker-server/src/db/migrations/001_init.sql` — base migration pattern to extend additively.
- `packages/review-broker-server/src/db/migrations/002_review_lifecycle_parity.sql` — prior additive migration example.
- `packages/review-broker-server/src/runtime/app-context.ts` — runtime composition seam for repositories and manager wiring.
- `packages/review-broker-server/test/sqlite-bootstrap.test.ts` — existing schema/migration proof pattern.
- `.gsd/milestones/M001/slices/S03/tasks/T01-PLAN.md` — reviewer contract outputs and constraints from the previous task.

## Expected Output

- `packages/review-broker-server/src/db/migrations/003_reviewer_lifecycle.sql` — additive reviewer persistence schema.
- `packages/review-broker-server/src/db/reviewers-repository.ts` — durable reviewer row repository.
- `packages/review-broker-server/src/runtime/app-context.ts` — reviewer repository/manager wiring in the app context.
- `packages/review-broker-server/src/runtime/reviewer-manager.ts` — isolated reviewer subprocess manager.
- `packages/review-broker-server/test/sqlite-bootstrap.test.ts` — migration proof extended for reviewer state.
- `packages/review-broker-server/test/reviewer-manager.test.ts` — focused real-process manager proof.
- `packages/review-broker-server/test/fixtures/reviewer-worker.mjs` — local reviewer fixture process used by tests.
