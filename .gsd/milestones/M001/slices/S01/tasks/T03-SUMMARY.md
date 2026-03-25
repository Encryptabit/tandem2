---
id: T03
parent: S01
milestone: M001
provides:
  - Durable broker review service flows with workspace-root diff validation, persisted audit visibility, and claim-generation fencing
key_files:
  - packages/review-broker-server/src/runtime/app-context.ts
  - packages/review-broker-server/src/runtime/diff.ts
  - packages/review-broker-server/src/runtime/broker-service.ts
  - packages/review-broker-server/test/broker-service.test.ts
  - packages/review-broker-server/test/claim-concurrency.test.ts
  - packages/review-broker-server/test/fixtures/valid-review.diff
  - packages/review-broker-server/test/fixtures/invalid-review.diff
key_decisions:
  - D009: Validate submitted diffs against the resolved workspace root with `git apply --check`, while extracting affected files separately through `parse-diff` for storage and redacted audit metadata.
patterns_established:
  - Broker runtime composition lives in `app-context.ts`, which opens SQLite, resolves the workspace root, and binds repositories plus a versioned notification bus in one place.
  - Claim and reclaim flows fence with `claim_generation` compare-and-set writes, persist audit outcomes for both winners and losers, and bump notification versions only after successful state changes.
observability_surfaces:
  - `packages/review-broker-server/test/broker-service.test.ts` and `packages/review-broker-server/test/claim-concurrency.test.ts`
  - SQLite `audit_events` rows for `review.created`, `review.claimed`, `review.reclaimed`, `review.diff_rejected`, and `review.transition_rejected`
  - Review-status wait/version behavior exercised through the versioned notification bus in broker-service tests
duration: 1h 24m
verification_result: passed
completed_at: 2026-03-21T03:08:35-07:00
blocker_discovered: false
---

# T03: Implement broker review flows with diff validation and fencing

**Added workspace-root diff validation and durable broker review flows with fenced claiming.**

## What Happened

I introduced `packages/review-broker-server/src/runtime/app-context.ts` to compose the resolved workspace root, opened SQLite database, repositories, and a shared `VersionedNotificationBus` into one runtime object that later tasks can reuse for the standalone CLI. That gives the server package one explicit place to bind DB lifecycle and runtime dependencies instead of having tests or future entrypoints hand-wire them ad hoc.

I then added `packages/review-broker-server/src/runtime/diff.ts` to validate proposals with `git apply --check` against the resolved workspace root and to extract affected files with `parse-diff`. The important local adaptation was validating against the real checked-out repository rather than an empty scratch tree: that preserves correct behavior for diffs that modify existing files while still letting the service reject invalid or non-applicable proposals. The diff validator surfaces structured error codes and affected-file metadata without persisting patch bodies.

On top of that runtime layer, I implemented `packages/review-broker-server/src/runtime/broker-service.ts` for the S01 review surfaces: `createReview`, `listReviews`, `claimReview`, `getReviewStatus`, `getProposal`, and `reclaimReview`. The service parses all inputs and outputs through the shared `review-broker-core` schemas, persists success and failure audit rows, uses `claim_generation` compare-and-set updates for durable single-winner claim fencing, and bumps queue/status notification versions only after successful state mutations. Invalid diff submissions write a redacted `review.diff_rejected` audit row without inserting a review, and losing claimants receive a deterministic `stale` outcome backed by a persisted `review.transition_rejected` audit event.

I added the parity-style proof files from the task plan: valid and invalid diff fixtures, `broker-service.test.ts` for create/list/status/proposal/reclaim plus invalid-diff and status-wait behavior, and `claim-concurrency.test.ts` for the single-winner claim race across multiple app contexts on the same SQLite file. I also updated the server package manifest and exports so the new runtime surfaces build as part of the workspace.

## Verification

I first ran the task-level broker tests and then the workspace build. The precise broker test files pass directly under Vitest, and the workspace build now compiles both packages cleanly with the new runtime exports and `parse-diff` dependency.

For observability, the broker-service tests verify the persisted `audit_events` rows for create/claim/reclaim, confirm `review.diff_rejected` rows appear without creating a review, and prove `getReviewStatus(..., wait: true, sinceVersion)` wakes after a claim mutates the review-status topic. The concurrency test proves exactly one claimant wins across separate SQLite connections and that the losing attempt is inspectable afterward as a durable rejected transition.

Per the slice instructions, I also ran the full S01 verification set. The full slice test wrapper still exits `0` while only the currently existing T01-T03 test files run, so it remains a semantic partial pass until T04 adds `restart-persistence.test.ts` and `start-broker.smoke.test.ts`. The two smoke commands still fail exactly where expected for an intermediate task because `src/cli/start-broker.ts` and the smoke DB creation belong to T04.

