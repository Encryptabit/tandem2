# S03 Summary — End-to-end crash/restart continuity proof

## Outcome

S03 is **slice-complete** and **M003 is now complete**.

This closer pass re-ran every slice-level verification command from the plan, confirmed the continuity observability surfaces through the shipped runtime and CLI entrypoints, updated requirement evidence, and compressed the task work into one final continuity record for downstream readers.

## What this slice actually delivered

### 1. One assembled continuity proof on one durable SQLite database
S03 closed the milestone gap by broadening the existing end-to-end proof so the **same SQLite file** now covers both continuity causes in sequence:
- a live **reviewer subprocess exit** first
- a later broker crash simulated with **`AppContext.close()`**
- a fresh restart that performs **startup stale-session recovery** before normal inspection

The assembled proof now demonstrates four review states on one DB:
- reviewer-exit reclaimed work
- reviewer-exit detached/action-required work
- startup-recovery reclaimed work
- startup-recovery detached/action-required work

The key milestone claim is now proven, not inferred: no review is left in unexplained claimed/stale limbo after the combined exit-plus-restart lifecycle.

### 2. Cross-surface agreement on the recovered state
S03 did not introduce a second acceptance harness or a raw-DB inspector. Instead, it proved the recovered state through the shipped broker-owned surfaces and required them to agree:
- `getReviewStatus`
- `getReviewTimeline`
- `inspectRuntimeContinuity`
- `inspect-continuity.ts --limit 10`
- `start-broker.ts --once`

That established the slice’s core pattern: per-review status/timeline evidence and runtime-wide continuity snapshots must describe the same durable reality after restart.

### 3. A rerunnable shipped acceptance lane
S03 aligned the repo/package proof commands to the assembled lifecycle rather than the older narrower continuity checks:
- root `broker:continuity` now delegates to package-local `review-broker-server` `test:continuity`
- package `test:continuity` reruns the five-test S03 acceptance bundle
- focused operator regressions (`continuity-cli.test.ts`, `recovery-status-surfaces.test.ts`) now prove the same durable story as the broader end-to-end test

This matters operationally: future agents no longer need to rediscover the right mix of tests. One supported command reruns the final acceptance lane.

### 4. Operator proof surfaces that stay redaction-safe
S03 found and fixed one real operator-surface gap: `start-broker.ts --once` was still exposing raw reviewer argv through `latestReviewer`.

The fix stayed narrow and intentional:
- keep internal runtime snapshots unchanged for lower-level tests/debugging
- sanitize **only** the once-mode CLI projection
- expose reviewer basenames plus lifecycle metadata, not raw command strings or argv

That preserves the milestone’s visibility goal without creating a new secret-leak path in the shipped operator proof surface.

### 5. Idempotent restart inspection behavior is now explicit
S03 also clarified an important continuity-proof behavior for downstream work:
- on a stale DB, run **`inspect-continuity.ts` first** if you want to observe the real `startupRecovery` pass
- after that recovery pass, a later `start-broker.ts --once` should show the **same durable continuity state** but an already-consumed/idempotent startup recovery shape

That is the correct post-restart model, not a bug. The broker should recover once, then report stable state.

## What patterns this slice established

### Assemble proof on the real runtime boundaries
The winning pattern for final continuity acceptance is:
1. use a real reviewer subprocess
2. persist state to one real SQLite file
3. simulate broker crash with `AppContext.close()`
4. restart the broker through shipped CLI/runtime entrypoints
5. verify recovered state through broker-owned status/timeline/continuity surfaces

S03 proved the milestone on the actual boundaries the roadmap cared about, not with fixture-only or in-memory shortcuts.

### Compare focused continuity inspection against later once-mode output
For restart continuity work, the practical comparison is now:
- `inspect-continuity.ts` first on the stale DB to capture the real startup recovery pass
- `start-broker.ts --once` afterward to confirm the same durable state idempotently

That comparison is now the canonical operator-facing continuity check.

### Keep acceptance on supported broker surfaces
S03 preserved the M003 boundary that future slices should keep:
- no raw SQLite inspection for acceptance
- no second restart inspector
- no separate recovery policy for tests
- no operator-only shadow read model

