---
estimated_steps: 4
estimated_files: 8
skills_used:
  - gsd
  - test
---

# T03: Add the operator continuity CLI and sync shipped artifacts

**Slice:** S02 — Restart sweep and continuity commands
**Milestone:** M003

## Description

Close the slice with a broker-owned CLI command that emits the same typed continuity snapshot after startup recovery. The command should stay thin, reuse the runtime/service work from T01-T02, and leave the repo with regenerated distributable artifacts so later slices are not validating stale JS outputs.

## Steps

1. Add `packages/review-broker-server/src/cli/inspect-continuity.ts` as a thin CLI that starts the broker, runs the startup sweep, calls the dedicated continuity inspection surface, and emits structured JSON for startup summary plus current continuity state.
2. Update `packages/review-broker-server/src/cli/start-broker.ts`, `packages/review-broker-server/package.json`, and the repo `package.json` only as needed to expose the new command cleanly and to keep absolute `--db-path` usage obvious in scripts or help output.
3. Add `packages/review-broker-server/test/continuity-cli.test.ts` to prove the CLI reports startup recovery, current ownership, recent recovery actions, and action-required cases from one durable SQLite file without raw DB inspection.
4. Regenerate the shipped build artifacts, including `packages/review-broker-core/dist/index.js`, `packages/review-broker-client/dist/index.js`, and `packages/review-broker-server/dist/cli/inspect-continuity.js`, then run the slice-level build and real CLI proof commands.

## Must-Haves

- [ ] The new CLI stays broker-first and reuses the typed continuity snapshot instead of querying SQLite directly.
- [ ] Operator output includes startup recovery summary plus current ownership, recent recovery actions, reviewer state, and action-required visibility on one durable DB.
- [ ] Built artifacts are regenerated after the contract/CLI changes so future tests do not read stale dist output.

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/continuity-cli.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 build`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/inspect-continuity.ts --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s02-inspect.sqlite --limit 10`

## Observability Impact

- Signals added/changed: operator-facing CLI output now exposes startup recovery and runtime continuity snapshots from supported broker surfaces.
- How a future agent inspects this: run the continuity CLI against a durable SQLite file, compare its JSON with `start-broker.ts --once`, and use the named CLI test as a regression guard.
- Failure state exposed: missing startup summary fields, stale artifact drift, or mismatched CLI/runtime payloads show up in the CLI test, build step, or real command output.

## Inputs

- `.gsd/milestones/M003/slices/S02/S02-PLAN.md` — slice demo and final verification targets.
- `packages/review-broker-server/src/db/audit-repository.ts` — T01 continuity-history query feeding runtime inspection.
- `packages/review-broker-server/src/runtime/status-service.ts` — T01 runtime continuity snapshot consumed by the published command.
- `packages/review-broker-server/src/index.ts` — T01 broker runtime snapshot and startup composition.
- `packages/review-broker-core/src/contracts.ts` — T02 shared continuity operation schemas.
- `packages/review-broker-core/src/operations.ts` — T02 broker registry entry for runtime continuity.
- `packages/review-broker-server/src/runtime/broker-service.ts` — T02 service method exposing runtime continuity.
- `packages/review-broker-server/test/client-mcp-parity.test.ts` — T02 parity expectations for the published snapshot.
- `packages/review-broker-server/src/cli/start-broker.ts` — existing broker CLI entrypoint and once-mode output style.
- `packages/review-broker-server/package.json` — package bin/scripts surface.
- `package.json` — repo-root scripts used for rerunnable proof.

## Expected Output

- `packages/review-broker-server/src/cli/inspect-continuity.ts` — thin operator CLI for startup recovery plus runtime continuity inspection.
- `packages/review-broker-server/src/cli/start-broker.ts` — aligned help/output or command wiring for the continuity CLI.
- `packages/review-broker-server/package.json` — package-level CLI exposure for the new command.
- `package.json` — repo-root script exposing the continuity command or proof lane.
- `packages/review-broker-server/test/continuity-cli.test.ts` — durable SQLite CLI proof.
- `packages/review-broker-core/dist/index.js` — regenerated core distributable artifact.
- `packages/review-broker-client/dist/index.js` — regenerated client distributable artifact.
- `packages/review-broker-server/dist/cli/inspect-continuity.js` — regenerated server CLI distributable artifact.
