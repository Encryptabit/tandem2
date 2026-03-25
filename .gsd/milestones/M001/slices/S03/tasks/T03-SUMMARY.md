---
id: T03
parent: S03
milestone: M001
provides:
  - Broker-owned reviewer spawn/list/kill service methods, reviewer-aware runtime/CLI inspection output, and shutdown-aware reviewer cleanup proof
key_files:
  - packages/review-broker-server/src/runtime/broker-service.ts
  - packages/review-broker-server/src/runtime/app-context.ts
  - packages/review-broker-server/src/runtime/reviewer-manager.ts
  - packages/review-broker-server/src/index.ts
  - packages/review-broker-server/src/cli/start-broker.ts
  - packages/review-broker-server/test/reviewer-lifecycle.test.ts
  - packages/review-broker-server/test/start-broker.smoke.test.ts
key_decisions:
  - Kept `close()` synchronous on the started runtime but routed `waitUntilStopped()` through async `context.shutdown()` so broker-owned reviewer cleanup completes before stop waiters resolve
  - Built runtime/CLI reviewer diagnostics from durable reviewer rows plus manager tracked-count state, preserving redaction-safe command basenames and relative fixture paths instead of leaking absolute command metadata
patterns_established:
  - Reviewer-aware CLI smoke tests should partial-match nested reviewer timestamp fields unless the reviewer-manager clock is explicitly controlled in the harness
observability_surfaces:
  - packages/review-broker-server/test/reviewer-lifecycle.test.ts
  - packages/review-broker-server/test/start-broker.smoke.test.ts
  - packages/review-broker-server/src/index.ts inspectBrokerRuntime()
  - packages/review-broker-server/src/cli/start-broker.ts --once
  - broker.stopped shutdown summary via getShutdownSnapshot()
duration: 2h
verification_result: passed
completed_at: 2026-03-21T12:42:30Z
blocker_discovered: false
---

# T03: Expose reviewer spawn/list/kill through the broker runtime and CLI diagnostics

**Exposed broker-owned reviewer spawn/list/kill APIs and reviewer-aware runtime/CLI diagnostics.**

## What Happened

I extended `packages/review-broker-server/src/runtime/broker-service.ts` with public `spawnReviewer`, `listReviewers`, and `killReviewer` methods backed by the existing reviewer manager and repository, including versioned reviewer-list wait semantics on the shared `reviewer-state` topic.

I preserved additive claim behavior by leaving `claimReview()` reviewer-agnostic: arbitrary claimant IDs still work even when no reviewer row exists, while reviewer `assigned` state remains derived from a live reviewer row whose `reviewerId` matches an active `reviews.claimed_by` value.

To make broker shutdown reviewer-aware without breaking the existing runtime shape, I added `shutdown()` to `packages/review-broker-server/src/runtime/app-context.ts` and `packages/review-broker-server/src/runtime/reviewer-manager.ts`. `startBroker()` now keeps `close()` synchronous but defers `waitUntilStopped()` until reviewer shutdown completes and records a shutdown snapshot that surfaces cleanup outcomes.

I expanded `packages/review-broker-server/src/index.ts` inspection output with reviewer counts, tracked reviewer counts, reviewer status counts, and a latest durable reviewer snapshot. I also updated `packages/review-broker-server/src/cli/start-broker.ts` so `--once` emits reviewer-aware inspection JSON and normal stop events include the shutdown snapshot.

For proof, I added `packages/review-broker-server/test/reviewer-lifecycle.test.ts` to exercise public reviewer spawn/list/kill through a started broker, verify backward-compatible arbitrary claimant behavior, and confirm runtime shutdown waits for reviewer cleanup. I also updated `packages/review-broker-server/test/start-broker.smoke.test.ts` so the real CLI `--once` path proves reviewer visibility from persisted runtime state without asserting unstable reviewer-manager timestamps too strictly.

I also updated `.gsd/milestones/M001/slices/S03/S03-PLAN.md` twice during execution: first to add the pre-flight reviewer-lifecycle diagnostic verification line, and now to mark T03 complete.

## Verification

Task-level verification passed:
- The focused T03 Vitest command passed against the new public reviewer lifecycle test and the updated CLI smoke test.
- The real `tsx src/cli/start-broker.ts --once` task command passed and emitted reviewer-aware inspection JSON.
- `review-broker-server` builds cleanly after the runtime/interface changes.

