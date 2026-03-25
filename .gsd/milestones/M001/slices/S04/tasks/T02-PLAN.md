---
estimated_steps: 5
estimated_files: 7
skills_used:
  - gsd
  - best-practices
  - review
  - test
---

# T02: Build the direct typed TypeScript client package on top of the shared registry

**Slice:** S04 — Typed client and MCP exposure
**Milestone:** M001

## Description

Deliver the deterministic R006 surface as a real workspace package. This task should create `review-broker-client` as a thin in-process client that mirrors `BrokerService`, validates through shared core schemas, and can either wrap an existing service or start its own runtime through `startBroker()`.

## Steps

1. Create the `packages/review-broker-client` workspace package with build configuration and exports that match the existing package conventions.
2. Implement a typed client layer that iterates or references the shared core operation registry instead of duplicating method lists or request/response typing locally.
3. Add an in-process transport/helper that can wrap an existing `BrokerService` and a convenience path that starts a broker runtime through `packages/review-broker-server/src/index.ts`.
4. Keep the client scope explicitly in-process for M001; do not introduce HTTP, custom JSON-RPC, or another remote protocol.
5. Add integration-style tests that drive representative review and reviewer operations against a real started runtime and assert shared validation/version behavior.

## Must-Haves

- [ ] The new package exposes camelCase client methods that match the broker service contract.
- [ ] Request and response parsing comes from shared core schemas rather than client-local DTO definitions.
- [ ] The client can exercise both review and reviewer operations against the existing standalone runtime composition.

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-client/test/in-process-client.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-client run build`

## Observability Impact

- Signals added/changed: client-visible schema parse failures and broker errors become part of the supported typed surface instead of requiring direct `BrokerService` access.
- How a future agent inspects this: `packages/review-broker-client/test/in-process-client.test.ts` plus the started runtime produced through `packages/review-broker-server/src/index.ts`.
- Failure state exposed: invalid request payloads, response-shape drift, and version/wait mismatches should fail through typed client calls with enough context to localize the broken operation.

## Inputs

- `packages/review-broker-core/src/operations.ts` — canonical broker operation metadata from T01.
- `packages/review-broker-core/src/index.ts` — shared core export surface.
- `packages/review-broker-server/src/index.ts` — existing `startBroker()` runtime composition entrypoint.
- `packages/review-broker-server/src/runtime/broker-service.ts` — service interface the client should mirror.
- `packages/review-broker-server/test/review-lifecycle-parity.test.ts` — started-runtime test style to mirror.
- `packages/review-broker-server/test/reviewer-lifecycle.test.ts` — representative reviewer lifecycle assertions to mirror.
- `.gsd/milestones/M001/slices/S04/tasks/T01-PLAN.md` — operation registry constraints from the prior task.

## Expected Output

- `package.json` — root scripts or workspace wiring updated if needed to build/test the new package cleanly.
- `packages/review-broker-client/package.json` — new typed-client package manifest.
- `packages/review-broker-client/tsconfig.json` — package build configuration.
- `packages/review-broker-client/src/client.ts` — typed client implementation over the shared operation registry.
- `packages/review-broker-client/src/in-process.ts` — in-process transport/runtime helper.
- `packages/review-broker-client/src/index.ts` — public client exports.
- `packages/review-broker-client/test/in-process-client.test.ts` — runtime-backed client proof for representative review and reviewer operations.
