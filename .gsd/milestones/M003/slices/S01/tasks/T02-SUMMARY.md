---
id: T02
parent: S01
milestone: M003
provides:
  - Durable SQLite continuity columns plus transactional reclaim/detach repository primitives with machine-readable audit evidence.
key_files:
  - packages/review-broker-server/src/db/migrations/004_review_continuity.sql
  - packages/review-broker-server/src/db/open-database.ts
  - packages/review-broker-server/src/db/audit-repository.ts
  - packages/review-broker-server/src/db/reviews-repository.ts
  - packages/review-broker-server/src/db/reviewers-repository.ts
  - packages/review-broker-server/test/sqlite-bootstrap.test.ts
  - packages/review-broker-server/test/recovery-transitions.test.ts
key_decisions:
  - Added continuity state as a new `004_review_continuity` migration instead of rewriting `001`-`003`, preserving checksum compatibility for existing SQLite files and inspect databases.
patterns_established:
  - Persist continuity state in two layers: current ownership/action-required fields on `reviews`, and canonical machine-readable recovery snapshots in `audit_events` so later status/timeline surfaces can reconstruct outcomes without guessing.
observability_surfaces:
  - `packages/review-broker-server/src/db/migrations/004_review_continuity.sql`; `createAuditRepository().listContinuityForReview()` / `getLatestContinuityForReview()`; `reviews.getContinuityState()`; SQLite `reviews`, `reviewers`, `audit_events`, and `schema_migrations` tables
duration: 1h15m
verification_result: passed
completed_at: 2026-03-24T07:03:20Z
blocker_discovered: false
---

# T02: Persist continuity state and transactional recovery primitives

**Added additive continuity migrations plus transactional reclaim/detach SQLite helpers that fence stale claim generations and persist inspectable recovery evidence.**

## What Happened

The local repo was ahead of the planner’s snapshot again: `review-broker-server`, the SQLite bootstrap, and the first three migrations already existed. I adapted T02 to that reality instead of rewriting the existing schema history.

I added `packages/review-broker-server/src/db/migrations/004_review_continuity.sql` to extend the durable schema with the continuity fields S01 needs without invalidating historical migration checksums: `reviews.reviewer_session_id`, `reviews.recovery_reason`, `reviews.action_required`, `reviews.action_required_reason`, `reviewers.reviewer_session_id`, and an action-required index. I also added a small `withTransaction()` helper in `open-database.ts` so the DB layer exposes the transaction pattern used by the new persistence primitives.

In `packages/review-broker-server/src/db/audit-repository.ts` I kept the existing generic audit API but added continuity-specific helpers that write and read canonical recovery snapshots. `appendContinuityEvent()` now stores machine-readable ownership, reason, outcome, action-required, and generation fields, while `listContinuityForReview()` and `getLatestContinuityForReview()` reconstruct typed continuity entries for later runtime status/timeline work.

In `packages/review-broker-server/src/db/reviews-repository.ts` I extended the persisted review state with continuity metadata and added two transactional helpers: `reclaimForRecovery()` for clearly safe recovery back to `pending`, and `detachForRecovery()` for ambiguous open work that must stay attached but marked action-required. Both helpers fence on `claim_generation`, `claimed_by`, and `reviewer_session_id`, and both emit their audit evidence in the same SQLite transaction. Rejections are also durable via `review.transition_rejected` with stale-vs-not-recoverable details.

In `packages/review-broker-server/src/db/reviewers-repository.ts` I added persisted reviewer session tracking and a `getSessionRecord()` accessor so later runtime code can connect review ownership to a specific reviewer process session instead of only a reviewer ID. I also updated `createAppContext()` to construct the reviews repository with audit wiring so T03/T04 can consume these helpers directly.

Finally, I replaced the T02 placeholder in `packages/review-broker-server/test/recovery-transitions.test.ts` with real SQLite proofs for: safe reclaim, ambiguous detach, and stale-generation fencing. I also extended `sqlite-bootstrap.test.ts` to assert the new continuity columns, migration, and index.

## Verification

I first ran the task’s two named tests directly and both passed. I then ran the exact task-plan file-existence check. After that I ran the slice-level verification bundle required by the execution contract. The slice’s first verification command now passes end-to-end for T01+T02. The remaining slice commands still fail only where expected for later work: T03/T04 placeholder tests remain intentionally unreplaced, and the root `broker:continuity` entry still does not exist because that is owned by T04. The `start-broker.ts --once` command succeeds and now reports the additive fourth migration in its once output.

