---
estimated_steps: 4
estimated_files: 10
skills_used:
  - gsd
  - best-practices
  - review
  - test
---

# T01: Freeze a shared broker operation registry and unblock MCP schema compatibility

**Slice:** S04 — Typed client and MCP exposure
**Milestone:** M001

## Description

Establish the anti-drift foundation for the slice before adding any new surface area. This task should create one canonical operation catalog in `review-broker-core` that later typed-client and MCP code both consume, while also aligning the shared schema dependency version with the official MCP SDK requirements.

## Steps

1. Add a new core operation-registry module that maps each broker operation to its camelCase method name, snake_case MCP tool name, request schema, and response schema.
2. Export typed lookup helpers from the core package so downstream code can iterate the operation catalog and resolve request/response types without re-encoding the operation list.
3. Update the core package Zod dependency to an MCP-SDK-compatible version and keep the checked-in core `.js` runtime siblings in sync with the TypeScript source.
4. Extend the core contract tests so tool names, method names, and schema pairings are mechanically frozen alongside the existing review/reviewer contract vocabulary.

## Must-Haves

- [ ] The broker operation list is defined once in core and is reusable by both the typed client and MCP layer.
- [ ] Every operation entry carries both internal method naming and external MCP naming so later surfaces do not invent divergent vocabularies.
- [ ] Core schema/version changes do not break the existing shared review and reviewer contract tests.

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/reviewer-contracts.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-core run build`

## Inputs

- `packages/review-broker-core/package.json` — current shared contract package dependency baseline.
- `packages/review-broker-core/src/contracts.ts` — canonical request/response schemas that the registry must reference.
- `packages/review-broker-core/src/contracts.js` — checked-in runtime sibling that must stay aligned.
- `packages/review-broker-core/src/index.ts` — export surface that downstream packages consume.
- `packages/review-broker-core/src/index.js` — checked-in runtime export surface.
- `packages/review-broker-core/test/contracts.test.ts` — existing shared review contract assertions.
- `packages/review-broker-core/test/reviewer-contracts.test.ts` — existing shared reviewer contract assertions.

## Expected Output

- `packages/review-broker-core/package.json` — Zod dependency updated for MCP SDK compatibility.
- `packages/review-broker-core/src/contracts.ts` — shared schemas exported or referenced in a registry-friendly shape.
- `packages/review-broker-core/src/contracts.js` — checked-in runtime sibling kept in sync.
- `packages/review-broker-core/src/operations.ts` — canonical broker operation registry and typed helpers.
- `packages/review-broker-core/src/operations.js` — checked-in runtime sibling for the new registry module.
- `packages/review-broker-core/src/index.ts` — registry exports added to the public surface.
- `packages/review-broker-core/src/index.js` — runtime export surface updated.
- `packages/review-broker-core/test/contracts.test.ts` — review contract coverage extended for operation metadata.
- `packages/review-broker-core/test/reviewer-contracts.test.ts` — reviewer contract coverage extended for operation metadata.
- `pnpm-lock.yaml` — lockfile updated for dependency resolution changes.

## Observability Impact

- Signals changed: the shared broker operation catalog becomes the single inspectable source for method names, MCP tool names, and schema pairings, so registry drift fails in core tests before client or MCP layers diverge.
- How to inspect: read `packages/review-broker-core/src/operations.ts` for the exported registry and lookup helpers, then run the core contract tests to see the frozen method/tool/schema mapping exercised directly.
- Failure state now visible: mismatched method names, wrong snake_case tool names, or request/response schema drift surface as deterministic test failures in `packages/review-broker-core/test/contracts.test.ts` and `packages/review-broker-core/test/reviewer-contracts.test.ts` instead of later runtime surprises.
