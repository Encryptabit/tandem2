---
estimated_steps: 4
estimated_files: 10
skills_used:
  - gsd
  - test
---

# T02: Publish a dedicated continuity inspection operation across broker surfaces

**Slice:** S02 — Restart sweep and continuity commands
**Milestone:** M003

## Description

Turn the runtime continuity snapshot into a supported broker contract. This task should publish one additive operation for current ownership, reviewer state, action-required cases, and recent recovery actions so typed-client and MCP consumers can inspect restart continuity without stitching generic list calls together.

## Steps

1. Add additive request/response schemas for runtime continuity inspection in `packages/review-broker-core/src/contracts.ts`, then register a dedicated broker operation in `packages/review-broker-core/src/operations.ts` and re-export it from `packages/review-broker-core/src/index.ts`.
2. Regenerate the checked-in JS mirrors in `packages/review-broker-core/src/contracts.js`, `packages/review-broker-core/src/operations.js`, and `packages/review-broker-core/src/index.js` so Vitest/tsx does not validate stale source mirrors after the contract change.
3. Extend `packages/review-broker-server/src/runtime/broker-service.ts` with a new method that returns the T01 runtime continuity snapshot, then let the existing typed client and MCP registry pick it up through the shared operation list.
4. Add or extend `packages/review-broker-core/test/runtime-continuity-contracts.test.ts`, `packages/review-broker-server/test/client-mcp-parity.test.ts`, and `packages/review-broker-server/test/mcp-server.test.ts` so they prove typed client and MCP callers receive the same continuity payload as the runtime.

## Must-Haves

- [ ] The new continuity contract is additive and does not overload `listReviews` or `listReviewers` with continuity-only fields.
- [ ] Broker service, typed client, and MCP all expose one shared runtime continuity payload for ownership, reviewer state, action-required cases, and recent recovery actions.
- [ ] Checked-in JS mirrors are regenerated in the same task as the TypeScript contract change.

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-core/test/runtime-continuity-contracts.test.ts packages/review-broker-server/test/client-mcp-parity.test.ts packages/review-broker-server/test/mcp-server.test.ts`
- `test -f /home/cari/repos/tandem2/.gsd/worktrees/M003/packages/review-broker-core/src/contracts.js`

## Observability Impact

- Signals added/changed: the broker registry, typed client, and MCP now surface one continuity inspection payload instead of forcing list-response stitching.
- How a future agent inspects this: call the new typed-client method, call the matching MCP tool, or run the named parity tests to confirm contract alignment.
- Failure state exposed: schema drift, missing MCP registration, or payload mismatches between runtime and client surfaces show up as contract/parity test failures.

## Inputs

- `.gsd/milestones/M003/slices/S02/S02-PLAN.md` — slice command/operator requirements.
- `packages/review-broker-server/src/db/audit-repository.ts` — T01 cross-review continuity-history query.
- `packages/review-broker-server/src/runtime/status-service.ts` — T01 runtime continuity snapshot shape.
- `packages/review-broker-server/src/index.ts` — T01 broker runtime snapshot export.
- `packages/review-broker-core/src/contracts.ts` — shared broker schema definitions.
- `packages/review-broker-core/src/operations.ts` — broker operation registry.
- `packages/review-broker-core/src/index.ts` — core public exports.
- `packages/review-broker-server/src/runtime/broker-service.ts` — supported broker service surface.
- `packages/review-broker-server/test/client-mcp-parity.test.ts` — existing cross-surface parity harness.
- `packages/review-broker-server/test/mcp-server.test.ts` — MCP registry coverage.

## Expected Output

- `packages/review-broker-core/src/contracts.ts` — additive runtime continuity request/response schemas.
- `packages/review-broker-core/src/operations.ts` — registered broker operation for runtime continuity inspection.
- `packages/review-broker-core/src/index.ts` — exports for the new continuity contract surface.
- `packages/review-broker-core/src/contracts.js` — regenerated checked-in JS mirror for the contract changes.
- `packages/review-broker-core/src/operations.js` — regenerated checked-in JS mirror for the new operation.
- `packages/review-broker-core/src/index.js` — regenerated checked-in JS mirror for exported continuity symbols.
- `packages/review-broker-core/test/runtime-continuity-contracts.test.ts` — contract proof for the new continuity schemas and operation.
- `packages/review-broker-server/src/runtime/broker-service.ts` — broker service method exposing the T01 continuity snapshot.
- `packages/review-broker-server/test/client-mcp-parity.test.ts` — typed client and MCP parity proof for runtime continuity.
- `packages/review-broker-server/test/mcp-server.test.ts` — MCP tool registration and response coverage for the new operation.
