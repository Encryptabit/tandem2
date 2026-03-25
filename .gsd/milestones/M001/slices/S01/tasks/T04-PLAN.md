---
estimated_steps: 4
estimated_files: 6
skills_used:
  - gsd
  - test
  - debug-like-expert
  - review
  - lint
---

# T04: Wire the standalone runtime entrypoint and restart-safe proof

**Slice:** S01 — Broker core runtime with durable state
**Milestone:** M001

## Description

Close the slice by making the broker startable as its own TypeScript runtime and proving restart-safe persistence through the real entrypoint. This task turns the in-process service into something later client and MCP slices can actually launch and integrate with.

## Steps

1. Expose package entrypoints and a `src/cli/start-broker.ts` command that composes DB open, runtime context, and broker service startup in one place.
2. Add an automation-friendly `--once` or equivalent smoke mode so tests can prove startup/migration behavior without leaving a long-running process behind.
3. Add file-backed integration tests that create and claim a review, reopen the same SQLite file through a fresh runtime instance, and assert the persisted review plus audit state still exists.
4. Add a smoke test that invokes the standalone start command directly and proves it can initialize or reopen the DB without any Python broker dependency.

## Must-Haves

- [ ] The standalone broker has a real start command that later slices can launch without embedding broker logic inside another repo.
- [ ] Restart-safe integration proof reopens the same SQLite file and sees persisted review and audit state.
- [ ] The CLI smoke path proves startup + migration can run through the real entrypoint, not only through helper imports.

## Verification

- `pnpm test -- --run packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts`
- `pnpm --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s01-smoke.sqlite --once`

## Observability Impact

- Signals added/changed: startup/migration CLI output, reopen-safe persisted audit rows, and explicit startup failures tied to DB path/config problems.
- How a future agent inspects this: by rerunning the smoke command, reading the targeted restart/smoke tests, and opening the SQLite file left behind by the smoke path.
- Failure state exposed: bad DB paths, failed migrations, and restart persistence regressions become visible from the real entrypoint instead of only from internal helpers.

## Inputs

- `package.json` — root scripts from T01.
- `packages/review-broker-server/package.json` — server package scripts from T02.
- `packages/review-broker-server/src/db/open-database.ts` — DB bootstrap from T02.
- `packages/review-broker-server/src/runtime/app-context.ts` — runtime composition from T03.
- `packages/review-broker-server/src/runtime/broker-service.ts` — implemented S01 broker service from T03.
- `.gitignore` — ensure temporary smoke DB artifacts stay ignored if needed.

## Expected Output

- `packages/review-broker-server/src/cli/start-broker.ts` — standalone broker start command.
- `packages/review-broker-server/src/index.ts` — package entry exports for later client/runtime integration.
- `packages/review-broker-server/test/restart-persistence.test.ts` — restart-safe file-backed integration proof.
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — real entrypoint smoke proof.
- `package.json` — final root script wiring for broker start/test/build commands.
- `.gitignore` — ignored temp DB path for smoke runs if the task adds one.
