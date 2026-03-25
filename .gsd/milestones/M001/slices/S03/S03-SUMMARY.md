---
id: S03
parent: M001
milestone: M001
status: complete
validated_requirements:
  - R005
  - R010
advanced_requirements:
  - R001
  - R012
---

# S03: Reviewer lifecycle and recovery

## Outcome
S03 completed the standalone broker’s reviewer lifecycle and recovery slice. The TypeScript runtime now owns reviewer spawn/list/kill behavior, persists reviewer process state durably in SQLite, reclaims limbo-prone reviews when reviewers exit or stale sessions are recovered, and exposes reviewer/failure diagnostics through both runtime inspection and the real `start-broker.ts --once` path.

This slice did **not** add the typed client or MCP surfaces yet, but it finished the broker-owned reviewer lifecycle contract and inspectable recovery behavior that those later integration slices will consume.

## What this slice delivered

### 1. Frozen shared reviewer lifecycle contract in `review-broker-core`
`packages/review-broker-core` now defines the canonical reviewer vocabulary and payloads for:
- reviewer statuses: `idle`, `assigned`, `offline`
- reviewer offline reasons: `spawn_failed`, `reviewer_exit`, `operator_kill`, `startup_recovery`
- reclaim causes: `reviewer_exit`, `operator_kill`, `startup_recovery`
- reviewer-global audit events: `reviewer.spawned`, `reviewer.spawn_failed`, `reviewer.killed`, `reviewer.offline`
- versioned `spawnReviewer`, `listReviewers`, and `killReviewer` request/response schemas
- the `reviewer-state` notification topic for reviewer-list invalidation
- the shared `ReviewerRecord` shape with a **derived** `currentReviewId` field instead of a duplicated assignment column

That means S04 can wrap one frozen reviewer contract across typed client and MCP surfaces rather than inventing reviewer payloads per caller.

### 2. Additive durable reviewer persistence and isolated process management
`packages/review-broker-server` added migration `003_reviewer_lifecycle.sql`, a dedicated `reviewers` table, and `reviewers-repository.ts` for reviewer launch/offline metadata. The repository derives reviewer `status` and `currentReviewId` by joining live reviewer rows against `reviews.claimed_by` for active `claimed` / `submitted` reviews instead of persisting a second assignment source of truth.

Reviewer subprocess ownership now lives in `src/runtime/reviewer-manager.ts`, which:
- spawns real local reviewer child processes
- records durable spawn success/failure and offline transitions
- emits reviewer-global audit rows
- bumps `reviewer-state` versions for list waiters
- sanitizes persisted command metadata to basename/relative-path form
- detaches listeners before teardown so late exits do not write into a closed SQLite handle

This established the S03 pattern that subprocess orchestration belongs in a focused runtime seam, not inside the main broker service.

### 3. Public broker-owned reviewer spawn/list/kill operations
`broker-service.ts` now exposes public reviewer lifecycle methods backed by the shared schemas and reviewer manager:
- `spawnReviewer`
- `listReviewers`
- `killReviewer`

Two compatibility choices matter for downstream slices:
- `claimReview()` remains additive and still accepts arbitrary claimant IDs outside the registered reviewer pool
- reviewer `assigned` state remains a derived view over a live reviewer row plus `reviews.claimed_by`, not a broker-maintained duplicate field

`listReviewers()` reuses versioned wait semantics on `reviewer-state`, so later client/MCP work can adopt the same invalidation model already used for reviews.

### 4. Automatic recovery on reviewer exit, operator kill, and startup reconciliation
S03 added the recovery behavior that retires the main reviewer-lifecycle risk for M001:
- unexpected reviewer exit marks the reviewer offline and reclaims active `claimed` reviews
- operator kill marks the reviewer offline and reclaims limbo-prone `claimed` or `submitted` reviews
- startup reconciliation marks stale reviewer rows offline with `startup_recovery` and reclaims only the intended limbo-prone reviews after restart

