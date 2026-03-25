---
id: T02
parent: S04
milestone: M001
provides:
  - Registry-driven `review-broker-client` workspace package with typed in-process methods and runtime-start helper
key_files:
  - packages/review-broker-client/src/client.ts
  - packages/review-broker-client/src/in-process.ts
  - packages/review-broker-client/test/in-process-client.test.ts
  - packages/review-broker-client/package.json
  - packages/review-broker-client/tsconfig.json
  - tsconfig.base.json
key_decisions:
  - Model the client surface as a mapped type over `BROKER_OPERATIONS` so the method list stays derived from core rather than duplicated in client code
patterns_established:
  - New workspace packages in this repo should add package-local manifests first, run `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 install`, and then rely on normal workspace package resolution for build/test
observability_surfaces:
  - packages/review-broker-client/src/client.ts
  - packages/review-broker-client/src/in-process.ts
  - packages/review-broker-client/test/in-process-client.test.ts
  - corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-client/test/in-process-client.test.ts
  - corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:smoke
duration: 1h10m
verification_result: passed
completed_at: 2026-03-21T06:49:46-07:00
blocker_discovered: false
---

# T02: Build the direct typed TypeScript client package on top of the shared registry

**Added the `review-broker-client` workspace package with registry-driven typed broker methods, an in-process runtime helper, and runtime-backed client tests.**

## What Happened

I created `packages/review-broker-client` as a real workspace package with standard package exports, TypeScript build configuration, and workspace dependencies on `review-broker-core` and `review-broker-server`.

In `packages/review-broker-client/src/client.ts`, I built the public client surface as a mapped type over the shared `BROKER_OPERATIONS` catalog from core. The factory now validates every request with `parseBrokerOperationRequest(...)`, dispatches by canonical method name, and validates every response with `parseBrokerOperationResponse(...)`, so the client does not carry its own DTO definitions or duplicate the method list.

In `packages/review-broker-client/src/in-process.ts`, I added the thin in-process transport for wrapping an existing broker service plus `startInProcessBrokerClient(...)`, which starts a real broker runtime through `review-broker-server` and returns the typed client alongside the started runtime handle.

I added `packages/review-broker-client/test/in-process-client.test.ts` to cover both usage modes: wrapping an already-started service and starting a runtime through the client helper. The tests also exercise failure visibility by proving that invalid request payloads fail before dispatch, malformed service responses fail through shared response schemas, and broker lifecycle errors still surface through typed client calls.

To support the new workspace package cleanly, I added `review-broker-client` to the root TS path aliases, ran a workspace install so package-local symlinks existed for the new package, and recorded that workspace-resolution gotcha in `.gsd/KNOWLEDGE.md` for later tasks.

## Verification

Task-level verification passed in full:
- The client integration suite passes.
- The new package builds successfully.

Slice-level verification was also rerun for intermediate tracking:
- Core contract tests still pass.
- The client test command now passes.
- `broker:smoke` still passes and emits the expected structured startup/once-complete diagnostics.
- MCP parity tests still fail because T03/T04 have not created those files yet.
- The existing `review-lifecycle-parity` suite still fails on timestamp assertions in `packages/review-broker-server/test/review-lifecycle-parity.test.ts`; reviewer lifecycle, reviewer recovery, and broker smoke coverage still pass, so this remains an existing downstream issue outside T02’s client-package scope.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-client/test/in-process-client.test.ts` | 0 | ✅ pass | 541ms |
| 2 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-client run build` | 0 | ✅ pass | 1.9s |
| 3 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/reviewer-contracts.test.ts` | 0 | ✅ pass | 798ms |
| 4 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/mcp-server.test.ts packages/review-broker-server/test/client-mcp-parity.test.ts` | 1 | ❌ fail | 3.9s |
| 5 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/review-lifecycle-parity.test.ts packages/review-broker-server/test/reviewer-lifecycle.test.ts packages/review-broker-server/test/reviewer-recovery.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts` | 1 | ❌ fail | 3.9s |
| 6 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:smoke` | 0 | ✅ pass | 3.9s |

## Diagnostics

Inspect `packages/review-broker-client/src/client.ts` for the registry-driven request/response validation surface and `packages/review-broker-client/src/in-process.ts` for the service wrapper and runtime-start helper.

Use `packages/review-broker-client/test/in-process-client.test.ts` to inspect the intended observability behavior:
- request schema failures reject before transport dispatch,
- response-shape drift rejects after transport return,
- runtime-started reviewer operations preserve existing claim/recovery behavior, and
- broker lifecycle errors still surface unchanged through client calls.

For runtime inspection outside the client package, `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:smoke` still exposes the existing structured broker startup and once-complete diagnostics.

## Deviations

None.

## Known Issues

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/mcp-server.test.ts packages/review-broker-server/test/client-mcp-parity.test.ts` still fails because the MCP server and client/MCP parity files are not added until T03/T04.
- `packages/review-broker-server/test/review-lifecycle-parity.test.ts` still fails on `lastActivityAt` / `lastMessageAt` timestamp expectations during the existing lifecycle suite; reviewer lifecycle, reviewer recovery, and smoke verification still pass, so this remains an existing downstream issue to address outside T02.

## Files Created/Modified

- `packages/review-broker-client/package.json` — added the new typed client workspace package manifest and dependency wiring.
- `packages/review-broker-client/tsconfig.json` — added the package build configuration.
- `packages/review-broker-client/src/client.ts` — implemented the registry-driven typed client factory and shared request/response parsing.
- `packages/review-broker-client/src/in-process.ts` — added the in-process service wrapper and started-runtime helper.
- `packages/review-broker-client/src/index.ts` — exported the public client surface.
- `packages/review-broker-client/test/in-process-client.test.ts` — added runtime-backed review/reviewer and failure-path coverage.
- `tsconfig.base.json` — added the `review-broker-client` workspace path alias for downstream imports.
- `pnpm-lock.yaml` — recorded the new workspace package importer after the install refresh.
- `.gsd/KNOWLEDGE.md` — recorded the workspace-package install/symlink gotcha for future tasks.
- `.gsd/milestones/M001/slices/S04/S04-PLAN.md` — marked T02 complete.
