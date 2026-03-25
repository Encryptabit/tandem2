---
estimated_steps: 4
estimated_files: 5
skills_used:
  - gsd
  - test
  - review
  - debug-like-expert
---

# T03: Implement verdict, discussion, activity, and counter-patch runtime flows

**Slice:** S02 — Full review lifecycle parity
**Milestone:** M001

## Description

Turn the shared contract and migrated storage into real broker behavior. This task should implement the S02 lifecycle methods inside `broker-service.ts` and prove them with focused server tests before the slice closes with an end-to-end parity scenario.

## Steps

1. Extend `packages/review-broker-server/src/runtime/broker-service.ts` with `submitVerdict`, `closeReview`, `addMessage`, `getDiscussion`, `getActivityFeed`, `acceptCounterPatch`, and `rejectCounterPatch`, parsing all inputs and outputs through the shared `review-broker-core` schemas.
2. Persist ordered discussion messages, round-aware requeue behavior, verdict reasons, counter-patch decisions, and close transitions through the repositories added in T02.
3. Ensure every lifecycle mutation writes durable audit rows and wakes both `review-queue` and `review-status:<reviewId>` when downstream wait semantics should observe the change.
4. Add focused service tests for discussion/requeue behavior, verdict and counter-patch behavior, and the enriched status/proposal/activity payloads.

## Must-Haves

- [ ] `broker-service.ts` implements all S02 lifecycle methods against durable SQLite state rather than temporary in-memory behavior.
- [ ] Discussion and verdict flows preserve chronological ordering, round tracking, and proposer requeue semantics after `changes_requested`.
- [ ] Counter-patch accept/reject decisions are visible through shared proposal/status payloads and persisted audit history.

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/broker-service.test.ts packages/review-broker-server/test/review-discussion.test.ts packages/review-broker-server/test/review-verdicts.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 build`

## Observability Impact

- Signals added/changed: durable lifecycle audit rows for verdict/message/close/counter-patch mutations and notification version bumps for queue and per-review waiters.
- How a future agent inspects this: via `packages/review-broker-server/test/broker-service.test.ts`, `packages/review-broker-server/test/review-discussion.test.ts`, `packages/review-broker-server/test/review-verdicts.test.ts`, and direct reads of `reviews`, `messages`, and `audit_events`.
- Failure state exposed: invalid transitions, missing discussion history, incorrect current round, and stale counter-patch state remain visible after the failed operation.

## Inputs

- `packages/review-broker-core/src/contracts.ts` — shared lifecycle payload schemas from T01.
- `packages/review-broker-core/src/state-machine.ts` — tightened S02 transition rules from T01.
- `packages/review-broker-server/src/db/reviews-repository.ts` — lifecycle-aware review persistence from T02.
- `packages/review-broker-server/src/db/messages-repository.ts` — durable discussion persistence from T02.
- `packages/review-broker-server/src/db/audit-repository.ts` — activity-feed persistence/query helpers from T02.
- `packages/review-broker-server/src/runtime/broker-service.ts` — existing S01 service surface to extend.
- `packages/review-broker-server/test/broker-service.test.ts` — existing durable service test harness to extend.
- `.gsd/milestones/M001/slices/S02/tasks/T02-PLAN.md` — storage behaviors this runtime must exercise.

## Expected Output

- `packages/review-broker-server/src/runtime/broker-service.ts` — implemented S02 lifecycle service methods.
- `packages/review-broker-server/src/index.ts` — exported runtime surface for the new broker methods if needed by tests and later slices.
- `packages/review-broker-server/test/broker-service.test.ts` — updated service proof for the enriched status/proposal/activity shape.
- `packages/review-broker-server/test/review-discussion.test.ts` — focused proof for chronological discussion and requeue behavior.
- `packages/review-broker-server/test/review-verdicts.test.ts` — focused proof for verdict and counter-patch behavior.
