---
id: T02
parent: S05
milestone: M001
provides:
  - Final assembled parity coverage for startup recovery across standalone inspection, real stdio MCP reads, and typed-client reads on one persisted SQLite database.
key_files:
  - packages/review-broker-server/test/end-to-end-standalone-parity.test.ts
  - package.json
  - .gsd/KNOWLEDGE.md
key_decisions:
  - Use the standalone `start-broker.ts --once` reopen as the single startup-recovery mutation phase, then assert persisted recovered state through later MCP and typed-client reopens instead of expecting recovery to trigger again.
patterns_established:
  - Seed stale reviewer-owned work through the low-level app-context path, prove `startupRecovery` and redaction-safe diagnostics on the first real standalone reopen, then compare persisted reviewer/review/activity state across MCP and typed-client reads.
observability_surfaces:
  - packages/review-broker-server/test/end-to-end-standalone-parity.test.ts
  - packages/review-broker-server/src/cli/start-broker.ts --once JSON output
  - packages/review-broker-server/src/cli/start-mcp.ts stderr `mcp.started` / tool-failure diagnostics
  - .gsd/KNOWLEDGE.md
duration: 1h20m
verification_result: passed
completed_at: 2026-03-21T08:04:30-07:00
blocker_discovered: false
---

# T02: Finish reviewer-recovery parity and wire the `broker:parity` entrypoint

**Extended the standalone parity proof to cover startup recovery and added the root `broker:parity` verification entrypoint.**

## What Happened

I extended `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts` with a second additive acceptance scenario that seeds stale reviewer-owned work through the low-level `createAppContext()` / `createBrokerService()` path, then reopens that same absolute SQLite database through `start-broker.ts --once`, the real stdio MCP server, and the in-process typed client.

The new scenario proves the reviewer lifecycle vocabulary through the assembled path instead of only isolated restart tests. It asserts that the first standalone reopen reports a non-empty `startupRecovery` snapshot, reclaims both `claimed` and `submitted` reviews back to `pending`, leaves an already `approved` review untouched, persists the reviewer as `offline` with `startup_recovery`, and keeps patch-body redaction intact on standalone stdout and MCP stderr.

After that first standalone recovery phase, the test reopens the same DB through the real MCP transport and the typed client and compares the persisted recovered state there: reviewer rows, per-review status payloads, and activity-feed evidence for `review.reclaimed`, `reviewer.offline`, discussion history, and the approved review that should not be reclaimed. I also added the root `broker:parity` script in `package.json` so the full acceptance proof is mechanically runnable from the repo root.

Finally, I recorded one non-obvious harness rule in `.gsd/KNOWLEDGE.md`: only the first reopened runtime should expose a non-empty `startupRecovery` snapshot, so later reopens should assert persisted recovered state rather than expecting recovery to execute again.

## Verification

I first ran the acceptance file directly to debug the new scenario in isolation until both parity phases passed. After that, I ran the full slice verification set: the direct standalone parity test, the new `broker:parity` entrypoint, the focused S02-S04 regression pack, the explicit MCP structured-failure diagnostic check, and `broker:smoke`. All required checks passed.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `./node_modules/.bin/vitest run packages/review-broker-server/test/end-to-end-standalone-parity.test.ts` | 0 | ✅ pass | 3.16s |
| 2 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:parity` | 0 | ✅ pass | 3.78s |
| 3 | `./node_modules/.bin/vitest run packages/review-broker-server/test/client-mcp-parity.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts packages/review-broker-client/test/in-process-client.test.ts packages/review-broker-server/test/mcp-server.test.ts` | 0 | ✅ pass | 5.55s |
| 4 | `./node_modules/.bin/vitest run packages/review-broker-server/test/mcp-server.test.ts --testNamePattern "structured tool failures"` | 0 | ✅ pass | 1.53s |
| 5 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:smoke` | 0 | ✅ pass | 0.95s |

## Diagnostics

To inspect this work later:
- Run `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:parity` to exercise both the restart-safe lifecycle phase and the startup-recovery phase in one acceptance file.
- In `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts`, the startup-recovery scenario localizes drift to one of three boundaries: standalone `--once` recovery/inspection, persisted-state reads through real stdio MCP, or persisted-state reads through the typed client.
- Use `corepack pnpm --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path <absolute-db-path> --once` to inspect `broker.started` / `broker.once_complete` JSON, especially the `startupRecovery` payload and reviewer/review count snapshots.
- Use `corepack pnpm --filter review-broker-server exec tsx src/cli/start-mcp.ts --db-path <absolute-db-path> --cwd /home/cari/repos/tandem2/.gsd/worktrees/M001` and watch stderr for `mcp.started` / `mcp.tool_failed` diagnostics while keeping stdout protocol-clean.
- For this recovery path specifically, only the first reopened runtime should show non-empty `startupRecovery`; later MCP and typed reopens should be validated through persisted reviewer/review/activity state instead.

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts` — added the startup-recovery parity scenario and helper seeding/assertion utilities for standalone, MCP, and typed-client recovery checks.
- `package.json` — added the root `broker:parity` verification script for the final acceptance proof.
- `.gsd/KNOWLEDGE.md` — recorded the non-obvious recovery-testing rule about `startupRecovery` appearing only on the first reopened runtime.
- `.gsd/milestones/M001/slices/S05/S05-PLAN.md` — marked T02 done.
- `.gsd/milestones/M001/slices/S05/tasks/T02-SUMMARY.md` — recorded execution, diagnostics, and verification evidence.