Language-server diagnostics were unavailable in this harness (`No language server found` for the modified TS files), so the concrete source-of-truth verification remained Vitest plus the real CLI/SQLite checks above.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/recovery-transitions.test.ts` | 0 | ✅ pass | 1.243s |
| 2 | `test -f /home/cari/repos/tandem2/.gsd/worktrees/M003/packages/review-broker-server/src/db/migrations/001_init.sql` | 0 | ✅ pass | 0.001s |
| 3 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-core/test/continuity-contracts.test.ts packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/recovery-transitions.test.ts` | 0 | ✅ pass | 1.020s |
| 4 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/claim-timeout-recovery.test.ts packages/review-broker-server/test/reviewer-exit-recovery.test.ts packages/review-broker-server/test/startup-sweep.test.ts packages/review-broker-server/test/recovery-status-surfaces.test.ts` | 1 | ❌ fail | 0.845s |
| 5 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/end-to-end-continuity-proof.test.ts` | 1 | ❌ fail | 0.800s |
| 6 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 broker:continuity` | 243 | ❌ fail | 0.291s |
| 7 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/m003-s01-inspect.sqlite --once` | 0 | ✅ pass | 0.815s |

## Diagnostics

Future agents can inspect the continuity substrate at three levels:

- Schema/bootstrap: `packages/review-broker-server/src/db/migrations/004_review_continuity.sql` and `packages/review-broker-server/test/sqlite-bootstrap.test.ts`.
- Repository-level recovery evidence: `packages/review-broker-server/test/recovery-transitions.test.ts`, `reviews.getContinuityState()`, and `audit.listContinuityForReview()` / `audit.getLatestContinuityForReview()`.
- Runtime/CLI bootstrap visibility: `corepack pnpm --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/m003-s01-inspect.sqlite --once`, which now reports migration `004_review_continuity` in the once snapshot.

The persisted recovery evidence now keeps review IDs, reviewer IDs, reviewer session IDs, claim generations, timestamps, reasons, outcomes, and action-required flags inspectable without exposing patch bodies or full subprocess argv.

## Deviations

- The planner expected T02 to create the server package and initial migration from scratch, but those already existed locally. I adapted the task by extending the existing SQLite/runtime substrate instead of rebuilding it.
- Rather than editing `001_init.sql` or the prior checked-in migrations, I introduced a new additive `004_review_continuity.sql` migration so existing SQLite files keep passing checksum validation on reopen.

## Known Issues

- `packages/review-broker-server/test/claim-timeout-recovery.test.ts`, `reviewer-exit-recovery.test.ts`, `startup-sweep.test.ts`, `recovery-status-surfaces.test.ts`, and `end-to-end-continuity-proof.test.ts` are still intentional later-task placeholders, so the slice-level verification bundle remains partially red.
- The root `broker:continuity` script still does not exist and continues to fail until T04 wires it.
- The runtime has the new persistence primitives available through `AppContext`, but the higher-level status/timeline/once recovery surfaces are still incomplete until T03/T04 adopt the continuity helpers end-to-end.

## Files Created/Modified

- `packages/review-broker-server/src/db/migrations/004_review_continuity.sql` — added the additive continuity schema for reviewer session ownership, review recovery state, and action-required indexing.
- `packages/review-broker-server/src/db/open-database.ts` — preserved WAL/idempotent bootstrap and added the shared `withTransaction()` helper for repository recovery work.
- `packages/review-broker-server/src/db/audit-repository.ts` — added canonical continuity audit writes/reads via `appendContinuityEvent()`, `listContinuityForReview()`, and `getLatestContinuityForReview()`.
- `packages/review-broker-server/src/db/reviews-repository.ts` — added persisted continuity fields plus transactional `reclaimForRecovery()` / `detachForRecovery()` helpers and continuity-state inspection.
- `packages/review-broker-server/src/db/reviewers-repository.ts` — added durable reviewer session persistence and `getSessionRecord()` for session-aware ownership inspection.
- `packages/review-broker-server/src/runtime/app-context.ts` — wired the reviews repository to the audit repository so later runtime tasks can call the new transactional helpers directly.
- `packages/review-broker-server/test/sqlite-bootstrap.test.ts` — extended bootstrap coverage to assert the continuity columns, additive migration, and new index.
- `packages/review-broker-server/test/recovery-transitions.test.ts` — replaced the placeholder with real reclaim/detach/fencing proofs against SQLite.
- `.gsd/DECISIONS.md` — appended decision D009 documenting the additive continuity migration strategy.
