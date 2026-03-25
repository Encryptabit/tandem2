---
estimated_steps: 4
estimated_files: 7
skills_used:
  - gsd
  - test
  - review
---

# T04: Expose continuity inspection surfaces and end-to-end proof

**Slice:** S01 — Reviewer-exit and stale-claim recovery
**Milestone:** M003

## Description

Close the slice by making recovery explainable through supported broker surfaces and by proving the demo end to end. This task should stay runtime-owned: thin status/timeline/CLI inspection plus a real continuity proof on one durable SQLite database, without drifting into broader operator tooling that belongs to later slices.

## Steps

1. Add `packages/review-broker-server/src/runtime/status-service.ts` and any needed `packages/review-broker-server/src/runtime/broker-service.ts` updates so review status/timeline responses expose reclaim-vs-detach outcome, machine-readable reason, action-required state, `claim_generation`, reviewer/session IDs, and recovery timestamps.
2. Implement `packages/review-broker-server/src/cli/start-broker.ts` so `--once` emits structured runtime inspection data, including `startupRecovery` summary and latest recovery evidence, by composing the runtime from `packages/review-broker-server/src/index.ts`.
3. Add `packages/review-broker-server/test/recovery-status-surfaces.test.ts` and `packages/review-broker-server/test/end-to-end-continuity-proof.test.ts` to assert that supported broker surfaces explain timeout/reviewer-exit recovery on one durable DB and that no review remains in unexplained claimed/stale limbo.
4. Update `package.json` and `.gitignore` with a root `broker:continuity` verification entry and any temp-path ignores needed for the proof harness.

## Must-Haves

- [ ] Supported broker inspection surfaces explain whether work was reclaimed or detached and why; raw SQLite reads are not the primary acceptance surface.
- [ ] The end-to-end proof uses a real reviewer subprocess and one durable SQLite file.
- [ ] The root verification entry makes the slice proof mechanically rerunnable from the repo root.

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/recovery-status-surfaces.test.ts packages/review-broker-server/test/end-to-end-continuity-proof.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 broker:continuity`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/m003-s01-inspect.sqlite --once`

## Observability Impact

- Signals added/changed: structured `startupRecovery` summaries, recovery reason/timestamp fields on status and timeline payloads, and root proof output that points to supported broker inspection paths.
- How a future agent inspects this: run `broker:continuity`, inspect `packages/review-broker-server/test/recovery-status-surfaces.test.ts`, and use `src/cli/start-broker.ts --once` to view recovery state without querying SQLite directly.
- Failure state exposed: missing recovery explanations, absent action-required visibility, or mismatch between persisted recovery state and surfaced inspection output becomes visible in the proof tests and CLI snapshot.

## Inputs

- `.gsd/milestones/M003/slices/S01/S01-PLAN.md` — slice demo and observability requirements.
- `package.json` — root workspace manifest from T01.
- `packages/review-broker-core/src/contracts.ts` — shared status/timeline schema definitions.
- `packages/review-broker-server/src/runtime/broker-service.ts` — live recovery behavior from T03.
- `packages/review-broker-server/src/runtime/reviewer-manager.ts` — real reviewer supervision from T03.
- `packages/review-broker-server/src/index.ts` — startup composition and stale-sweep ordering from T03.
- `packages/review-broker-server/test/claim-timeout-recovery.test.ts` — live timeout proof from T03.
- `packages/review-broker-server/test/reviewer-exit-recovery.test.ts` — live reviewer-exit proof from T03.

## Expected Output

- `packages/review-broker-server/src/runtime/status-service.ts` — recovery-aware status/timeline inspection helpers.
- `packages/review-broker-server/src/runtime/broker-service.ts` — surfaced recovery metadata for inspection.
- `packages/review-broker-server/src/cli/start-broker.ts` — structured `--once` inspection surface.
- `packages/review-broker-server/test/recovery-status-surfaces.test.ts` — inspection-surface proof.
- `packages/review-broker-server/test/end-to-end-continuity-proof.test.ts` — real subprocess + durable DB slice acceptance proof.
- `package.json` — root `broker:continuity` verification entry.
- `.gitignore` — temp proof artifact ignores.
