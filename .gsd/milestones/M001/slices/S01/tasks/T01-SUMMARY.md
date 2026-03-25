---
id: T01
parent: S01
milestone: M001
provides:
  - pnpm TypeScript workspace scaffolding and the canonical review-broker-core package for shared S01 review contracts
key_files:
  - package.json
  - pnpm-workspace.yaml
  - tsconfig.base.json
  - packages/review-broker-core/src/contracts.ts
  - packages/review-broker-core/src/state-machine.ts
  - packages/review-broker-core/src/notifications.ts
key_decisions:
  - D007: Use zod schemas in review-broker-core as the canonical runtime-validation layer for shared request/response payloads.
patterns_established:
  - Shared broker enums live in domain.ts, runtime-validatable contracts live in contracts.ts, and transition logic stays explicit in state-machine.ts.
  - Versioned notification waits compare a caller's sinceVersion against monotonic per-topic counters to avoid missed wakeups.
observability_surfaces:
  - Vitest contract/state-machine/notification tests
  - TypeScript workspace build output
  - .gsd/KNOWLEDGE.md pnpm harness notes
duration: 43m
verification_result: passed
completed_at: 2026-03-21T02:39:30-07:00
blocker_discovered: false
---

# T01: Bootstrap the TypeScript workspace and shared broker core

**Bootstrapped a pnpm TypeScript workspace and shipped the canonical review-broker-core package with shared contracts, transitions, and notification primitives.**

## What Happened

I first patched the flagged planning artifacts so S01 had an inspectable failure-path verification step and T01 explicitly documented its observability impact. From there I scaffolded the repo’s first real implementation surface: a root pnpm workspace, shared TypeScript compiler baseline, and a `review-broker-core` package with a clean export surface.

Inside `packages/review-broker-core`, I split the shared contract into four stable layers: `domain.ts` for enums and durable shape vocabulary, `contracts.ts` for zod-backed request/response schemas and inferred request types, `state-machine.ts` for the explicit review transition table, and `notifications.ts` for a versioned topic bus with `waitForChange()` semantics. I added focused Vitest coverage to lock the status vocabulary, transition behavior, schema defaults, response shapes, and notification version monotonicity before any SQLite or runtime code exists.

During verification, the first build attempt exposed duplicate type exports between `domain.ts` and `contracts.ts`; I removed the redundant inferred aliases so the package now exposes one canonical symbol per shared type. I also found two harness-specific verification gotchas and recorded them in `.gsd/KNOWLEDGE.md`: this environment requires `corepack pnpm --dir ...`, and `pnpm --filter <missing-package> exec ...` can exit 0 even when no workspace package matched.

## Verification

I installed workspace dependencies with `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 install`, then ran the task-level verification commands against the worktree. The named core Vitest files all passed, and the workspace build emitted the `review-broker-core` package cleanly after the export-surface fix.

I also ran the slice-level verification commands as required for an intermediate task. The broad slice test command exited 0 but, at this stage, only exercised the existing core tests because the server test files do not exist yet. The two `review-broker-server` `pnpm --filter ... exec` checks printed `No projects matched the filters`; despite their exit code, they are not meaningful passes until T02-T04 add the server package.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 test -- --run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/state-machine.test.ts packages/review-broker-core/test/notifications.test.ts` | 0 | ✅ pass | 0.97s |
| 2 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 build` | 0 | ✅ pass | 1.42s |
| 3 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 test -- --run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/state-machine.test.ts packages/review-broker-core/test/notifications.test.ts packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/path-resolution.test.ts packages/review-broker-server/test/broker-service.test.ts packages/review-broker-server/test/claim-concurrency.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts` | 0 | ❌ fail | 0.94s |
| 4 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s01-smoke.sqlite --once` | 0 | ❌ fail | 0.29s |
| 5 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx -e "import Database from 'better-sqlite3'; const db = new Database('./.tmp/s01-smoke.sqlite', { readonly: true }); const reviewCount = db.prepare('select count(*) as count from reviews').get(); const auditCount = db.prepare('select count(*) as count from audit_events').get(); const migrationCount = db.prepare('select count(*) as count from schema_migrations').get(); console.log(JSON.stringify({ reviewCount, auditCount, migrationCount })); db.close();"` | 0 | ❌ fail | 0.27s |

## Diagnostics

Inspect the shared contract layer through:

- `packages/review-broker-core/test/contracts.test.ts` for status vocabulary, request/response shape, and version-surface proof.
- `packages/review-broker-core/test/state-machine.test.ts` for explicit transition acceptance/rejection behavior.
- `packages/review-broker-core/test/notifications.test.ts` for notification version monotonicity and wait semantics.
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 build` for workspace/package wiring proof.
- `.gsd/KNOWLEDGE.md` for the pnpm harness and filter-exec gotchas discovered during verification.

## Deviations

- I adapted the verification commands to `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 ...` because this harness does not expose a plain `pnpm` shim on PATH and the shell is not rooted at the task worktree by default.

## Known Issues

- The full slice verification command is not yet a trustworthy end-to-end proof because Vitest exits successfully while only the existing core tests are present; the missing server test files will be added in T02-T04.
- `pnpm --filter review-broker-server exec ...` exits 0 with `No projects matched the filters` until the server workspace package exists, so those slice-level checks remain semantically failing at the end of T01 even though their shell exit code is 0.

## Files Created/Modified

- `package.json` — added the root pnpm workspace scripts and shared TypeScript/Vitest dev dependencies.
- `pnpm-workspace.yaml` — registered `packages/*` as workspace members.
- `tsconfig.base.json` — established the shared compiler baseline and workspace path mapping.
- `pnpm-lock.yaml` — captured the resolved workspace dependency graph.
- `packages/review-broker-core/package.json` — defined the core package metadata, exports, build script, and zod dependency.
- `packages/review-broker-core/tsconfig.json` — configured package-local TypeScript emission into `dist/`.
- `packages/review-broker-core/src/domain.ts` — added the shared review enums, audit vocabulary, and canonical domain interfaces.
- `packages/review-broker-core/src/contracts.ts` — added zod-backed request/response schemas and inferred request/response types.
- `packages/review-broker-core/src/state-machine.ts` — implemented the explicit review transition table and validation helpers.
- `packages/review-broker-core/src/notifications.ts` — implemented the versioned notification bus used for future wait semantics.
- `packages/review-broker-core/src/index.ts` — exposed the core package public API.
- `packages/review-broker-core/test/contracts.test.ts` — locked contract vocabulary, defaults, and versioned response shapes.
- `packages/review-broker-core/test/state-machine.test.ts` — locked valid and invalid transition behavior.
- `packages/review-broker-core/test/notifications.test.ts` — locked notification versioning and wait behavior.
- `.gsd/milestones/M001/slices/S01/S01-PLAN.md` — added the missing slice-level inspectable-failure verification step.
- `.gsd/milestones/M001/slices/S01/tasks/T01-PLAN.md` — added the missing observability impact section.
- `.gsd/DECISIONS.md` — recorded D007 for zod-backed shared runtime contract validation.
- `.gsd/KNOWLEDGE.md` — recorded the pnpm/Corepack and missing-filter verification gotchas for future tasks.
