---
id: T01
parent: S02
milestone: M003
provides:
  - Runtime-wide continuity inspection now includes recent cross-review recovery activity, and restart/smoke proofs match the shipped reclaim-vs-detach startup contract.
key_files:
  - packages/review-broker-server/src/db/audit-repository.ts
  - packages/review-broker-server/src/runtime/status-service.ts
  - packages/review-broker-server/src/index.ts
  - packages/review-broker-server/test/restart-persistence.test.ts
  - packages/review-broker-server/test/start-broker.smoke.test.ts
  - packages/review-broker-server/test/runtime-continuity-inspection.test.ts
key_decisions:
  - Seed startup-sweep fixtures directly through durable repositories for deterministic stale-session state instead of relying on longer live service flows.
patterns_established:
  - Add broker-owned cross-review audit queries in the repository layer, then project them through inspectRuntimeContinuity()/inspectBrokerRuntime() so CLI and later contract work can reuse one read model.
observability_surfaces:
  - packages/review-broker-server/src/runtime/status-service.ts recentRecoveryActivity
  - packages/review-broker-server/src/index.ts inspectBrokerRuntime()
  - packages/review-broker-server/src/cli/start-broker.ts --once
  - durable SQLite reviews/reviewers/audit_events rows
duration: 22m
verification_result: passed
completed_at: 2026-03-24T01:29:57-07:00
blocker_discovered: false
---

# T01: Extend runtime continuity inspection and refresh restart proof

**Added a cross-review runtime continuity feed and refreshed restart/smoke proofs to the shipped reclaim-vs-detach startup contract.**

## What Happened

I first verified the local S01 continuity contract and confirmed the red baseline was stale for two reasons: the restart/smoke tests still expected only three migrations and they modeled startup recovery with outdated reclaim behavior. I then extended `packages/review-broker-server/src/db/audit-repository.ts` with a broker-owned cross-review continuity query and projected that feed through `inspectRuntimeContinuity()` and `inspectBrokerRuntime()` as `recentRecoveryActivity`, preserving the existing per-review continuity snapshot while making recent recovery actions inspectable in one runtime read model.

After that, I refreshed the restart and smoke tests to the actual shipped contract: additive migration `004_review_continuity`, startup reclaim of clearly safe `claimed` work, startup detach of ambiguous `submitted` work, startup summary counts/lists, and redaction-safe reviewer/audit evidence. To make those proofs stable, I seeded stale ownership directly through the repositories instead of driving a long live-service scenario that could legitimately mutate claims before restart. I also added `packages/review-broker-server/test/runtime-continuity-inspection.test.ts` to prove one durable SQLite file can answer current ownership, recent recovery actions, reviewer state, and action-required cases through the supported runtime inspection surface.

A slice-level build exposed TypeScript issues in the touched read-model path, so I fixed those before finishing: exact-optional handling in `startBroker()`, safe narrowing of recovery transition results in `broker-service.ts`, non-null continuity event constants in `audit-repository.ts`, and explicit current-status resolution in `status-service.ts`.

## Verification

I ran the T01 task lane and the required file-existence check; both passed after the implementation and test refresh. I also ran the slice-level verification commands to capture the honest current slice snapshot: the build now passes, `start-broker.ts --once` passes and emits the richer continuity snapshot, while the T02 parity lane and T03 continuity-CLI commands remain red because those downstream tasks are not implemented yet.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm exec vitest run packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts packages/review-broker-server/test/runtime-continuity-inspection.test.ts` | 0 | ✅ pass | 1.92s |
| 2 | `test -f packages/review-broker-server/test/runtime-continuity-inspection.test.ts` | 0 | ✅ pass | 0.00s |
| 3 | `corepack pnpm exec vitest run packages/review-broker-core/test/runtime-continuity-contracts.test.ts packages/review-broker-server/test/client-mcp-parity.test.ts packages/review-broker-server/test/mcp-server.test.ts` | 1 | ❌ fail | 3.88s |
| 4 | `corepack pnpm exec vitest run packages/review-broker-server/test/continuity-cli.test.ts` | 1 | ❌ fail | 0.47s |
| 5 | `corepack pnpm build` | 0 | ✅ pass | 4.60s |
| 6 | `corepack pnpm --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s02-inspect.sqlite --once` | 0 | ✅ pass | 0.87s |
| 7 | `corepack pnpm --filter review-broker-server exec tsx src/cli/inspect-continuity.ts --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s02-inspect.sqlite --limit 10` | 1 | ❌ fail | 0.49s |

## Diagnostics

Use `inspectRuntimeContinuity()` in `packages/review-broker-server/src/runtime/status-service.ts` or `inspectBrokerRuntime()` in `packages/review-broker-server/src/index.ts` against the same SQLite file to inspect `recentRecoveryActivity`, `recoveryReviews`, `actionRequiredReviewIds`, and `latestRecovery`. The smoke proof also confirms `start-broker.ts --once` emits the same startup recovery summary plus runtime continuity snapshot without exposing patch bodies or reviewer command secrets in the continuity payload.

## Deviations

None.

## Known Issues

- `packages/review-broker-server/test/client-mcp-parity.test.ts` is still red on a downstream T02 expectation about reviewer kill/offline behavior; this task did not modify the typed/MCP parity surface.
- `packages/review-broker-server/test/continuity-cli.test.ts` and `src/cli/inspect-continuity.ts` remain absent until T03, so the slice-level continuity CLI checks still fail by design at this task boundary.

## Files Created/Modified

- `packages/review-broker-server/src/db/audit-repository.ts` — added the cross-review `listRecentContinuity()` query and compile-safe continuity event constants.
- `packages/review-broker-server/src/runtime/status-service.ts` — extended the runtime continuity snapshot with `recentRecoveryActivity` and current-status resolution.
- `packages/review-broker-server/src/index.ts` — surfaced the richer runtime continuity snapshot through `inspectBrokerRuntime()` and fixed exact-optional startup sweep invocation.
- `packages/review-broker-server/src/cli/start-broker.ts` — included `recentRecoveryActivity` in `--once` output.
- `packages/review-broker-server/src/runtime/broker-service.ts` — tightened recovery-result narrowing for build-safe startup recovery summaries.
- `packages/review-broker-server/test/restart-persistence.test.ts` — aligned restart proof to migration `004_review_continuity` and real startup reclaim-vs-detach behavior.
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — aligned CLI smoke coverage to the real startup continuity contract and richer once-mode snapshot.
- `packages/review-broker-server/test/runtime-continuity-inspection.test.ts` — added durable proof for current ownership, reviewer state, action-required cases, and recent recovery history from one runtime snapshot.
- `.gsd/KNOWLEDGE.md` — recorded the fixture-seeding gotcha for deterministic startup-sweep tests.
