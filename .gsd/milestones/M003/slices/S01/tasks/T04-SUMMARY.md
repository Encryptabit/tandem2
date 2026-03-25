---
id: T04
parent: S01
milestone: M003
provides:
  - Recovery-aware broker inspection surfaces plus a durable end-to-end continuity proof and root rerun entry.
key_files:
  - packages/review-broker-server/src/runtime/status-service.ts
  - packages/review-broker-server/src/runtime/broker-service.ts
  - packages/review-broker-server/src/index.ts
  - packages/review-broker-server/src/cli/start-broker.ts
  - packages/review-broker-server/test/recovery-status-surfaces.test.ts
  - packages/review-broker-server/test/end-to-end-continuity-proof.test.ts
  - package.json
key_decisions:
  - Kept `getReviewStatus` additive by preserving the existing `review` field while attaching `ownership`, `latestRecovery`, and action-required continuity data, then added `getReviewTimeline` as the explicit continuity-history surface.
  - Extended `inspectBrokerRuntime()` and CLI `--once` with continuity snapshots (`recoveryReviewCount`, `actionRequiredReviewIds`, `latestRecovery`, `recoveryReviews`) instead of creating a separate operator-only inspection path.
patterns_established:
  - After changing `review-broker-core` contracts, rebuild both the checked-in `src/*.js` mirrors and the exported `dist/` artifacts before trusting server runtime validation.
  - Use supported broker surfaces (`getReviewStatus`, `getReviewTimeline`, `inspectBrokerRuntime()`, and `start-broker.ts --once`) as the primary acceptance surfaces for recovery behavior; raw SQLite reads are no longer necessary for the slice proof.
observability_surfaces:
  - BrokerService.getReviewStatus() / BrokerService.getReviewTimeline()
  - inspectBrokerRuntime()
  - packages/review-broker-server/src/cli/start-broker.ts --once
  - package.json broker:continuity
  - .gsd/KNOWLEDGE.md
duration: ~1h
verification_result: passed
completed_at: 2026-03-24T00:42:33-07:00
blocker_discovered: false
---

# T04: Expose continuity inspection surfaces and end-to-end proof

**Exposed recovery-aware broker status/timeline surfaces and proved durable reviewer-exit continuity on one SQLite database.**

## What Happened

I added `packages/review-broker-server/src/runtime/status-service.ts` as the shared continuity read model for broker inspection. `getReviewStatus` now returns the existing review summary plus ownership, latest recovery evidence, and action-required state, while `getReviewTimeline` returns continuity audit history for the review.

On the server side, `packages/review-broker-server/src/runtime/broker-service.ts` now wires those surfaces into the live broker service, and `packages/review-broker-server/src/index.ts` / `src/cli/start-broker.ts` now expose continuity inspection through `inspectBrokerRuntime()` and `--once` with additive `recoveryReviewCount`, `actionRequiredReviewIds`, `latestRecovery`, and `recoveryReviews` fields alongside the existing startup summary.

To support the new service shape cleanly, I expanded the shared contract in `packages/review-broker-core/src/contracts.ts`, added `getReviewTimeline` to the broker operation registry in `packages/review-broker-core/src/operations.ts`, and rebuilt the checked-in core JS/DT artifacts plus the exported `dist/` output so runtime consumers validated against the updated contract.

I replaced the T04 placeholders with real proofs. `packages/review-broker-server/test/recovery-status-surfaces.test.ts` asserts timeout reclaim and reviewer-exit detach through supported status/timeline/runtime surfaces. `packages/review-broker-server/test/end-to-end-continuity-proof.test.ts` uses a real reviewer subprocess and one durable SQLite file to prove that after reviewer exit, claimed work is reclaimed, ambiguous submitted work is detached, and the same explanations remain visible after reopen and through CLI once inspection.

Finally, I added the root `broker:continuity` rerun entry to `package.json`, ignored the package-local `.tmp` path used by the package-scoped CLI verification command, and captured the package-local `--db-path` resolution gotcha in `.gsd/KNOWLEDGE.md`.

## Verification

I ran the new task-scoped Vitest target first, fixed a real summary-vs-record contract mismatch in the new status read model, then rebuilt `review-broker-core/dist` after confirming the server was still validating against stale exported contract code. After that, the new tests passed and the full slice verification gate passed end to end.

I then ran every slice verification command from the plan: the continuity-contract/bootstrap/recovery primitive suite, the timeout/exit/startup/status suite, the new end-to-end continuity proof, the new root `broker:continuity` script, and the direct `start-broker.ts --once` inspection command. All passed.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-core/test/continuity-contracts.test.ts packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/recovery-transitions.test.ts` | 0 | ✅ pass | 0.60s |
| 2 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/claim-timeout-recovery.test.ts packages/review-broker-server/test/reviewer-exit-recovery.test.ts packages/review-broker-server/test/startup-sweep.test.ts packages/review-broker-server/test/recovery-status-surfaces.test.ts` | 0 | ✅ pass | 1.40s |
| 3 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/end-to-end-continuity-proof.test.ts` | 0 | ✅ pass | 1.74s |
| 4 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 broker:continuity` | 0 | ✅ pass | 1.71s |
| 5 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/m003-s01-inspect.sqlite --once` | 0 | ✅ pass | 0.72s |

## Diagnostics

Use these supported surfaces to inspect the shipped continuity behavior later:

- `BrokerService.getReviewStatus({ reviewId })` now returns `review`, `ownership`, `latestRecovery`, `actionRequired`, and `actionRequiredReason`.
- `BrokerService.getReviewTimeline({ reviewId })` returns the continuity audit timeline for reclaim/detach/rejected recovery attempts.
- `inspectBrokerRuntime()` now includes `recoveryReviewCount`, `actionRequiredReviewIds`, `latestRecovery`, and `recoveryReviews` for runtime-wide inspection.
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 broker:continuity` reruns the supported-surface proofs from the repo root.
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/m003-s01-inspect.sqlite --once` emits the structured once snapshot without querying SQLite directly.

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `packages/review-broker-core/src/contracts.ts` — expanded the shared status/timeline response contracts for continuity-aware inspection.
- `packages/review-broker-core/src/operations.ts` — added the `getReviewTimeline` broker operation and updated the operation registry.
- `packages/review-broker-core/src/*.js` and `packages/review-broker-core/dist/*` — rebuilt generated runtime/export artifacts so validation uses the updated contract.
- `packages/review-broker-server/src/runtime/status-service.ts` — added the shared continuity status/timeline/runtime inspection read model.
- `packages/review-broker-server/src/runtime/broker-service.ts` — exposed recovery-aware `getReviewStatus` and new `getReviewTimeline` service methods.
- `packages/review-broker-server/src/index.ts` — exported the new status service and extended runtime inspection snapshots with continuity data.
- `packages/review-broker-server/src/cli/start-broker.ts` — surfaced latest recovery evidence and recovery review snapshots in `--once` output.
- `packages/review-broker-server/test/recovery-status-surfaces.test.ts` — added supported-surface proofs for timeout reclaim and reviewer-exit detach.
- `packages/review-broker-server/test/end-to-end-continuity-proof.test.ts` — added the real subprocess + durable SQLite continuity proof.
- `package.json` — added the root `broker:continuity` rerun script.
- `.gitignore` — ignored package-local CLI inspection temp output.
- `.gsd/KNOWLEDGE.md` — captured the package-scoped CLI `--db-path` resolution gotcha.
