---
id: T01
parent: S02
milestone: M001
provides:
  - Frozen S02 review lifecycle schemas and approved-only transition rules in review-broker-core
key_files:
  - packages/review-broker-core/src/domain.ts
  - packages/review-broker-core/src/contracts.ts
  - packages/review-broker-core/src/state-machine.ts
  - packages/review-broker-core/test/contracts.test.ts
  - packages/review-broker-core/test/state-machine.test.ts
  - packages/review-broker-server/src/db/reviews-repository.ts
  - packages/review-broker-server/src/runtime/broker-service.ts
key_decisions:
  - D012: Expose a shared lifecycle snapshot on ReviewSummary and ReviewProposal
patterns_established:
  - Update checked-in packages/review-broker-core/src/*.js siblings when core runtime contracts change, because Vitest executes those JS entrypoints directly in this repo
observability_surfaces:
  - packages/review-broker-core/test/contracts.test.ts
  - packages/review-broker-core/test/state-machine.test.ts
  - .gsd/DECISIONS.md
  - .gsd/KNOWLEDGE.md
duration: 35m
verification_result: passed
completed_at: 2026-03-21T03:46:27.6261474-07:00
blocker_discovered: false
---

# T01: Reconcile the shared lifecycle contract and transition table

**Froze the S02 lifecycle contract with lifecycle snapshot fields, new lifecycle operation schemas, and approved-only close transitions.**

## What Happened

I fixed the pre-flight plan gaps first by adding an explicit failure-path verification step to `S02-PLAN.md` and an `## Observability Impact` section to `T01-PLAN.md`.

In `packages/review-broker-core/src/domain.ts`, I expanded the shared vocabulary with `LEGACY_IN_REVIEW_STATUS`, verdict/counter-patch/message-role enums, new audit event types, and dedicated discussion/activity interfaces. I also added the shared lifecycle snapshot fields that later tasks need on both `ReviewSummary` and `ReviewProposal`: `currentRound`, `latestVerdict`, `verdictReason`, `counterPatchStatus`, `lastMessageAt`, and `lastActivityAt`.

In `packages/review-broker-core/src/contracts.ts`, I added concrete zod schemas and inferred types for `submitVerdict`, `closeReview`, `addMessage`, `getDiscussion`, `getActivityFeed`, `acceptCounterPatch`, and `rejectCounterPatch`, plus the shared discussion/activity payload schemas those operations return. `packages/review-broker-core/src/index.ts` already re-exported the contracts and domain surface, so no index change was needed to expose the new schemas.

In `packages/review-broker-core/src/state-machine.ts`, I tightened the frozen transition table so `submitted` remains the TypeScript equivalent of legacy `in_review`, `claimed -> submitted` remains valid for active reviewer discussion, `changes_requested -> pending` is the only requeue path, and `approved -> closed` is the only close path.

In the core tests, I extended `packages/review-broker-core/test/contracts.test.ts` and `packages/review-broker-core/test/state-machine.test.ts` to lock the new request/response shapes, lifecycle snapshot fields, invalid-transition failure paths, and the explicit `submitted === legacy in_review` mapping.

Local reality required one small compatibility adjustment outside the original file list: because this repo keeps checked-in `packages/review-broker-core/src/*.js` runtime siblings and Vitest loads those files directly, I synced the JS entrypoints alongside the TypeScript sources. I also added default lifecycle snapshot values in `packages/review-broker-server/src/db/reviews-repository.ts` and `packages/review-broker-server/src/runtime/broker-service.ts` so the existing S01 server code still builds and returns contract-shaped review/proposal payloads while T02-T04 implement the real persisted lifecycle behavior.

## Verification

I ran the focused T01 verification commands first. The core Vitest suite passed with the new contract and transition rules, and the monorepo build passed after the minimal server compatibility updates.

I then ran the full slice verification contract as required for an intermediate task. The existing server/bootstrap/smoke checks still pass against the expanded shared contract, which confirms the compatibility defaults are sound. The new slice-level targeted failure-path command fails right now because `packages/review-broker-server/test/review-lifecycle-parity.test.ts` has not been created yet; that is expected work for later tasks in this slice, not a blocker for T01.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/state-machine.test.ts` | 0 | ✅ pass | 0.98s |
| 2 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 build` | 0 | ✅ pass | 2.42s |
| 3 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/broker-service.test.ts packages/review-broker-server/test/review-discussion.test.ts packages/review-broker-server/test/review-verdicts.test.ts packages/review-broker-server/test/review-lifecycle-parity.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts` | 0 | ✅ pass | 1.34s |
| 4 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/review-lifecycle-parity.test.ts --testNamePattern "invalid lifecycle transitions remain inspectable"` | 1 | ❌ fail | 0.48s |
| 5 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s02-smoke.sqlite --once` | 0 | ✅ pass | 0.54s |

## Diagnostics

The canonical inspection surfaces for this task are `packages/review-broker-core/test/contracts.test.ts` and `packages/review-broker-core/test/state-machine.test.ts`; they now fail fast on lifecycle field drift, missing operation schemas, invalid close/requeue semantics, or accidental reopening of the frozen transition table.

`validateTransition()` and `assertTransition()` in `packages/review-broker-core/src/state-machine.ts` remain the simplest failure-path inspection points for close/requeue regressions. Decision D012 in `.gsd/DECISIONS.md` records the shared lifecycle snapshot choice, and `.gsd/KNOWLEDGE.md` now documents the checked-in `src/*.js` runtime-file gotcha that affected verification here.

The existing `start-broker.ts --once` smoke output remains a useful structured diagnostic surface; on this task it still emitted `broker.started` and `broker.once_complete` JSON successfully after the contract expansion.

## Deviations

- Added the requested pre-flight observability fixes to `.gsd/milestones/M001/slices/S02/S02-PLAN.md` and `.gsd/milestones/M001/slices/S02/tasks/T01-PLAN.md` before implementation.
- Synced checked-in `packages/review-broker-core/src/*.js` runtime files and added default lifecycle snapshot values in two server mappers so the existing build/tests consume the frozen contract immediately. This was a local-reality compatibility fix, not an S02 server-behavior implementation.

## Known Issues

- `packages/review-broker-server/test/review-lifecycle-parity.test.ts` does not exist yet, so the new slice-level failure-path verification command fails until T04 creates that file.
- Real persisted verdict/discussion/activity/counter-patch behavior is still pending in T02-T04; the server currently exposes default lifecycle snapshot values rather than durable S02 state.

## Files Created/Modified

- `.gsd/milestones/M001/slices/S02/S02-PLAN.md` — added the missing slice-level failure-path verification step and marked T01 complete.
- `.gsd/milestones/M001/slices/S02/tasks/T01-PLAN.md` — added the missing Observability Impact section.
- `packages/review-broker-core/src/domain.ts` — expanded the shared lifecycle vocabulary and payload interfaces.
- `packages/review-broker-core/src/contracts.ts` — added the concrete S02 lifecycle request/response, discussion, and activity schemas.
- `packages/review-broker-core/src/state-machine.ts` — tightened the frozen transition table to approved-only close and pending-only requeue.
- `packages/review-broker-core/src/domain.js` — synced the checked-in runtime JS export surface with the new domain contract.
- `packages/review-broker-core/src/contracts.js` — synced the checked-in runtime JS schemas with the new contract.
- `packages/review-broker-core/src/state-machine.js` — synced the checked-in runtime JS transition table with the frozen TS source.
- `packages/review-broker-core/test/contracts.test.ts` — locked the new shared lifecycle schemas and payload shapes.
- `packages/review-broker-core/test/state-machine.test.ts` — locked the explicit legacy `in_review` mapping and the tightened transition rules.
- `packages/review-broker-server/src/db/reviews-repository.ts` — defaulted new lifecycle snapshot fields for existing persisted review rows.
- `packages/review-broker-server/src/runtime/broker-service.ts` — forwarded the new lifecycle snapshot fields through current summary/proposal mappers.
- `.gsd/DECISIONS.md` — recorded D012 for the shared lifecycle snapshot payload choice.
- `.gsd/KNOWLEDGE.md` — documented the checked-in core JS runtime-file verification gotcha.
