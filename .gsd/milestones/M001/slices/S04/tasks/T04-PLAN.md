---
estimated_steps: 4
estimated_files: 6
skills_used:
  - gsd
  - best-practices
  - debug-like-expert
  - review
  - test
---

# T04: Prove typed-client and MCP parity against one broker state model

**Slice:** S04 — Typed client and MCP exposure
**Milestone:** M001

## Description

Close the slice with cross-surface proof instead of isolated feature tests. This task should show that the typed client and MCP server observe and mutate one broker state model, preserve versioned wait semantics, and do not regress the lifecycle/recovery behavior already locked in by S02 and S03.

## Steps

1. Add a cross-surface parity test that starts one real broker runtime, performs representative review and reviewer mutations through one surface, and reads them back through the other.
2. Exercise at least one versioned wait path (`wait`, `sinceVersion`, `timeoutMs`) so the new surfaces prove they preserve the notification contract rather than only CRUD payload shapes.
3. Assert that reviewer/offline/audit vocabulary stays consistent across typed-client and MCP responses, especially for S03-style lifecycle visibility.
4. Finish by rerunning the existing review/reviewer parity and recovery suites so S04 proves integration closure instead of introducing cross-surface regressions.

## Must-Haves

- [ ] The new parity proof demonstrates shared SQLite-backed state, not two disconnected adapters.
- [ ] At least one wait/version scenario is exercised through a client or MCP boundary.
- [ ] Existing S02/S03 lifecycle and recovery proof remains green after the new external surfaces are wired in.

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-client/test/in-process-client.test.ts packages/review-broker-server/test/mcp-server.test.ts packages/review-broker-server/test/client-mcp-parity.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/review-lifecycle-parity.test.ts packages/review-broker-server/test/reviewer-lifecycle.test.ts packages/review-broker-server/test/reviewer-recovery.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts`

## Observability Impact

- Signals added/changed: cross-surface tests become the main inspection surface for version drift, vocabulary drift, and shared-state regressions between client and MCP consumers.
- How a future agent inspects this: `packages/review-broker-server/test/client-mcp-parity.test.ts` plus the existing lifecycle/recovery suites named in verification.
- Failure state exposed: mismatched versions, missing reviewer visibility, or surface-specific payload drift should fail in a way that points to the broken boundary immediately.

## Inputs

- `packages/review-broker-client/src/client.ts` — typed client surface from T02.
- `packages/review-broker-client/src/in-process.ts` — runtime-backed client helper from T02.
- `packages/review-broker-client/test/in-process-client.test.ts` — client integration baseline from T02.
- `packages/review-broker-server/src/mcp/server.ts` — MCP server surface from T03.
- `packages/review-broker-server/src/cli/start-mcp.ts` — stdio MCP entrypoint from T03.
- `packages/review-broker-server/test/mcp-server.test.ts` — MCP integration baseline from T03.
- `packages/review-broker-server/test/review-lifecycle-parity.test.ts` — existing S02 lifecycle contract proof.
- `packages/review-broker-server/test/reviewer-lifecycle.test.ts` — existing S03 reviewer lifecycle proof.
- `packages/review-broker-server/test/reviewer-recovery.test.ts` — existing S03 recovery proof.
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — existing runtime smoke proof.
- `.gsd/milestones/M001/slices/S04/tasks/T02-PLAN.md` — typed-client constraints.
- `.gsd/milestones/M001/slices/S04/tasks/T03-PLAN.md` — MCP-surface constraints.

## Expected Output

- `packages/review-broker-client/test/in-process-client.test.ts` — client assertions extended for the final supported contract.
- `packages/review-broker-server/test/mcp-server.test.ts` — MCP assertions extended for final supported contract.
- `packages/review-broker-server/test/client-mcp-parity.test.ts` — cross-surface parity proof against one broker runtime/state model.
- `packages/review-broker-server/test/review-lifecycle-parity.test.ts` — updated only if needed to keep lifecycle proof aligned with new shared surfaces.
- `packages/review-broker-server/test/reviewer-lifecycle.test.ts` — updated only if needed to keep reviewer proof aligned with new shared surfaces.
- `packages/review-broker-server/test/reviewer-recovery.test.ts` — updated only if needed to keep recovery proof aligned with new shared surfaces.
