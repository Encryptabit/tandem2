---
estimated_steps: 4
estimated_files: 4
skills_used:
  - gsd
  - test
---

# T02: Align the shipped continuity acceptance lane and operator proof commands

**Slice:** S03 — End-to-end crash/restart continuity proof
**Milestone:** M003

## Description

Close the slice operationally by making the broadened crash/restart proof easy to rerun through shipped entrypoints. This task should align the repo continuity command and focused operator regression tests with the assembled durable-state story so later agents can re-prove M003 without reconstructing ad hoc commands.

## Steps

1. Update `package.json` and `packages/review-broker-server/package.json` so the continuity proof entrypoints run the broadened S03 lane instead of only the earlier narrower coverage.
2. Tighten `packages/review-broker-server/test/recovery-status-surfaces.test.ts` so the supported in-process status/timeline/runtime surfaces explicitly cover the combined continuity vocabulary and durable-state expectations that matter after T01.
3. Tighten `packages/review-broker-server/test/continuity-cli.test.ts` so `inspect-continuity.ts` and `start-broker.ts --once` prove the assembled continuity story on a durable SQLite file using absolute `--db-path` values and redaction-safe output.
4. Re-run the repo-level continuity command plus the direct CLI/operator proof commands and keep all acceptance assertions on supported broker surfaces rather than raw DB inspection.

## Must-Haves

- [ ] Repo and package continuity commands make the full assembled S03 proof rerunnable from supported entrypoints.
- [ ] Operator-facing tests verify both `inspect-continuity.ts` and `start-broker.ts --once` against the durable crash/restart continuity story.
- [ ] Acceptance remains redaction-safe and avoids raw SQLite reads outside deterministic test seeding.

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/recovery-status-surfaces.test.ts packages/review-broker-server/test/continuity-cli.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 broker:continuity`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s03-continuity.sqlite --once`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/inspect-continuity.ts --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s03-continuity.sqlite --limit 10`

## Observability Impact

- Signals added/changed: the repo-level continuity lane and focused operator tests now validate the same continuity summaries operators use in practice.
- How a future agent inspects this: run `broker:continuity`, then compare the JSON emitted by the direct `start-broker.ts --once` and `inspect-continuity.ts` commands on the same absolute DB path.
- Failure state exposed: stale proof scripts, mismatched CLI/runtime continuity output, or redaction regressions show up directly in the named tests and command output.

## Inputs

- `.gsd/milestones/M003/slices/S03/S03-PLAN.md` — slice verification and acceptance intent.
- `.gsd/milestones/M003/slices/S03/tasks/T01-PLAN.md` — broadened integrated proof this task packages into rerunnable entrypoints.
- `package.json` — repo-level continuity proof command.
- `packages/review-broker-server/package.json` — package-level broker proof entrypoints.
- `packages/review-broker-server/test/recovery-status-surfaces.test.ts` — supported in-process surface regression harness.
- `packages/review-broker-server/test/continuity-cli.test.ts` — focused operator CLI regression harness.
- `packages/review-broker-server/src/cli/start-broker.ts` — broader once-mode operator surface used in proof commands.
- `packages/review-broker-server/src/cli/inspect-continuity.ts` — focused operator continuity surface used in proof commands.

## Expected Output

- `package.json` — repo continuity proof command aligned to the assembled S03 lane.
- `packages/review-broker-server/package.json` — package proof entrypoints aligned with the broadened continuity acceptance story.
- `packages/review-broker-server/test/recovery-status-surfaces.test.ts` — status/timeline/runtime regression coverage aligned with the assembled proof.
- `packages/review-broker-server/test/continuity-cli.test.ts` — CLI/operator regression coverage aligned with the assembled proof.
