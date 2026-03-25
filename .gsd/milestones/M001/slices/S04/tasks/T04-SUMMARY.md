---
id: T04
parent: S04
milestone: M001
provides:
  - Cross-surface parity proof that the typed client and MCP server share one broker state model, preserve wait semantics, and expose matching reviewer/audit vocabulary
key_files:
  - packages/review-broker-server/test/client-mcp-parity.test.ts
  - packages/review-broker-server/test/review-lifecycle-parity.test.ts
  - .gsd/KNOWLEDGE.md
  - .gsd/milestones/M001/slices/S04/S04-PLAN.md
key_decisions:
  - Use the MCP SDK's in-process `InMemoryTransport` for the new parity proof so the typed client and MCP client exercise the exact same `BrokerService` instance while stdio transport behavior remains covered by `mcp-server.test.ts`
patterns_established:
  - For broker cross-surface parity, compare the same review/reviewer payloads through both surfaces after each mutation and use one surface's wait call while the other surface performs the mutation
observability_surfaces:
  - packages/review-broker-server/test/client-mcp-parity.test.ts
  - packages/review-broker-server/test/review-lifecycle-parity.test.ts
  - packages/review-broker-server/test/mcp-server.test.ts
  - corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:smoke
duration: 45m
verification_result: passed
completed_at: 2026-03-21T07:20:36-07:00
blocker_discovered: false
---

# T04: Prove typed-client and MCP parity against one broker state model

**Added a shared-runtime client/MCP parity suite and fixed lifecycle clock fixtures so the full S04 verification matrix passes.**

## What Happened

I added `packages/review-broker-server/test/client-mcp-parity.test.ts` as the slice-closing proof. The new suite starts one real broker runtime, wraps its `BrokerService` with the typed in-process client, and connects an MCP client to the same service through the official SDK's `InMemoryTransport`. That lets the test prove true cross-surface parity against one broker state model instead of only comparing two similar-looking adapters.

The parity flow now proves both directions:
- the typed client creates broker state that MCP reads back,
- MCP creates broker state that the typed client reads back,
- an MCP wait call resolves from a client-side mutation,
- a typed-client wait call resolves from an MCP-side mutation, and
- reviewer offline/requeue/audit vocabulary stays identical when the reviewer is killed through MCP and inspected through both surfaces.

While closing the slice, I also fixed `packages/review-broker-server/test/review-lifecycle-parity.test.ts`. The failures were not a runtime regression; the deterministic timestamp queues were one call short after `startBroker()` consumed time for startup recovery bookkeeping. I extended those queues and aligned the explicit timestamp expectations to the actual mutation order, which restored the existing lifecycle proof without changing runtime behavior.

Finally, I recorded the MCP `InMemoryTransport` test-harness pattern in `.gsd/KNOWLEDGE.md` because it is the cleanest way to prove one-service parity in this repo without spinning up a second runtime.

## Verification

I first ran focused checks for the two changed test files:
- `packages/review-broker-server/test/client-mcp-parity.test.ts`
- `packages/review-broker-server/test/review-lifecycle-parity.test.ts`

After those passed, I ran the full S04 slice verification matrix. All required slice commands now pass, including the previously failing lifecycle/recovery bundle and the broker smoke command.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/reviewer-contracts.test.ts` | 0 | ✅ pass | 1.40s |
| 2 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-client/test/in-process-client.test.ts` | 0 | ✅ pass | 1.89s |
| 3 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/mcp-server.test.ts` | 0 | ✅ pass | 6.56s |
| 4 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/mcp-server.test.ts packages/review-broker-server/test/client-mcp-parity.test.ts` | 0 | ✅ pass | 6.58s |
| 5 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/review-lifecycle-parity.test.ts packages/review-broker-server/test/reviewer-lifecycle.test.ts packages/review-broker-server/test/reviewer-recovery.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts` | 0 | ✅ pass | 2.55s |
| 6 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:smoke` | 0 | ✅ pass | not captured |

## Diagnostics

Use these surfaces to inspect the completed S04 contract:
- `packages/review-broker-server/test/client-mcp-parity.test.ts` — shared-runtime parity proof across typed client and MCP, including wait semantics and reviewer/offline/audit vocabulary.
- `packages/review-broker-server/test/review-lifecycle-parity.test.ts` — deterministic lifecycle timestamp proof for review discussion, verdict, close, and rejection paths.
- `packages/review-broker-server/test/mcp-server.test.ts` — stdio MCP transport behavior, failure-path localization, and stderr-only diagnostics.
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:smoke` — structured broker startup/once-complete inspection surface.

## Deviations

For the new parity proof, I used the official MCP SDK's in-process `InMemoryTransport` instead of adding another stdio-subprocess harness. This keeps the new test focused on the task's “one broker state model” requirement, while `packages/review-broker-server/test/mcp-server.test.ts` continues to cover the real stdio transport contract from T03.

## Known Issues

None.

## Files Created/Modified

- `packages/review-broker-server/test/client-mcp-parity.test.ts` — added the shared-runtime typed-client/MCP parity proof with cross-surface waits, reviewer lifecycle parity, and audit-vocabulary assertions.
- `packages/review-broker-server/test/review-lifecycle-parity.test.ts` — fixed deterministic timestamp queues and aligned explicit lifecycle timestamps with the runtime's real mutation order.
- `.gsd/KNOWLEDGE.md` — recorded the `@modelcontextprotocol/sdk/inMemory.js` parity-test pattern for future agents.
- `.gsd/milestones/M001/slices/S04/S04-PLAN.md` — marked T04 complete.
