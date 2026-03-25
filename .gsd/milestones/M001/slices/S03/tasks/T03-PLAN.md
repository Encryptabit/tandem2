---
estimated_steps: 5
estimated_files: 6
skills_used:
  - gsd
  - best-practices
  - review
  - test
---

# T03: Expose reviewer spawn/list/kill through the broker runtime and CLI diagnostics

**Slice:** S03 — Reviewer lifecycle and recovery
**Milestone:** M001

## Description

Turn the reviewer manager foundation into broker-owned public behavior. This task should add runtime service methods, reviewer-state versioning, and operator-visible inspection output so a started broker can manage real reviewer processes through its supported API surface.

## Steps

1. Extend `packages/review-broker-server/src/runtime/broker-service.ts` with `spawnReviewer`, `listReviewers`, and `killReviewer` methods that use the reviewer manager and repository.
2. Keep reviewer lifecycle additive to S02 review semantics by preserving `claimReview()` support for arbitrary claimant IDs even when no reviewer row exists, while showing `assigned` status only when a live reviewer matches `reviews.claimed_by`.
3. Update `packages/review-broker-server/src/index.ts` so runtime inspection includes reviewer counts and a latest reviewer snapshot, and make shutdown/wait behavior reflect reviewer cleanup progress without leaving child processes behind.
4. Extend `packages/review-broker-server/src/cli/start-broker.ts` to report reviewer visibility in `--once` mode without leaking secret-bearing command metadata.
5. Add service-level and smoke-style coverage for spawn/list/kill plus reviewer inspection output.

## Must-Haves

- [ ] The started broker exposes public reviewer lifecycle methods instead of requiring tests or operators to reach into internal manager APIs.
- [ ] Existing review claim behavior remains backward-compatible for non-registered claimant IDs.
- [ ] Runtime/CLI diagnostics expose reviewer counts and last known reviewer state clearly enough to support later recovery debugging.

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/reviewer-lifecycle.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s03-lifecycle.sqlite --once`

## Observability Impact

- Signals added/changed: reviewer lifecycle versions/topics, reviewer counts, and latest reviewer snapshot fields exposed through runtime and CLI inspection.
- How a future agent inspects this: `packages/review-broker-server/test/reviewer-lifecycle.test.ts`, `packages/review-broker-server/test/start-broker.smoke.test.ts`, and `packages/review-broker-server/src/cli/start-broker.ts --once` output.
- Failure state exposed: spawn failures, offline reviewers, missing cleanup, and reviewer visibility drift become visible through service responses and structured once-mode diagnostics.

## Inputs

- `packages/review-broker-core/src/contracts.ts` — shared reviewer lifecycle contract from T01.
- `packages/review-broker-server/src/db/reviewers-repository.ts` — durable reviewer storage from T02.
- `packages/review-broker-server/src/runtime/app-context.ts` — runtime context already wired with reviewer infrastructure.
- `packages/review-broker-server/src/runtime/reviewer-manager.ts` — subprocess manager foundation from T02.
- `packages/review-broker-server/src/runtime/broker-service.ts` — current public broker surface to extend.
- `packages/review-broker-server/src/index.ts` — started runtime and inspection surface to enrich.
- `packages/review-broker-server/src/cli/start-broker.ts` — once-mode operator smoke path to extend.
- `.gsd/milestones/M001/slices/S03/tasks/T02-PLAN.md` — reviewer persistence and manager constraints from the previous task.

## Expected Output

- `packages/review-broker-server/src/runtime/broker-service.ts` — public reviewer lifecycle methods and additive claim semantics.
- `packages/review-broker-server/src/runtime/reviewer-manager.ts` — manager API refinements needed by the public runtime.
- `packages/review-broker-server/src/index.ts` — reviewer-aware runtime inspection and shutdown behavior.
- `packages/review-broker-server/src/cli/start-broker.ts` — reviewer-aware once-mode diagnostics.
- `packages/review-broker-server/test/reviewer-lifecycle.test.ts` — public spawn/list/kill runtime proof.
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — smoke proof updated for reviewer visibility.