I also attempted LSP diagnostics on the new TypeScript files, but no language server was available in this harness, so build output remained the static-analysis source of truth for this task.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/broker-service.test.ts packages/review-broker-server/test/claim-concurrency.test.ts` | 0 | ✅ pass | 0.98s |
| 2 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 test -- --run packages/review-broker-server/test/broker-service.test.ts packages/review-broker-server/test/claim-concurrency.test.ts` | 0 | ✅ pass | 1.08s |
| 3 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 build` | 0 | ✅ pass | 2.19s |
| 4 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 test -- --run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/state-machine.test.ts packages/review-broker-core/test/notifications.test.ts packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/path-resolution.test.ts packages/review-broker-server/test/broker-service.test.ts packages/review-broker-server/test/claim-concurrency.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts` | 0 | ❌ fail | 1.08s |
| 5 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s01-smoke.sqlite --once` | 1 | ❌ fail | 0.47s |
| 6 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx -e "import Database from 'better-sqlite3'; const db = new Database('./.tmp/s01-smoke.sqlite', { readonly: true }); const reviewCount = db.prepare('select count(*) as count from reviews').get(); const auditCount = db.prepare('select count(*) as count from audit_events').get(); const migrationCount = db.prepare('select count(*) as count from schema_migrations').get(); console.log(JSON.stringify({ reviewCount, auditCount, migrationCount })); db.close();"` | 1 | ❌ fail | 0.54s |

## Diagnostics

Inspect the T03 runtime through:

- `packages/review-broker-server/test/broker-service.test.ts` for valid create/list/status/proposal/reclaim flows, invalid diff rejection, redacted audit metadata, and review-status wait/version proof.
- `packages/review-broker-server/test/claim-concurrency.test.ts` for the single-winner claim race and durable stale-claim audit proof across multiple app contexts.
- SQLite `audit_events` for `review.created`, `review.claimed`, `review.reclaimed`, `review.diff_rejected`, and `review.transition_rejected` rows, including `error_code` values like `INVALID_DIFF` and `STALE_CLAIM_GENERATION`.
- `packages/review-broker-server/src/runtime/diff.ts` for the workspace-root `git apply --check` path and redacted affected-file extraction.
- `packages/review-broker-server/src/runtime/broker-service.ts` for notification topic bumps and compare-and-set fencing via `expectedClaimGeneration`.

## Deviations

- I added a direct `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run ...` verification command alongside the task-plan wrapper because the root `test` script is `vitest`, and in this harness `pnpm test -- --run ...` still executes the broader suite instead of providing exact file-scoped evidence.

## Known Issues

- The full slice test wrapper still behaves as a partial proof at T03 because the T04 files `packages/review-broker-server/test/restart-persistence.test.ts` and `packages/review-broker-server/test/start-broker.smoke.test.ts` do not exist yet, even though the wrapper exits `0`.
- The slice smoke commands still fail because `packages/review-broker-server/src/cli/start-broker.ts` and the smoke DB lifecycle are planned for T04, not T03.
- No TypeScript language server was available in this harness, so static verification for this task relied on `tsc` and Vitest rather than LSP diagnostics.

## Files Created/Modified

- `packages/review-broker-server/package.json` — added the `parse-diff` runtime dependency needed for affected-file extraction.
- `packages/review-broker-server/src/runtime/app-context.ts` — added the runtime composition layer for resolved paths, SQLite open/close lifecycle, repositories, and notifications.
- `packages/review-broker-server/src/runtime/diff.ts` — added workspace-root `git apply --check` validation, affected-file extraction, and structured diff validation errors.
- `packages/review-broker-server/src/runtime/broker-service.ts` — implemented the S01 broker service methods, audit persistence, notification bumps, and claim-generation fencing.
- `packages/review-broker-server/src/index.ts` — exported the new runtime surfaces for later CLI/runtime composition.
- `packages/review-broker-server/test/broker-service.test.ts` — added create/list/status/proposal/reclaim, invalid-diff, and wait/version proof.
- `packages/review-broker-server/test/claim-concurrency.test.ts` — added the durable single-winner claim race proof.
- `packages/review-broker-server/test/fixtures/valid-review.diff` — added the valid proposal diff fixture used by service tests.
- `packages/review-broker-server/test/fixtures/invalid-review.diff` — added the invalid proposal diff fixture used for rejection proof.
- `pnpm-lock.yaml` — updated the workspace lockfile for the new `parse-diff` dependency.
- `.gsd/DECISIONS.md` — recorded D009 for workspace-root diff validation and redacted affected-file extraction.
- `.gsd/KNOWLEDGE.md` — recorded the root `pnpm test -- --run ...` verification-wrapper gotcha for future tasks.