Recovery is fenced, not best-effort. `reviews-repository.ts` now supports optional `expectedStatus` and `expectedClaimedBy` guards in addition to `expectedClaimGeneration`, and recovery uses all three. That prevents startup or exit recovery from clobbering a newer manual reclaim/re-claim or a non-recoverable later transition.

When a recovery loses the race, the broker records durable `review.transition_rejected` evidence with `STALE_CLAIM_GENERATION` rather than silently overwriting newer state.

### 5. Operator-visible diagnostics through runtime and CLI inspection
Reviewer/failure state is now observable without opening SQLite manually.

`inspectBrokerRuntime()` now reports:
- `reviewerCount`
- `trackedReviewerCount`
- `reviewerStatusCounts`
- `latestReviewer`
- `latestAuditEvent`

`start-broker.ts --once` now emits structured `startupRecovery` snapshots in both `broker.started` and `broker.once_complete`, including:
- recovered reviewer IDs
- reclaimed review IDs
- stale review IDs
- unrecoverable review IDs
- per-reviewer recovery summaries

The shipped diagnostics remain redaction-safe: they expose reviewer IDs, command basenames, relative fixture paths, timestamps, exit metadata, and reclaim outcomes, but not secret-bearing command lines or patch bodies.

### 6. Recovery and shutdown proof against real local runtime behavior
S03 added and updated focused proof files that exercise real local reviewer processes and the started runtime composition:
- `packages/review-broker-core/test/reviewer-contracts.test.ts`
- `packages/review-broker-server/test/reviewer-manager.test.ts`
- `packages/review-broker-server/test/reviewer-lifecycle.test.ts`
- `packages/review-broker-server/test/reviewer-recovery.test.ts`
- `packages/review-broker-server/test/restart-persistence.test.ts`
- `packages/review-broker-server/test/start-broker.smoke.test.ts`

Those tests now prove:
- public spawn/list/kill behavior through the started broker
- additive arbitrary-claimant compatibility
- recovery after unexpected reviewer exit
- recovery after operator kill of a submitted review
- stale-claim race protection during automatic recovery
- restart-safe startup reconciliation of stale reviewer sessions
- reviewer cleanup during runtime shutdown
- real CLI `--once` startup recovery output and redaction-safe reviewer diagnostics

## Patterns established for later slices
- **Do not add a second reviewer-assignment table or field.** Reviewer assignment is now intentionally derived from reviewer liveness plus `reviews.claimed_by`.
- **Use the shared reviewer contract directly.** `ReviewerRecord`, offline reasons, reclaim causes, kill outcomes, and `reviewer-state` version semantics are now canonical.
- **Keep child-process ownership in `reviewer-manager.ts`.** Later surfaces should call broker methods, not reimplement subprocess orchestration.
- **Fence recovery with more than claim generation when reclaiming reviewer-owned work.** The combination of `expectedClaimGeneration`, `expectedStatus`, and `expectedClaimedBy` is what keeps recovery from overwriting newer claims.
- **Treat recovery failures as observable events.** When recovery loses a race, persist `review.transition_rejected` evidence instead of swallowing the mismatch.
- **Use structured inspection surfaces first.** `inspectBrokerRuntime()` and `start-broker.ts --once` now expose enough reviewer and recovery state for most debugging without raw DB reads.
- **Preserve redaction-safe reviewer command metadata.** Store command basenames and workspace-relative paths, not absolute paths or secret-bearing argv.
- **For restart-recovery proof, reopen the same DB through `startBroker(...)` or the real CLI.** `context.close()` intentionally detaches reviewer listeners before signalling children, so teardown itself is not the startup-recovery evidence path.

## Verification performed
All slice-level verification passed.

### Automated verification
1. `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/reviewer-contracts.test.ts`
   - Result: **pass**
   - Evidence: 1 test file passed, 4 tests passed

2. `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/reviewer-lifecycle.test.ts packages/review-broker-server/test/reviewer-recovery.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts`
   - Result: **pass**
   - Evidence: 5 test files passed, 11 tests passed