Slice-level verification was also run:
- `reviewer-contracts.test.ts` still passes.
- The broader server verification command passes with the new T03 coverage in place.
- The explicit `reviewer-recovery.test.ts` command still fails with “No test files found,” which is expected because that proof belongs to T04.
- The slice `start-broker --once` command passes and emits the new reviewer-aware snapshot fields.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server run build` | 0 | ✅ pass | 3.4s |
| 2 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/reviewer-lifecycle.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts` | 0 | ✅ pass | 1.04s |
| 3 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s03-lifecycle.sqlite --once` | 0 | ✅ pass | 11.0s |
| 4 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/reviewer-contracts.test.ts` | 0 | ✅ pass | 0.46s |
| 5 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/reviewer-lifecycle.test.ts packages/review-broker-server/test/reviewer-recovery.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts` | 0 | ✅ pass | 1.13s |
| 6 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/reviewer-recovery.test.ts` | 1 | ❌ fail | 11.0s |
| 7 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s03-smoke.sqlite --once` | 0 | ✅ pass | 11.0s |

## Diagnostics

Inspect the shipped reviewer lifecycle surfaces with:
- `packages/review-broker-server/test/reviewer-lifecycle.test.ts` for public spawn/list/kill behavior, reviewer-state wait semantics, and shutdown cleanup proof.
- `packages/review-broker-server/test/start-broker.smoke.test.ts` for the real CLI reviewer snapshot proof.
- `packages/review-broker-server/src/index.ts` `inspectBrokerRuntime()` for reviewer counts, tracked reviewer counts, reviewer status counts, and the latest durable reviewer snapshot.
- `packages/review-broker-server/src/cli/start-broker.ts --once` for reviewer-aware JSON inspection output.
- `startBroker(...).getShutdownSnapshot()` or the emitted `broker.stopped` JSON for reviewer cleanup outcomes during shutdown.

## Deviations

- I added `AppContext.shutdown()` plus `StartedBrokerRuntime.getShutdownSnapshot()` as small internal/runtime-facing helpers to make reviewer cleanup observable without changing the synchronous `close()` call shape used elsewhere in the repo.
- I updated `.gsd/milestones/M001/slices/S03/S03-PLAN.md` during T03 both for the required pre-flight observability verification fix and to mark this task complete.

## Known Issues

- `packages/review-broker-server/test/reviewer-recovery.test.ts` still does not exist, so the explicit slice recovery-proof command remains red until T04 implements that coverage.
- The broad multi-file Vitest slice command currently exits `0` even though it names the missing recovery test path; the explicit single-file recovery command is still the trustworthy T04 gate.

## Files Created/Modified

- `.gsd/milestones/M001/slices/S03/S03-PLAN.md` — added the reviewer-lifecycle verification line earlier in the task and marked T03 done.
- `.gsd/KNOWLEDGE.md` — recorded the reviewer-manager clock/testing gotcha for future agents.
- `packages/review-broker-server/src/runtime/broker-service.ts` — added public reviewer spawn/list/kill methods and reviewer-state version handling.
- `packages/review-broker-server/src/runtime/app-context.ts` — added async shutdown support so started runtimes can wait for reviewer cleanup before closing SQLite.
- `packages/review-broker-server/src/runtime/reviewer-manager.ts` — added reviewer shutdown aggregation for broker-owned cleanup.
- `packages/review-broker-server/src/db/reviewers-repository.ts` — ordered reviewer listings by `updated_at` so inspection surfaces return the latest reviewer snapshot.
- `packages/review-broker-server/src/index.ts` — added reviewer-aware runtime inspection fields and shutdown snapshot reporting.
- `packages/review-broker-server/src/cli/start-broker.ts` — emitted reviewer-aware `--once` JSON and stop-time shutdown summaries.
- `packages/review-broker-server/test/reviewer-lifecycle.test.ts` — added started-runtime proof for public reviewer spawn/list/kill, additive claim compatibility, and cleanup-aware shutdown.
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — updated the real CLI smoke proof to cover reviewer inspection output and redaction-safe persisted reviewer metadata.
