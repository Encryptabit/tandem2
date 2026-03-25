---
id: S05
parent: M001
milestone: M001
status: complete
validated_requirements:
  - R001
  - R010
advanced_requirements:
  - R003
  - R004
  - R005
  - R006
  - R007
  - R012
---

# S05: End-to-end standalone parity proof

## Outcome
S05 closed M001. The standalone TypeScript broker is now mechanically proven as an assembled system rather than a collection of passing subsystems: one durable SQLite database can be driven through in-process typed-client mutations, real stdio MCP reopen/mutations, standalone `start-broker.ts --once` inspection, and startup-recovery reopen checks without contract drift or patch-body leakage.

This slice retired the last roadmap risk for M001: restart and recovery gaps are now covered by an additive end-to-end acceptance harness plus a root `broker:parity` entrypoint. The milestone is no longer relying on artifact inspection or isolated slice proofs alone.

## What this slice delivered

### 1. Final assembled parity harness in `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts`
S05 added the milestone-closing acceptance file with two real runtime scenarios:
- **Restart-safe lifecycle parity:** seed a review through the typed client, reopen the same DB through the real stdio MCP server, continue the lifecycle there, reopen again through the typed client, and finish with standalone `--once` inspection.
- **Startup-recovery parity:** seed stale reviewer-owned work through the low-level app context, reopen through `start-broker.ts --once` so startup recovery runs for real, then verify the persisted recovered state through real stdio MCP and the typed client.

The acceptance harness deliberately reuses supported surfaces rather than inventing a remote typed transport. The durable DB file is the cross-surface contract.

### 2. Redaction-safe operational inspection proved in the same acceptance flow
Both end-to-end scenarios inject a unique diff sentinel into the review patch and assert that it never appears in:
- standalone CLI stdout from `start-broker.ts --once`
- MCP stderr startup / failure diagnostics

That means the final proof covers both business-state parity and the observability constraint that operational logs stay useful without leaking raw patch bodies.

### 3. Root `broker:parity` verification entrypoint
The repo root now exposes:
- `broker:parity` → `vitest run packages/review-broker-server/test/end-to-end-standalone-parity.test.ts`

This gives M001 one obvious final-assembly gate alongside the existing regression pack and `broker:smoke`.

### 4. Reviewer recovery is re-proven through the assembled path
The recovery scenario proves the first standalone reopen performs the real recovery mutation and persists it durably:
- stale `claimed` and `submitted` reviews are reclaimed back to `pending`
- an already `approved` review remains `approved`
- the reviewer row becomes `offline` with `startup_recovery`
- `review.reclaimed` and `reviewer.offline` remain visible through activity/audit surfaces
- later MCP and typed-client reopens read the recovered rows instead of expecting recovery to run again

This is the key non-obvious pattern future work should preserve: **only the first reopened runtime should show a non-empty `startupRecovery` snapshot; later reopens should validate the persisted result.**

### 5. Prior slice proof remained green after final assembly work
S05 did not replace S02-S04 verification; it reran the focused regression pack and the explicit MCP structured-failure diagnostic check after landing the new end-to-end proof. That confirms the final acceptance harness sits on top of the existing contract instead of silently redefining it.

## Patterns established for later milestones
- **Use one absolute SQLite file as the parity seam.** Cross-surface final proof should reopen the same DB through supported runtimes instead of inventing new transports.
- **Use standalone `--once` as the recovery/inspection truth source.** It is the fastest way to prove startup recovery and inspect structured runtime state.
- **Keep MCP stdout protocol-clean and push diagnostics to stderr.** S05 re-proved this constraint under both startup and failure paths.
- **Assert persisted recovered state after the first recovery reopen.** Recovery is a one-time mutation, not a property every later runtime should repeat.
- **Treat redaction as part of the parity contract.** End-to-end proof should include negative assertions that patch bodies do not leak into operational surfaces.