3. `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/reviewer-lifecycle.test.ts`
   - Result: **pass**
   - Evidence: 1 test file passed, 2 tests passed

4. `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/reviewer-recovery.test.ts`
   - Result: **pass**
   - Evidence: 1 test file passed, 3 tests passed

5. `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s03-smoke.sqlite --once`
   - Result: **pass**
   - Evidence: emitted `broker.started` and `broker.once_complete` JSON with `migrations: ["001_init", "002_review_lifecycle_parity", "003_reviewer_lifecycle"]`, `migrationCount: 3`, `reviewerCount: 0`, `trackedReviewerCount: 0`, and an empty `startupRecovery` snapshot on a fresh DB

### Observability / diagnostic confirmation
The slice’s required observability surfaces are working:
- `reviewer.offline`, `reviewer.killed`, and `review.reclaimed` evidence is asserted in the reviewer lifecycle/recovery tests
- `reviewer-recovery.test.ts` proves offline rows and reviewer-global audit metadata retain reclaim causes and reclaimed review IDs after exit and operator kill
- `restart-persistence.test.ts` proves startup reconciliation reclaims only `claimed` / `submitted` reviews and preserves inspectable `startupRecovery` metadata after reopen
- `start-broker.smoke.test.ts` proves the real CLI `--once` path surfaces redaction-safe reviewer diagnostics plus seeded startup recovery data
- the direct `tsx src/cli/start-broker.ts --once` verification still emits the structured reviewer-aware inspection envelope on a clean runtime

## Requirement impact
- **Validated:** R005 broker-owned reviewer lifecycle operations
- **Validated:** R010 inspectable audit/reviewer/failure visibility
- **Advanced but not closed:**
  - R001 is stronger because reviewer lifecycle and recovery now run through the real standalone broker runtime, but M001 still needs typed client/MCP and final assembled parity proof
  - R012 is stronger because reviewer exit, operator kill, and startup-recovery reclaim behavior are now mechanically proven for M001, but broader timeout/continuity ownership still belongs to M003

## What remains for the next slices

### For S04 (typed client and MCP exposure)
- Wrap the shared reviewer schemas directly; do not redefine reviewer lifecycle payloads in the client or MCP layer.
- Preserve reviewer list wait semantics on `reviewer-state` so external surfaces can observe the same versioned contract.
- Expose the reviewer diagnostics vocabulary consistently across direct typed calls and MCP tools.
- Keep claim behavior additive: external callers may still claim reviews without first registering a reviewer row.

### For S05 (assembled parity proof)
- Re-run reviewer spawn/list/kill and recovery scenarios as part of the full assembled proof, not just package-level tests.
- Prove the typed client and MCP surfaces both observe the same reviewer/recovery state model now frozen here.
- Keep using `inspectBrokerRuntime()` and `start-broker.ts --once` as the redaction-safe operational inspection path for failure scenarios.

## Downstream cautions
- `corepack pnpm --filter review-broker-server exec ...` runs from `packages/review-broker-server`, so relative smoke DB paths land under that package’s `.tmp/` directory.
- Reviewer-manager timestamps come from the app-context clock, not the broker-service clock, so tests should partial-match reviewer timestamp fields unless the manager clock is also controlled explicitly.
- The broad multi-file Vitest command is not a substitute for the explicit single-file recovery test when you need a dedicated failure-path gate; keep the focused `reviewer-recovery.test.ts` command in the slice verification contract.
- Core shared-contract changes still need the checked-in `packages/review-broker-core/src/*.js` and `src/*.d.ts` siblings regenerated alongside the `.ts` sources.

## Bottom line
S03 retired the milestone’s reviewer-lifecycle risk. The standalone TypeScript broker now owns reviewer processes, persists and inspects reviewer state durably, reclaims limbo-prone reviews safely after reviewer death or restart, and exposes enough redaction-safe diagnostics that later typed client and MCP work can build on one mechanically proven reviewer lifecycle contract.
