---
estimated_steps: 4
estimated_files: 6
skills_used:
  - gsd
  - test
  - review
  - debug-like-expert
---

# T01: Add the restart-safe cross-surface acceptance test

**Slice:** S05 — End-to-end standalone parity proof
**Milestone:** M001

## Description

Build the first final-assembly proof for M001 as an additive acceptance test. This task should create one new Vitest file that drives a single absolute SQLite database across typed-client runtime use, shutdown, real stdio MCP reopen, and final standalone inspection so the slice can prove review lifecycle parity survives restart across supported surfaces without adding a new transport.

## Steps

1. Create `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts` by reusing the absolute-path temp DB, fixture loading, typed-client harness, MCP stdio harness, and CLI inspection patterns already proven in the existing parity, restart, and smoke tests.
2. Implement a review-lifecycle scenario that starts with the typed client, persists state to SQLite, shuts the runtime down, reopens the same DB through real stdio MCP, verifies the previously written state, continues the lifecycle through MCP, and then reopens the same DB again through the typed client for final assertions.
3. Assert redaction-safe operational inspection on that same DB through `start-broker.ts --once` and/or `inspectBrokerRuntime()` so the acceptance proof checks both business state and supported diagnostics.
4. Keep boundary claims honest: only assert wait/version semantics inside a single runtime phase, and do not add a remote typed-client transport or cross-restart notification continuity claim.

## Must-Haves

- [ ] `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts` exists and is additive rather than rewriting the earlier slice tests.
- [ ] The new scenario uses one absolute temp SQLite file across sequential restarts and crosses both the typed-client and real stdio MCP surfaces.
- [ ] The scenario asserts review state, proposal/discussion/activity state, and standalone inspection output against the same persisted database.

## Verification

- `./node_modules/.bin/vitest run packages/review-broker-server/test/end-to-end-standalone-parity.test.ts`
- `test -f /home/cari/repos/tandem2/.gsd/worktrees/M001/packages/review-broker-server/test/end-to-end-standalone-parity.test.ts`

## Observability Impact

- Signals added/changed: the final acceptance proof now checks `broker.started` / `broker.once_complete` inspection output alongside persisted review lifecycle and activity signals across restarts.
- How a future agent inspects this: run `./node_modules/.bin/vitest run packages/review-broker-server/test/end-to-end-standalone-parity.test.ts` and read the failing phase in `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts` to see whether drift occurred during typed-client, MCP, restart, or CLI inspection phases.
- Failure state exposed: review-state drift, proposal/activity mismatch, or broken standalone inspection output becomes visible in one acceptance file instead of being inferred across multiple separate suites.

## Inputs

- `packages/review-broker-server/test/client-mcp-parity.test.ts` — in-memory shared-runtime parity pattern to reuse for assertions and helper structure.
- `packages/review-broker-server/test/restart-persistence.test.ts` — restart-safe persistence pattern and absolute DB handling to reuse.
- `packages/review-broker-server/test/mcp-server.test.ts` — real stdio MCP harness pattern to reuse.
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — standalone `start-broker.ts --once` inspection assertions to reuse.
- `packages/review-broker-client/test/in-process-client.test.ts` — typed-client harness pattern to reuse.
- `packages/review-broker-server/src/cli/start-broker.ts` — standalone inspection contract the new test must assert against.
- `packages/review-broker-server/src/cli/start-mcp.ts` — real MCP entrypoint the new test must exercise.

## Expected Output

- `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts` — additive acceptance test proving restart-safe review lifecycle parity across typed-client, real stdio MCP, and standalone inspection.
