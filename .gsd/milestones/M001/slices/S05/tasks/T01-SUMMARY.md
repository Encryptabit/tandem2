---
id: T01
parent: S05
milestone: M001
provides:
  - Restart-safe acceptance coverage that proves one SQLite-backed review lifecycle stays aligned across typed-client, real stdio MCP, typed reopen, and standalone inspection.
key_files:
  - packages/review-broker-server/test/end-to-end-standalone-parity.test.ts
  - .gsd/milestones/M001/slices/S05/S05-PLAN.md
key_decisions:
  - Use one absolute temp SQLite file plus a diff sentinel so the acceptance test can verify cross-surface lifecycle parity and redaction-safe standalone inspection without inventing a new transport.
patterns_established:
  - Compare persisted review, proposal, discussion, and activity objects across surfaces while keeping wait/version claims scoped to single-runtime tests and verifying operational inspection through the real CLI.
observability_surfaces:
  - packages/review-broker-server/test/end-to-end-standalone-parity.test.ts
  - packages/review-broker-server/src/cli/start-broker.ts --once JSON output
  - packages/review-broker-server/src/cli/start-mcp.ts stderr diagnostics
  - .gsd/milestones/M001/slices/S05/S05-PLAN.md verification list
duration: 1h10m
verification_result: passed
completed_at: 2026-03-21T07:51:52-07:00
blocker_discovered: false
---

# T01: Add the restart-safe cross-surface acceptance test

**Added a restart-safe typed-client/MCP/standalone acceptance test for the persisted review lifecycle.**

## What Happened

I added `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts` as a new additive Vitest acceptance file that reuses the existing typed-client, real stdio MCP, and standalone CLI patterns instead of introducing any new transport. The scenario creates one review in a typed-client runtime against a single absolute SQLite path, persists a changes-requested state, shuts that runtime down, reopens the same database through the real stdio MCP server, verifies the persisted state, continues the lifecycle through requeue/approve/close on MCP, then reopens the same database through the typed client for final parity assertions.

To keep the inspection claim honest, the test also runs `start-broker.ts --once` against that same database and compares the resulting `broker.started` / `broker.once_complete` output to the persisted runtime snapshot. I embedded a unique patch-body sentinel in the diff and asserted that the standalone inspection output and MCP stderr diagnostics do not leak it, so the proof covers both persisted business state and redaction-safe operational inspection.

Per the pre-flight note, I also updated `.gsd/milestones/M001/slices/S05/S05-PLAN.md` to add an explicit diagnostic/failure-path verification entry for the MCP structured-failure test.

## Verification

Task-level verification passed:
- The new acceptance file exists.
- `./node_modules/.bin/vitest run packages/review-broker-server/test/end-to-end-standalone-parity.test.ts` passed.
- The new test proved one review lifecycle survives typed-client shutdown, stdio MCP reopen, typed reopen, and standalone `--once` inspection on the same absolute SQLite database.

Slice-level verification was also exercised for early feedback:
- The focused regression pack passed.
- The explicit MCP structured-failure diagnostic check passed.
- `broker:smoke` passed.
- `broker:parity` still fails at this stage because T02 has not yet wired the root script entrypoint.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `./node_modules/.bin/vitest run packages/review-broker-server/test/end-to-end-standalone-parity.test.ts` | 0 | ✅ pass | 1.97s |
| 2 | `test -f /home/cari/repos/tandem2/.gsd/worktrees/M001/packages/review-broker-server/test/end-to-end-standalone-parity.test.ts` | 0 | ✅ pass | <0.1s |
| 3 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:parity` | 243 | ❌ fail | 5.9s |
| 4 | `./node_modules/.bin/vitest run packages/review-broker-server/test/client-mcp-parity.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts packages/review-broker-client/test/in-process-client.test.ts packages/review-broker-server/test/mcp-server.test.ts` | 0 | ✅ pass | 5.58s |
| 5 | `./node_modules/.bin/vitest run packages/review-broker-server/test/mcp-server.test.ts --testNamePattern "structured tool failures"` | 0 | ✅ pass | 1.51s |
| 6 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:smoke` | 0 | ✅ pass | 5.9s |

## Diagnostics

To inspect this work later:
- Run `./node_modules/.bin/vitest run packages/review-broker-server/test/end-to-end-standalone-parity.test.ts` to localize drift to the typed-client seed phase, MCP reopen/mutation phase, typed reopen phase, or standalone inspection phase.
- Run `corepack pnpm --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path <absolute-db-path> --once` from the repo root to inspect `broker.started` / `broker.once_complete` JSON against persisted SQLite state.
- Run `corepack pnpm --filter review-broker-server exec tsx src/cli/start-mcp.ts --db-path <absolute-db-path> --cwd /home/cari/repos/tandem2/.gsd/worktrees/M001` and watch stderr for `mcp.started` / structured tool-failure diagnostics.

## Deviations

- Added the explicit MCP structured-failure verification line to `.gsd/milestones/M001/slices/S05/S05-PLAN.md` to satisfy the pre-flight observability-gap fix before implementation.

## Known Issues

- `broker:parity` is not wired yet, so the slice-level root parity command still fails. This is the expected T02 follow-up, not a blocker for T01.

## Files Created/Modified

- `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts` — new additive acceptance test covering typed-client restart, real stdio MCP reopen, typed reopen, and standalone inspection against one persisted SQLite database.
- `.gsd/milestones/M001/slices/S05/S05-PLAN.md` — marked T01 done and added the explicit diagnostic/failure-path verification entry required by the pre-flight note.
- `.gsd/milestones/M001/slices/S05/tasks/T01-SUMMARY.md` — recorded execution narrative, verification evidence, and the remaining T02 follow-up.
