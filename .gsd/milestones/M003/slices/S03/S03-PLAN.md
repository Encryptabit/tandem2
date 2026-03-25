# S03: End-to-end crash/restart continuity proof

**Goal:** Close M003 with one assembled continuity proof that exercises live reviewer exit, broker crash/restart, stale-session sweep, and operator-facing continuity inspection on a single durable SQLite database.
**Demo:** The assembled broker survives a real reviewer subprocess exit and a later broker restart on the same SQLite file, and supported status/CLI continuity surfaces explain the post-restart state without raw DB inspection.

## Requirement Focus

This slice directly advances the Active requirements it supports in the roadmap: **R003** and **R010**. It re-proves durable SQLite coherence under harder lifecycle conditions and makes the combined recovery story inspectable through shipped broker surfaces. It also supports already-validated **R012** by proving the existing reclaim/detach contract through the full assembled crash/restart path rather than redefining that policy.

## Decomposition Rationale

S01 and S02 already delivered the hard parts of the continuity substrate: the shared reclaim-vs-detach policy, startup sweep ordering, and supported continuity inspection surfaces. The remaining gap is not a new subsystem. It is one missing integration seam: proving that those pieces stay coherent when they are exercised together on one durable database across both live reviewer exit and later broker restart.

The first task therefore broadens the existing end-to-end proof instead of inventing a second acceptance harness. That is the fastest way to surface a real runtime defect if one still exists, while preserving the decisions to reuse `AppContext.close()` for crash simulation, keep recovery policy shared, and verify through broker-owned status/CLI surfaces rather than raw SQLite reads.

Once that integrated proof exists, the second task closes the operational acceptance loop. It aligns the repo-level proof command and the focused operator tests with the new assembled lifecycle so future agents can rerun one supported continuity lane and get the same evidence operators would use in practice.

## Must-Haves

- One durable SQLite proof must cover both continuity causes on the same database: live `reviewer_exit` recovery first, then stale-session `startup_recovery` after a broker crash/restart, directly advancing R003.
- Supported broker surfaces must verify the combined post-restart state without raw DB inspection, including `getReviewStatus`, `getReviewTimeline`, `inspectRuntimeContinuity`, `start-broker.ts --once`, and `inspect-continuity.ts`, directly advancing R010.
- The slice must preserve the existing S01/S02 continuity contract: safe `claimed` work is reclaimed, ambiguous open/`submitted` work is detached and action-required, and no second recovery policy or second restart inspector is introduced.
- Repo-level acceptance must be rerunnable through shipped test/CLI entrypoints with absolute `--db-path` usage where package-scoped commands need durable-path proof.

## Proof Level

