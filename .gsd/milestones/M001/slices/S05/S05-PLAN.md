# S05: End-to-end standalone parity proof

**Goal:** Close M001 by proving the assembled standalone broker survives restart and still preserves the review lifecycle, reviewer lifecycle, typed-client surface, MCP surface, and redaction-safe operational inspection on one durable SQLite state model.
**Demo:** A single absolute-path SQLite database can be driven through sequential typed-client, standalone restart, real stdio MCP, and startup-recovery phases, and every surface reports the same persisted review/reviewer/audit state after reopen.

## Requirement Focus

This slice primarily owns **R001** for the milestone closeout proof. It also re-proves assembled behavior for **R003**, **R004**, **R005**, **R006**, **R007**, and **R010**, and it advances **R012** by checking startup recovery through the final integrated path.

## Decomposition Rationale

This slice is intentionally split into two executable increments instead of many small setup tasks. The first task closes the main open risk from the roadmap: one restart-safe review lifecycle scenario that crosses typed client, real stdio MCP, and standalone inspection without inventing a new transport. The second task extends that same acceptance harness to the reviewer recovery path and adds a named root verification entry so the milestone has an obvious final-assembly gate.

That grouping keeps each task small enough for a fresh executor context window while still producing user-visible progress after each task. Task 1 gives the milestone its first true assembled parity proof. Task 2 finishes the reviewer/recovery half and turns the proof into a repeatable acceptance command plus regression pack.

## Must-Haves

- `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts` adds an additive acceptance proof that drives one absolute SQLite database through typed-client writes, runtime restart, real stdio MCP reads/writes, and final standalone inspection, directly advancing R001 while re-proving R003, R004, R006, R007, and R010 together.
- The final acceptance proof also exercises reviewer lifecycle and startup recovery by seeding stale reviewer-owned work with the existing low-level context pattern and then verifying recovered state through `start-broker.ts --once`, real stdio MCP, and the typed client, directly re-proving R005 and advancing R012.
- A root `broker:parity` verification entry remains mechanically runnable from the repo alongside the existing S02-S04 regression pack and `broker:smoke`, so milestone completion depends on live integrated behavior rather than artifact inspection alone.

## Proof Level

- This slice proves: final-assembly
- Real runtime required: yes
- Human/UAT required: no

## Verification

- `./node_modules/.bin/vitest run packages/review-broker-server/test/end-to-end-standalone-parity.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:parity`
- `./node_modules/.bin/vitest run packages/review-broker-server/test/client-mcp-parity.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts packages/review-broker-client/test/in-process-client.test.ts packages/review-broker-server/test/mcp-server.test.ts`
- `./node_modules/.bin/vitest run packages/review-broker-server/test/mcp-server.test.ts --testNamePattern "structured tool failures"`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:smoke`

## Observability / Diagnostics

- Runtime signals: `review.reclaimed`, `reviewer.offline`, lifecycle/activity-feed events, `broker.started`, `broker.once_complete`, and MCP `mcp.started` / tool-failure stderr diagnostics must stay inspectable through the assembled proof.
- Inspection surfaces: `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts`, `packages/review-broker-server/src/cli/start-broker.ts --once`, the real stdio MCP transport in `packages/review-broker-server/src/cli/start-mcp.ts`, and persisted SQLite rows/assertions exercised by the tests.
- Failure visibility: if parity drifts, the failing phase must localize whether the mismatch is in persisted review state, reviewer recovery state, MCP stderr diagnostics, or standalone inspection output.
- Redaction constraints: keep MCP stdout protocol-clean, keep operational logs on stderr where required, and never assert on or emit raw patch bodies or secret-bearing reviewer argv.

## Integration Closure

- Upstream surfaces consumed: `packages/review-broker-server/src/index.ts`, `packages/review-broker-server/src/cli/start-broker.ts`, `packages/review-broker-server/src/cli/start-mcp.ts`, `packages/review-broker-server/test/client-mcp-parity.test.ts`, `packages/review-broker-server/test/restart-persistence.test.ts`, `packages/review-broker-server/test/start-broker.smoke.test.ts`, `packages/review-broker-server/test/mcp-server.test.ts`, and `packages/review-broker-client/test/in-process-client.test.ts`.
- New wiring introduced in this slice: `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts` as the final acceptance harness, plus a root `broker:parity` package script so the proof can be invoked directly.
- What remains before the milestone is truly usable end-to-end: nothing in M001 once this slice and its verification pass.

## Tasks

- [x] **T01: Add the restart-safe cross-surface acceptance test** `est:1h30m`
  - Why: The milestone still lacks one additive proof that a real persisted review can move from typed client to restart to real stdio MCP and back without the surfaces drifting.
  - Files: `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts`, `packages/review-broker-server/test/client-mcp-parity.test.ts`, `packages/review-broker-server/test/restart-persistence.test.ts`, `packages/review-broker-server/test/mcp-server.test.ts`, `packages/review-broker-server/test/start-broker.smoke.test.ts`, `packages/review-broker-client/test/in-process-client.test.ts`
  - Do: Create a new additive Vitest file that reuses the existing harness patterns to drive one absolute temp SQLite DB through typed-client lifecycle mutations, runtime shutdown, real stdio MCP reopen, additional lifecycle mutations, final typed-client reopen, and standalone `start-broker.ts --once` inspection; keep wait/version assertions scoped to one runtime phase at a time and do not invent a remote typed transport.
  - Verify: `./node_modules/.bin/vitest run packages/review-broker-server/test/end-to-end-standalone-parity.test.ts`
  - Done when: the new acceptance file passes with at least one review-lifecycle scenario that proves persisted state, activity, and standalone inspection stay aligned across typed-client and real MCP restarts.
- [x] **T02: Finish reviewer-recovery parity and wire the `broker:parity` entrypoint** `est:1h15m`
  - Why: S05 is not closed until reviewer lifecycle and startup recovery are proven through the same assembled path and the final acceptance proof is easy to rerun.
  - Files: `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts`, `package.json`, `packages/review-broker-server/test/restart-persistence.test.ts`, `packages/review-broker-server/test/start-broker.smoke.test.ts`, `packages/review-broker-server/test/mcp-server.test.ts`, `packages/review-broker-client/test/in-process-client.test.ts`
  - Do: Extend the new acceptance test with a stale-reviewer startup-recovery scenario seeded via the existing low-level context pattern; verify the recovered reviewer/review/audit state through `start-broker.ts --once`, real stdio MCP, and typed client; then add a root `broker:parity` package script that points at the final parity proof using command forms already known to work in this harness.
  - Verify: `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:parity && ./node_modules/.bin/vitest run packages/review-broker-server/test/client-mcp-parity.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts packages/review-broker-client/test/in-process-client.test.ts packages/review-broker-server/test/mcp-server.test.ts && corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:smoke`
  - Done when: the acceptance file proves both restart-safe lifecycle parity and startup recovery parity, `broker:parity` runs the final proof from the repo root, and the focused regression pack plus smoke command stay green.

## Files Likely Touched

- `package.json`
- `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts`