If future work needs continuity data, it should extend the existing broker-owned surfaces instead of bypassing them.

### Redaction rules belong at the shipped CLI projection boundary
The slice established a clear rule for future operator surfaces:
- runtime internals may keep fuller fidelity when needed by low-level tests
- shipped CLI/output surfaces must stay basename-safe and argv-safe

That keeps observability useful without broadening the exposed secret surface.

## Verification status

All slice-plan verification commands passed in the closer pass:

1. `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/end-to-end-continuity-proof.test.ts packages/review-broker-server/test/recovery-status-surfaces.test.ts packages/review-broker-server/test/startup-sweep.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/continuity-cli.test.ts`
2. `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 broker:continuity`
3. `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s03-continuity.sqlite --once`
4. `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/inspect-continuity.ts --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s03-continuity.sqlite --limit 10`

Observed closer-pass result:
- the explicit five-test Vitest lane passed
- `broker:continuity` passed and correctly delegated to package `test:continuity`
- direct `start-broker.ts --once` and `inspect-continuity.ts` runs passed on the required absolute DB path
- the direct CLI run showed the expected clean/idempotent shape on a fresh temp DB: migrations applied, structured continuity output, and zero recovery counts

## Observability / diagnostics confirmed

The slice-plan observability surfaces are real and working together:
- `getReviewStatus` exposes the per-review post-recovery state
- `getReviewTimeline` exposes the durable recovery explanation/history
- `inspectRuntimeContinuity` exposes runtime-wide ownership, recovery, reviewer, and action-required state
- `inspect-continuity.ts` exposes the focused operator continuity snapshot
- `start-broker.ts --once` exposes the broader once-mode runtime inventory plus startup recovery summary

The important S03 diagnostic outcome is coherence: runtime status, per-review timeline, runtime continuity aggregates, and both CLI surfaces all agree on whether work was reclaimed, detached, or left action-required after exit/restart.

## Requirement impact

S03 changed requirement status, not just notes:
- **R003** is now **validated** by the assembled durable-SQLite crash/restart proof and direct CLI verification on one DB.
- **R010** is now **validated** because the shipped broker status and CLI surfaces explain the recovered state coherently after reviewer exit and restart.
- **R012** remains **validated** and is now explicitly **re-proved** by the final assembled continuity lane.
- **R005** remains active but strengthened from prior slice evidence; S03 did not need a separate reviewer-lifecycle redesign to finish the milestone.

## Decisions and gotchas future slices should preserve

1. **Do not add a second continuity acceptance harness.** Reuse the broadened end-to-end proof and the shipped `broker:continuity` lane.
2. **Use `inspect-continuity.ts` first on stale DBs** when you need the one real startup-recovery snapshot.
3. **Treat later `start-broker.ts --once` output as the idempotent confirmation surface,** not as a second recovery pass.
4. **Keep operator output argv-safe.** Basenames and lifecycle metadata are enough for continuity inspection.
5. **Keep proof and operator inspection on broker-owned status/CLI surfaces,** not raw SQLite reads.
6. **Use absolute `--db-path` values** for package-scoped CLI verification.

## What M004 should know

M003 is done; M004 should treat continuity as a stable substrate, not unfinished broker plumbing.

What is now safe to assume:
- the broker survives live reviewer exit and later restart on one durable DB
- startup stale-session cleanup happens before normal inspection on restart paths
- the continuity explanation model is already available through broker-owned status/timeline/runtime/CLI surfaces
- the shipped operator surfaces are redaction-safe enough to reuse as dashboard/back-office read-model inputs

What M004 should **not** do:
- add raw SQLite inspection as an operator shortcut
- invent a second restart continuity read model
- bypass the existing runtime continuity/status/timeline surfaces when building UI/operator tooling

In short: S01 defined the recovery policy, S02 made restart continuity inspectable, and S03 proved the full assembled crash/restart lifecycle on one durable SQLite database. Downstream work should build on those stable continuity surfaces rather than reopening the broker continuity contract.
