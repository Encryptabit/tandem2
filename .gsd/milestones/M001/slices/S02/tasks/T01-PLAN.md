---
estimated_steps: 4
estimated_files: 6
skills_used:
  - gsd
  - debug-like-expert
  - test
  - review
---

# T01: Reconcile the shared lifecycle contract and transition table

**Slice:** S02 — Full review lifecycle parity
**Milestone:** M001

## Description

Freeze the S02 lifecycle semantics in the shared TypeScript package before touching server logic. This task must make the core package the canonical source for verdict, discussion, close, requeue, activity, and counter-patch contracts so later runtime code can implement parity without inventing server-only shapes.

## Steps

1. Extend `packages/review-broker-core/src/domain.ts` with the additional audit vocabulary and shared summary/proposal fields S02 needs, including current round, verdict reason, message/activity metadata, and counter-patch status.
2. Add zod request/response schemas in `packages/review-broker-core/src/contracts.ts` for `submitVerdict`, `closeReview`, `addMessage`, `getDiscussion`, `getActivityFeed`, `acceptCounterPatch`, and `rejectCounterPatch`, and export them through `packages/review-broker-core/src/index.ts`.
3. Tighten `packages/review-broker-core/src/state-machine.ts` so `submitted` remains the TypeScript equivalent of legacy `in_review`, reviewer discussion can move `claimed -> submitted`, proposer follow-up after `changes_requested` can requeue to `pending`, and close only succeeds from `approved`.
4. Update the core tests to lock the new request/response shapes and transition rules as the preserved S02 contract.

## Must-Haves

- [ ] The shared contract exports concrete lifecycle schemas for verdict, discussion, activity, close, and counter-patch decisions instead of leaving those shapes implicit in server code.
- [ ] `submitted` is intentionally preserved as the TypeScript lifecycle state for active review discussion, and the transition tests make that mapping explicit.
- [ ] The core tests fail if a later task reopens close/requeue/counter-patch semantics without updating the frozen contract.

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/state-machine.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 build`

## Inputs

- `packages/review-broker-core/src/domain.ts` — current S01 lifecycle vocabulary that needs S02 expansion.
- `packages/review-broker-core/src/contracts.ts` — existing shared zod schemas that stop at create/claim/status/proposal/reclaim.
- `packages/review-broker-core/src/state-machine.ts` — current transition table that still allows overly broad close paths.
- `packages/review-broker-core/src/index.ts` — shared export surface for downstream packages.
- `packages/review-broker-core/test/contracts.test.ts` — existing contract proof file to extend.
- `packages/review-broker-core/test/state-machine.test.ts` — existing transition proof file to extend.
- `.gsd/milestones/M001/slices/S02/S02-PLAN.md` — slice goal, must-haves, and verification target.

## Expected Output

- `packages/review-broker-core/src/domain.ts` — expanded lifecycle domain vocabulary and shared payload fields.
- `packages/review-broker-core/src/contracts.ts` — shared lifecycle request/response schemas for S02 operations.
- `packages/review-broker-core/src/state-machine.ts` — tightened S02 transition table.
- `packages/review-broker-core/src/index.ts` — exported S02 contract surface.
- `packages/review-broker-core/test/contracts.test.ts` — contract proof for the new lifecycle schemas.
- `packages/review-broker-core/test/state-machine.test.ts` — transition proof for the S02 lifecycle mapping.

## Observability Impact

- Signals changed: the frozen core contract now names lifecycle audit vocabulary, round/verdict metadata, discussion/activity payload shapes, and invalid-transition expectations that later runtime work must persist and surface.
- How to inspect later: read `packages/review-broker-core/test/contracts.test.ts` and `packages/review-broker-core/test/state-machine.test.ts` for the canonical contract, and use invalid-transition assertions as the failure-path proof for this task.
- Failure state made visible: contract drift in verdict reason/current round/counter-patch fields or any reopening of close/requeue semantics should fail fast in the focused Vitest files with explicit schema or transition mismatches.