## Verification performed
All slice-level verification from the plan passed.

### Automated verification
1. `./node_modules/.bin/vitest run packages/review-broker-server/test/end-to-end-standalone-parity.test.ts`
   - Result: **pass**
   - Evidence: 1 test file passed, 2 tests passed

2. `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:parity`
   - Result: **pass**
   - Evidence: root entrypoint ran the same 2-test acceptance file successfully

3. `./node_modules/.bin/vitest run packages/review-broker-server/test/client-mcp-parity.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts packages/review-broker-client/test/in-process-client.test.ts packages/review-broker-server/test/mcp-server.test.ts`
   - Result: **pass**
   - Evidence: 5 test files passed, 12 tests passed

4. `./node_modules/.bin/vitest run packages/review-broker-server/test/mcp-server.test.ts --testNamePattern "structured tool failures"`
   - Result: **pass**
   - Evidence: 1 targeted test passed with 3 skipped sibling tests

5. `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:smoke`
   - Result: **pass**
   - Evidence: emitted `broker.started` and `broker.once_complete` JSON with `migrations: ["001_init", "002_review_lifecycle_parity", "003_reviewer_lifecycle"]`, `migrationCount: 3`, and an empty fresh-DB `startupRecovery` snapshot

### Observability / diagnostic confirmation
The required observability surfaces are working and were re-checked during slice closeout:
- `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts` localizes parity drift across typed-client, MCP, standalone inspection, and recovery phases
- `start-broker.ts --once` emits structured `broker.started` / `broker.once_complete` JSON with `startupRecovery`, counts, and latest review/reviewer/message/audit snapshots
- `start-mcp.ts` keeps stdout protocol-clean while surfacing `mcp.started` and `mcp.tool_failed` diagnostics on stderr
- the focused structured-failure run confirms redacted MCP failure reporting still works after the new acceptance proof landed

## Requirement impact
- **Validated:** R001 standalone TypeScript broker/runtime is now proven through final assembled restart-safe and recovery-safe behavior
- **Validated:** R010 operational inspection is now proven through structured CLI snapshots, MCP diagnostics, reviewer recovery visibility, and end-to-end redaction checks
- **Re-proved in assembled form:** R003, R004, R006, and R007
- **Strengthened but not newly closed:**
  - R005 reviewer lifecycle ownership is re-confirmed through reviewer-state and recovery assertions, but the broader requirement still remains tracked from S03/M003 work
  - R012 is advanced by the final startup-recovery parity path, but broader timeout/continuity ownership still belongs to M003

## What the next milestone should know

### For M002 (GSD2 integration and review gating)
- Use the typed client as the deterministic integration seam; S05 confirmed it remains aligned with the real MCP and standalone runtime surfaces.
- When an integration needs proof across surfaces, reopen the same durable DB instead of building a new transport layer.
- Reuse `broker:parity` as the milestone-level regression gate before changing contract vocabulary or integration wiring.

### For later continuity work (M003)
- Recovery proof should distinguish between the runtime that performs recovery and later runtimes that only observe persisted recovered state.
- Keep claim-generation, reviewer-offline, and reclaim activity assertions visible through operator-facing inspection surfaces.

## Downstream cautions
- `broker:smoke` still resolves its relative DB path under `packages/review-broker-server/.tmp/` because `pnpm --filter review-broker-server exec ...` runs from that package directory.
- The MCP SDK in this harness still uses the monolithic `@modelcontextprotocol/sdk` package.
- The end-to-end parity harness depends on absolute-path temp SQLite files and sentinel-based redaction assertions; preserve both patterns if the test is expanded.

## Bottom line
S05 completed the milestone closeout proof. M001 now has one mechanical acceptance harness and one root parity command showing that the standalone broker, its SQLite state, reviewer recovery, typed client, MCP surface, and redaction-safe inspection all converge on the same persisted contract after restart and recovery.