- This slice proves: final-assembly
- Real runtime required: yes
- Human/UAT required: no

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/end-to-end-continuity-proof.test.ts packages/review-broker-server/test/recovery-status-surfaces.test.ts packages/review-broker-server/test/startup-sweep.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/continuity-cli.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 broker:continuity`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s03-continuity.sqlite --once`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/inspect-continuity.ts --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s03-continuity.sqlite --limit 10`

## Observability / Diagnostics

- Runtime signals: durable `review.reclaimed`, `review.detached`, and `reviewer.offline` audit entries plus continuity snapshots carrying `recoveryReason`, `actionRequiredReason`, `reviewerSessionId`, `claimGeneration`, and startup recovery summaries.
- Inspection surfaces: `packages/review-broker-server/src/runtime/status-service.ts`, `packages/review-broker-server/src/runtime/broker-service.ts`, `packages/review-broker-server/test/end-to-end-continuity-proof.test.ts`, `packages/review-broker-server/test/continuity-cli.test.ts`, `packages/review-broker-server/src/cli/start-broker.ts --once`, and `packages/review-broker-server/src/cli/inspect-continuity.ts`.
- Failure visibility: the integrated proof must make it obvious whether a review was reclaimed, detached, left action-required, or surfaced inconsistently across runtime and CLI snapshots after restart.
- Redaction constraints: acceptance stays patch-body-safe and argv-safe; operator proof may expose review IDs, reviewer IDs, session IDs, basenames, counts, reasons, and timestamps, but not raw command strings or raw SQLite inspection output.

## Integration Closure

- Upstream surfaces consumed: `packages/review-broker-server/src/runtime/app-context.ts`, `packages/review-broker-server/src/runtime/broker-service.ts`, `packages/review-broker-server/src/runtime/status-service.ts`, `packages/review-broker-server/src/cli/start-broker.ts`, `packages/review-broker-server/src/cli/inspect-continuity.ts`, and the existing Vitest harness under `packages/review-broker-server/test/`.
- New wiring introduced in this slice: one broadened assembled proof lane plus repo/operator entrypoints that rerun the same continuity story on durable SQLite.
- What remains before the milestone is truly usable end-to-end: nothing within M003; successful completion of this slice closes the milestone’s crash/restart continuity acceptance gap.

## Tasks

- [x] **T01: Broaden the end-to-end continuity proof across reviewer exit and restart** `est:1h30m`
  - Why: The milestone gap is one missing assembled proof on a single durable database, so the first task must encode that lifecycle directly and expose any real runtime inconsistency immediately.
  - Files: `packages/review-broker-server/test/end-to-end-continuity-proof.test.ts`, `packages/review-broker-server/test/test-paths.ts`, `packages/review-broker-server/src/runtime/status-service.ts`, `packages/review-broker-server/src/runtime/broker-service.ts`, `packages/review-broker-server/src/cli/inspect-continuity.ts`
  - Do: Expand the existing proof so the same SQLite file first exercises live `reviewer_exit` reclaim/detach behavior and then a crash-simulated stale-session restart via `AppContext.close()`, assert the combined post-restart state through `getReviewStatus`, `getReviewTimeline`, `inspectRuntimeContinuity`, `inspect-continuity.ts`, and `start-broker.ts --once`, and only make narrow runtime/CLI aggregation fixes if the broadened proof exposes one; do not add a second recovery policy or a second restart inspector.
  - Verify: `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/end-to-end-continuity-proof.test.ts packages/review-broker-server/test/startup-sweep.test.ts packages/review-broker-server/test/restart-persistence.test.ts`
  - Done when: one durable SQLite proof demonstrates both `reviewer_exit` and `startup_recovery` without leaving any review in claimed/stale limbo and the supported runtime/CLI snapshots agree on the resulting continuity state.
- [x] **T02: Align the shipped continuity acceptance lane and operator proof commands** `est:1h`
  - Why: The slice is only operationally complete when future agents and operators can rerun one supported continuity lane and get the same cross-surface evidence as the assembled proof.
  - Files: `package.json`, `packages/review-broker-server/package.json`, `packages/review-broker-server/test/continuity-cli.test.ts`, `packages/review-broker-server/test/recovery-status-surfaces.test.ts`
  - Do: Update the repo/package continuity proof entrypoints to run the broadened S03 acceptance lane, tighten the CLI/status regression tests so they assert the combined durable-state story and absolute `--db-path` operator path, and keep all acceptance checks on supported broker surfaces rather than raw DB reads.
  - Verify: `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/recovery-status-surfaces.test.ts packages/review-broker-server/test/continuity-cli.test.ts && corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 broker:continuity`
  - Done when: the repo-level continuity command and focused operator tests re-prove the assembled crash/restart lifecycle on durable SQLite through the shipped broker surfaces.

## Files Likely Touched

- `packages/review-broker-server/test/end-to-end-continuity-proof.test.ts`
- `packages/review-broker-server/test/test-paths.ts`
- `packages/review-broker-server/test/continuity-cli.test.ts`
- `packages/review-broker-server/test/recovery-status-surfaces.test.ts`
- `packages/review-broker-server/src/runtime/app-context.ts`
- `packages/review-broker-server/src/runtime/broker-service.ts`
- `packages/review-broker-server/src/runtime/status-service.ts`
- `packages/review-broker-server/src/cli/start-broker.ts`
- `packages/review-broker-server/src/cli/inspect-continuity.ts`
- `package.json`
- `packages/review-broker-server/package.json`
