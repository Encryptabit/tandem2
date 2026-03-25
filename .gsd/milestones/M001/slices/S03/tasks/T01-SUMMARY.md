---
id: T01
parent: S03
milestone: M001
provides:
  - Shared reviewer lifecycle contract for spawn/list/kill operations, reviewer audit vocabulary, and derived reviewer assignment fields in review-broker-core
key_files:
  - packages/review-broker-core/src/domain.ts
  - packages/review-broker-core/src/contracts.ts
  - packages/review-broker-core/test/reviewer-contracts.test.ts
key_decisions:
  - Kept reviewer assignment as a derived `currentReviewId` field on reviewer payloads and introduced `reviewer-state` as the shared list invalidation topic
patterns_established:
  - Regenerate checked-in `packages/review-broker-core/src/*.js` and `src/*.d.ts` siblings whenever shared TypeScript contract files change
observability_surfaces:
  - packages/review-broker-core/test/reviewer-contracts.test.ts
  - packages/review-broker-core/src/domain.ts reviewer enums and `reviewer-state` topic
  - packages/review-broker-core/src/contracts.ts reviewer schemas
duration: 1h
verification_result: passed
completed_at: 2026-03-21T12:05:02Z
blocker_discovered: false
---

# T01: Freeze reviewer lifecycle contracts and audit vocabulary

**Added shared reviewer spawn/list/kill contracts, reviewer audit vocabulary, and a focused core contract test.**

## What Happened

I fixed the pre-flight planning gaps first by adding an explicit failure-path slice verification line to `.gsd/milestones/M001/slices/S03/S03-PLAN.md` and an `## Observability Impact` section to `.gsd/milestones/M001/slices/S03/tasks/T01-PLAN.md`.

In `packages/review-broker-core/src/domain.ts`, I extended the shared vocabulary with reviewer offline reasons, reclaim causes, reviewer-global `reviewer.*` audit event names, the `reviewer-state` notification topic, and a shared `ReviewerRecord` shape that exposes redaction-safe launch/exit metadata plus the derived `currentReviewId` field.

In `packages/review-broker-core/src/contracts.ts`, I added reviewer schemas for `ReviewerRecord`, `spawnReviewer`, `listReviewers`, and `killReviewer`, including versioned list semantics and explicit kill outcomes. I also exported the reclaim-cause and reviewer-offline enums through the schema layer so downstream server work can reuse them instead of redefining literals.

I synchronized the checked-in runtime/type siblings by regenerating `packages/review-broker-core/src/domain.js`, `packages/review-broker-core/src/contracts.js`, `packages/review-broker-core/src/domain.d.ts`, and `packages/review-broker-core/src/contracts.d.ts`, then rebuilt the package so `dist/` matched the final source state.

I added `packages/review-broker-core/test/reviewer-contracts.test.ts` to freeze the reviewer payload shape, reviewer audit vocabulary, reclaim-cause enum, `reviewer-state` topic, derived `currentReviewId` field, and versioned spawn/list/kill contract semantics.

`packages/review-broker-core/src/index.ts` and `src/index.js` did not require code changes because the existing wildcard re-exports already surface the new domain and contract symbols.

## Verification

Task-level verification passed:
- `packages/review-broker-core/test/reviewer-contracts.test.ts` passed and locked the new reviewer contract surface.
- `review-broker-core` built successfully after the source/runtime/declaration sync.

Slice-level verification was run as well:
- The current existing server bootstrap/restart/smoke suite still passes.
- The real `start-broker.ts --once` inspection path still passes and emits structured JSON.
- The explicit `reviewer-recovery.test.ts` slice check fails with “No test files found,” which is expected at T01 because that proof belongs to T04.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/reviewer-contracts.test.ts` | 0 | ✅ pass | 0.95s |
| 2 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-core run build` | 0 | ✅ pass | 1.29s |
| 3 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/reviewer-lifecycle.test.ts packages/review-broker-server/test/reviewer-recovery.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts` | 0 | ✅ pass | 1.45s |
| 4 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/reviewer-recovery.test.ts` | 1 | ❌ fail | 0.49s |
| 5 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s03-smoke.sqlite --once` | 0 | ✅ pass | 0.52s |

## Diagnostics

Inspect the shared reviewer lifecycle surface in:
- `packages/review-broker-core/src/domain.ts` for reviewer enums, audit event names, reclaim causes, and the `ReviewerRecord` interface
- `packages/review-broker-core/src/contracts.ts` for reviewer spawn/list/kill schemas and versioned list semantics
- `packages/review-broker-core/test/reviewer-contracts.test.ts` for the focused contract lock

For runtime-adjacent slice diagnostics that still exist before later S03 tasks land, `packages/review-broker-server/src/cli/start-broker.ts --once` remains the fastest structured inspection surface.

## Deviations

- `packages/review-broker-core/src/index.ts` and `src/index.js` were verified but not edited because the existing wildcard re-export pattern already exposes the new reviewer symbols.
- I also regenerated the checked-in source declarations (`packages/review-broker-core/src/*.d.ts`) in addition to the planned `.ts`/`.js` targets because those source declaration files are part of this package’s checked-in contract surface and were otherwise stale.

## Known Issues

- `packages/review-broker-server/test/reviewer-recovery.test.ts` does not exist yet, so the explicit slice verification command for that file fails at T01 as expected.
- The combined server-suite slice command currently exits `0` by running only the existing files; it is not yet proof of reviewer lifecycle/recovery behavior until T02-T04 add their missing tests.

## Files Created/Modified

- `.gsd/milestones/M001/slices/S03/S03-PLAN.md` — added an explicit slice verification line for the reviewer recovery failure-path proof.
- `.gsd/milestones/M001/slices/S03/tasks/T01-PLAN.md` — added the missing `## Observability Impact` section.
- `.gsd/KNOWLEDGE.md` — recorded the repo-specific rule about regenerating checked-in source declarations alongside `src/*.js` siblings.
- `packages/review-broker-core/src/domain.ts` — added reviewer offline reasons, reclaim causes, reviewer audit event names, `reviewer-state`, and `ReviewerRecord`.
- `packages/review-broker-core/src/domain.js` — regenerated runtime JS sibling for the updated reviewer domain contract.
- `packages/review-broker-core/src/domain.d.ts` — regenerated source declaration for the updated reviewer domain contract.
- `packages/review-broker-core/src/contracts.ts` — added reviewer record, spawn/list/kill schemas, reviewer enums, and versioned reviewer list semantics.
- `packages/review-broker-core/src/contracts.js` — regenerated runtime JS sibling for the updated reviewer schemas.
- `packages/review-broker-core/src/contracts.d.ts` — regenerated source declaration for the updated reviewer schemas.
- `packages/review-broker-core/test/reviewer-contracts.test.ts` — added the focused reviewer lifecycle contract proof.
- `packages/review-broker-core/dist/domain.js` and `packages/review-broker-core/dist/domain.d.ts` — rebuilt package outputs for the updated reviewer domain surface.
- `packages/review-broker-core/dist/contracts.js` and `packages/review-broker-core/dist/contracts.d.ts` — rebuilt package outputs for the updated reviewer schema surface.
