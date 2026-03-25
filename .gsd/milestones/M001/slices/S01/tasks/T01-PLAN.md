---
estimated_steps: 4
estimated_files: 8
skills_used:
  - gsd
  - best-practices
  - test
  - lint
---

# T01: Bootstrap the TypeScript workspace and shared broker core

**Slice:** S01 — Broker core runtime with durable state
**Milestone:** M001

## Description

Create the repo’s first real implementation surface: a pnpm-based TypeScript workspace, a Vitest-backed test harness, and the `review-broker-core` package that freezes the review vocabulary S01 depends on. This task should leave later tasks importing shared enums, schemas, transitions, and notification semantics from one package instead of re-describing them in the server.

## Steps

1. Add the root workspace/build/test scaffolding in `package.json`, `pnpm-workspace.yaml`, and `tsconfig.base.json`, including scripts that later tasks can reuse for build and targeted Vitest runs.
2. Create `packages/review-broker-core` with exports for the S01 domain enums, runtime-validatable request/response payload shapes, and the explicit review transition rules carried over from the current broker contract.
3. Implement the versioned notification primitive needed for future `wait=true` semantics so server code can depend on it without changing the shared package shape later.
4. Add core tests that lock the exported status vocabulary, transition validation, and notification version behavior before any SQLite/runtime code is written.

## Must-Haves

- [ ] `packages/review-broker-core` is the canonical source for S01 review enums, contracts, transition validation, and notification primitives.
- [ ] The repo has a working TypeScript + Vitest workspace so later tasks can add real tests instead of inventing ad hoc scripts.
- [ ] Core tests prove the shared package exports the same status/transition vocabulary the server will consume.

## Verification

- `pnpm test -- --run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/state-machine.test.ts packages/review-broker-core/test/notifications.test.ts`
- `pnpm build`

## Inputs

- `docs/standalone-broker-starting-point.md` — starter direction for package boundaries and preserved broker operations.
- `.gsd/milestones/M001/slices/S01/S01-RESEARCH.md` — concrete recommendations for package split, shared types, and the initial S01 contract.
- `.gsd/DECISIONS.md` — existing architectural decisions that keep the broker standalone and client/type driven.

## Expected Output

- `package.json` — root workspace scripts and shared dev dependencies.
- `pnpm-workspace.yaml` — workspace package registration.
- `tsconfig.base.json` — shared compiler baseline for all TS packages.
- `packages/review-broker-core/package.json` — package-local scripts and exports.
- `packages/review-broker-core/src/domain.ts` — canonical review enums and domain types.
- `packages/review-broker-core/src/contracts.ts` — shared payload schemas and inferred TS types.
- `packages/review-broker-core/src/state-machine.ts` — explicit transition validation logic.
- `packages/review-broker-core/src/notifications.ts` — versioned notification bus primitive.
- `packages/review-broker-core/test/contracts.test.ts` — contract-shape proof.
- `packages/review-broker-core/test/state-machine.test.ts` — transition proof.
- `packages/review-broker-core/test/notifications.test.ts` — notification versioning proof.

## Observability Impact

- New signals introduced: contract/state-machine test failures pinpoint shared broker vocabulary drift early, and notification version tests make missed wakeup regressions visible before server code exists.
- How to inspect later: use `pnpm test -- --run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/state-machine.test.ts packages/review-broker-core/test/notifications.test.ts` for red/green proof, and `pnpm build` for workspace wiring proof.
- Failure visibility added by this task: invalid transition expectations, schema-shape drift, and notification version monotonicity regressions fail with package-local test names instead of surfacing later as ambiguous runtime bugs.
