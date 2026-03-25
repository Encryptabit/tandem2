---
id: T03
parent: S02
milestone: M003
provides:
  - Operators can run one broker-owned CLI to inspect startup recovery plus the typed runtime continuity snapshot, and the shipped dist artifacts now match the current broker contracts/CLI sources.
key_files:
  - packages/review-broker-server/src/cli/inspect-continuity.ts
  - packages/review-broker-server/src/cli/start-broker.ts
  - packages/review-broker-server/package.json
  - package.json
  - packages/review-broker-server/test/continuity-cli.test.ts
  - packages/review-broker-server/src/runtime/broker-service.ts
  - packages/review-broker-server/dist/cli/inspect-continuity.js
  - .gsd/KNOWLEDGE.md
key_decisions:
  - Keep the new operator CLI continuity-focused and redaction-safe by emitting `startupRecovery` plus the typed `inspectRuntimeContinuity()` payload directly, while leaving the broader runtime inventory/counts on `start-broker.ts --once`.
patterns_established:
  - Thin operator CLIs can start the broker, let the normal startup sweep run, then print one broker-owned service snapshot instead of adding ad hoc SQLite inspection logic.
observability_surfaces:
  - packages/review-broker-server/src/cli/inspect-continuity.ts
  - packages/review-broker-server/src/cli/start-broker.ts --once
  - packages/review-broker-server/test/continuity-cli.test.ts
  - durable dist artifacts under packages/review-broker-*/dist
  - .gsd/KNOWLEDGE.md
duration: 31m
verification_result: passed
completed_at: 2026-03-24T01:58:30-07:00
blocker_discovered: false
---

# T03: Add the operator continuity CLI and sync shipped artifacts

**Added a broker-owned continuity inspection CLI, aligned the command surface, and regenerated the shipped dist artifacts.**

## What Happened

I added `packages/review-broker-server/src/cli/inspect-continuity.ts` as a thin broker-first command that starts the runtime, lets the normal startup recovery sweep run, calls the dedicated `inspectRuntimeContinuity()` service surface from T02, and emits one structured JSON payload containing `startupRecovery` plus the continuity snapshot. The command follows the existing CLI option style (`--db-path`, `--cwd`, `--busy-timeout-ms`) and adds `--limit` for recent continuity activity, with help text that makes absolute `--db-path` usage explicit for durable inspection.

I then aligned the shipped command surface by updating `packages/review-broker-server/package.json` and the repo-root `package.json` to expose the new command cleanly, and I refreshed `start-broker.ts` help output so operators can discover the continuity-focused path without guessing. While proving the CLI end to end, the regression test exposed one real redaction gap: seeded reviewer rows can persist an absolute command path, so the continuity reviewer projection must basename that value before exposing `commandBasename`. I fixed that in `packages/review-broker-server/src/runtime/broker-service.ts` so the continuity contract stays argv-safe and path-safe for both live and fixture-seeded reviewer rows.

For verification, I added `packages/review-broker-server/test/continuity-cli.test.ts`. The test seeds stale reviewer ownership into one durable SQLite file, runs the real CLI entrypoint, proves the command reports startup recovery, reviewer state, current ownership/action-required cases, and recent recovery activity, asserts that secret-bearing reviewer argv does not leak into the continuity payload, and compares the shared continuity fields with `start-broker.ts --once` on the same recovered database.

Finally, I ran the workspace build to regenerate the shipped artifacts, including `packages/review-broker-core/dist/index.js`, `packages/review-broker-client/dist/index.js`, and `packages/review-broker-server/dist/cli/inspect-continuity.js`, so later slices and `tsx`/Vitest paths are not validating stale JS outputs.

## Verification

I ran the full S02 slice verification gate after landing the CLI and redaction fix. Both existing slice test lanes still pass, the new `continuity-cli.test.ts` passes, the workspace build passes and regenerates the requested dist outputs, and both real broker CLI proof commands succeed against the durable SQLite path from the slice plan.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts packages/review-broker-server/test/runtime-continuity-inspection.test.ts` | 0 | ✅ pass | 1.79s |
| 2 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-core/test/runtime-continuity-contracts.test.ts packages/review-broker-server/test/client-mcp-parity.test.ts packages/review-broker-server/test/mcp-server.test.ts` | 0 | ✅ pass | 3.83s |
| 3 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/continuity-cli.test.ts` | 0 | ✅ pass | 1.77s |
| 4 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 build` | 0 | ✅ pass | 4.53s |
| 5 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s02-inspect.sqlite --once` | 0 | ✅ pass | 0.70s |
| 6 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/inspect-continuity.ts --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s02-inspect.sqlite --limit 10` | 0 | ✅ pass | 0.72s |
| 7 | `test -f /home/cari/repos/tandem2/.gsd/worktrees/M003/packages/review-broker-core/dist/index.js && test -f /home/cari/repos/tandem2/.gsd/worktrees/M003/packages/review-broker-client/dist/index.js && test -f /home/cari/repos/tandem2/.gsd/worktrees/M003/packages/review-broker-server/dist/cli/inspect-continuity.js` | 0 | ✅ pass | 0.00s |

## Diagnostics

Use `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/inspect-continuity.ts --db-path /absolute/path/to/review-broker.sqlite --limit 10` to inspect startup recovery plus the broker-owned continuity snapshot from a durable SQLite file. For the broader runtime inventory, compare that output with `src/cli/start-broker.ts --once` against the same DB. The CLI/test path now guarantees the continuity payload remains patch-body-safe and argv-safe by exposing reviewer IDs, session IDs, statuses, command basenames, reasons, counts, and timestamps without raw args or command text.

## Deviations

- I narrowed the parity check against `start-broker.ts --once` to the continuity fields both commands intentionally share. The once-mode runtime snapshot does not expose the dedicated continuity reviewer list, so the test compares the shared continuity aggregates/history while asserting the new CLI-specific reviewer projection separately.

## Known Issues

None.

## Files Created/Modified

- `packages/review-broker-server/src/cli/inspect-continuity.ts` — added the new broker-owned continuity inspection CLI with help, limit parsing, and structured JSON output.
- `packages/review-broker-server/src/cli/start-broker.ts` — clarified help output so operators can discover the continuity command and prefer absolute `--db-path` usage.
- `packages/review-broker-server/package.json` — exposed the continuity CLI through package scripts and a shipped bin entry.
- `package.json` — added a repo-root script for the new continuity command.
- `packages/review-broker-server/test/continuity-cli.test.ts` — added the durable SQLite regression proof for startup recovery, continuity state, redaction safety, and parity with shared once-mode continuity fields.
- `packages/review-broker-server/src/runtime/broker-service.ts` — basename-normalized `commandBasename` so continuity reviewer snapshots stay path-safe for seeded and live reviewers.
- `packages/review-broker-core/dist/index.js` — regenerated shipped core artifact during the successful workspace build.
- `packages/review-broker-client/dist/index.js` — regenerated shipped client artifact during the successful workspace build.
- `packages/review-broker-server/dist/cli/inspect-continuity.js` — generated the shipped CLI artifact for the new operator command.
- `.gsd/KNOWLEDGE.md` — recorded the command-basename redaction gotcha for future continuity work.
