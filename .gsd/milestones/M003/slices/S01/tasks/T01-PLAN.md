---
estimated_steps: 4
estimated_files: 8
skills_used:
  - gsd
  - test
---

# T01: Reconstitute the workspace and shared continuity contract

**Slice:** S01 — Reviewer-exit and stale-claim recovery
**Milestone:** M003

## Description

This worktree currently has planning artifacts only, so the first executor must create the minimal broker workspace and shared continuity package before any recovery code can be implemented. The task should stay narrow: establish the pnpm/TypeScript/Vitest substrate and freeze the continuity vocabulary that later SQLite/runtime tasks will consume.

## Steps

1. Create the root workspace files in `package.json`, `pnpm-workspace.yaml`, and `tsconfig.base.json`, choosing a minimal pnpm + TypeScript + Vitest setup that can host `packages/review-broker-core` and `packages/review-broker-server` without pulling in unrelated app packages.
2. Add `packages/review-broker-core/package.json` plus `packages/review-broker-core/src/domain.ts`, `packages/review-broker-core/src/contracts.ts`, and `packages/review-broker-core/src/index.ts` to define the shared recovery vocabulary: review/reviewer ownership fields, `claim_generation`, `claimed_at`, recovery reasons, action-required markers, audit event names, and status/timeline response shapes.
3. Keep the exported contract continuity-first: it must distinguish reclaim from detach, preserve machine-readable recovery reasons, and define the inspection payloads later tasks will expose rather than leaving them as ad hoc object literals.
4. Add `packages/review-broker-core/test/continuity-contracts.test.ts` to freeze the shared schema and enum surface so later tasks fail fast if they drift recovery reasons, timeline/status payloads, or audit event names.

## Must-Haves

- [ ] The repo has a runnable pnpm/TypeScript/Vitest workspace after this task; do not leave test setup for a later task.
- [ ] `packages/review-broker-core` exports one canonical continuity contract covering reclaim, detach, action-required, reviewer-offline, and status/timeline vocabulary.
- [ ] The focused contract test asserts on concrete enum/schema values so later runtime code cannot silently change recovery semantics.

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-core/test/continuity-contracts.test.ts`
- `test -f /home/cari/repos/tandem2/.gsd/worktrees/M003/packages/review-broker-core/src/contracts.ts`

## Observability Impact

- Signals added/changed: the shared continuity contract should freeze machine-readable recovery reasons, action-required markers, and status/timeline payload fields that later runtime code will emit through audit rows and `--once` inspection surfaces.
- How a future agent inspects this: run `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-core/test/continuity-contracts.test.ts` and inspect `packages/review-broker-core/src/contracts.ts` plus `packages/review-broker-core/src/domain.ts` for the canonical continuity vocabulary.
- Failure state exposed: schema drift in recovery reasons, reviewer-offline vocabulary, or continuity payload shape should fail the focused contract suite instead of surfacing later as runtime-only mismatches.

## Inputs

- `.gsd/PROJECT.md` — confirms the standalone broker/package direction to preserve.
- `.gsd/milestones/M003/M003-CONTEXT.md` — continuity scope, proof bar, and prior-art constraints.
- `.gsd/milestones/M003/slices/S01/S01-PLAN.md` — slice goal, must-haves, and verification target.
- `docs/standalone-broker-starting-point.md` — package layout and broker-first runtime boundary.

## Expected Output

- `package.json` — root workspace scripts and dev dependencies.
- `pnpm-workspace.yaml` — workspace package layout.
- `tsconfig.base.json` — shared TypeScript configuration.
- `packages/review-broker-core/package.json` — shared contract package manifest.
- `packages/review-broker-core/src/domain.ts` — continuity enums and record types.
- `packages/review-broker-core/src/contracts.ts` — shared request/response schemas for recovery-aware broker surfaces.
- `packages/review-broker-core/src/index.ts` — exported continuity contract surface.
- `packages/review-broker-core/test/continuity-contracts.test.ts` — focused contract proof.
