---
id: T01
parent: S01
milestone: M003
provides:
  - Shared continuity enums, schemas, and named slice-verification test entrypoints for reclaim/detach recovery work.
key_files:
  - packages/review-broker-core/src/domain.ts
  - packages/review-broker-core/src/contracts.ts
  - packages/review-broker-core/test/continuity-contracts.test.ts
  - packages/review-broker-server/test/recovery-transitions.test.ts
  - .gsd/KNOWLEDGE.md
key_decisions:
  - Kept the continuity contract additive in review-broker-core so later SQLite/runtime tasks can adopt reclaim/detach inspection payloads without breaking existing broker APIs first.
patterns_established:
  - Create the slice verification test files up front, letting future tasks replace named failing placeholders instead of inventing ad hoc coverage later.
  - Regenerate checked-in src/*.js artifacts after editing src/*.ts in broker packages because stale JS shadows TS during Vitest/tsx execution.
observability_surfaces:
  - packages/review-broker-core/test/continuity-contracts.test.ts; packages/review-broker-core/src/contracts.ts; packages/review-broker-server/src/cli/start-broker.ts --once
duration: 1h
verification_result: passed
completed_at: 2026-03-24T06:45:08Z
blocker_discovered: false
---

# T01: Reconstitute the workspace and shared continuity contract

**Added continuity-first recovery schemas in `review-broker-core`, seeded the missing slice verification test files, and documented the checked-in JS shadowing gotcha.**

## What Happened

The local worktree did not match the planner’s “planning-only” snapshot: the pnpm workspace, `review-broker-core`, and `review-broker-server` already existed. I adapted T01 to local reality instead of rebuilding the substrate from scratch.

In `packages/review-broker-core/src/domain.ts` I added the continuity vocabulary M003/S01 needs but the shared package did not yet freeze: recovery reasons (including `claim_timeout`), detach reasons, recovery outcomes, action-required reasons, the `review.detached` audit event, and canonical status/timeline/startup-recovery record shapes. In `packages/review-broker-core/src/contracts.ts` I added Zod schemas for those ownership, recovery, timeline, and startup summary payloads while keeping the existing broker request/response contracts intact.

I added `packages/review-broker-core/test/continuity-contracts.test.ts` as the focused contract proof requested by the task. It locks concrete enum values and validates the shared status/timeline/startup-recovery payload shapes so later tasks fail fast if recovery semantics drift.

Because this is the first task in the slice, I also created the missing slice-verification test files named in `S01-PLAN.md`: `recovery-transitions`, `claim-timeout-recovery`, `reviewer-exit-recovery`, `startup-sweep`, `recovery-status-surfaces`, and `end-to-end-continuity-proof`. They currently fail intentionally with explicit task-owner messages so T02-T04 have stable, named targets to replace.

During verification I found a non-obvious repo trap: checked-in `packages/*/src/*.js` artifacts shadow newer `.ts` edits under Vitest/tsx because the TS sources import ESM `.js` specifiers. I regenerated the touched `src/*.js` artifacts and the `review-broker-core/dist/*` build output, then recorded the gotcha in `.gsd/KNOWLEDGE.md`.

## Verification

I first ran a core-package sanity pass over `contracts.test.ts`, `reviewer-contracts.test.ts`, and the new `continuity-contracts.test.ts` to ensure the new continuity schemas did not regress the existing shared contract surface. Then I ran the task-plan verification checks directly. After that I ran all slice-level verification commands as required for an intermediate task. The T01 contract proof passed; the broader slice gate still fails where expected because the newly-created T02-T04 placeholder tests intentionally fail and `broker:continuity` is not added until T04.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm exec vitest run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/reviewer-contracts.test.ts packages/review-broker-core/test/continuity-contracts.test.ts` | 0 | ✅ pass | 1.052s |
| 2 | `corepack pnpm exec vitest run packages/review-broker-core/test/continuity-contracts.test.ts` | 0 | ✅ pass | 0.866s |
| 3 | `test -f packages/review-broker-core/src/contracts.ts` | 0 | ✅ pass | 0.002s |
| 4 | `corepack pnpm exec vitest run packages/review-broker-core/test/continuity-contracts.test.ts packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/recovery-transitions.test.ts` | 1 | ❌ fail | 1.047s |
| 5 | `corepack pnpm exec vitest run packages/review-broker-server/test/claim-timeout-recovery.test.ts packages/review-broker-server/test/reviewer-exit-recovery.test.ts packages/review-broker-server/test/startup-sweep.test.ts packages/review-broker-server/test/recovery-status-surfaces.test.ts` | 1 | ❌ fail | 0.821s |
| 6 | `corepack pnpm exec vitest run packages/review-broker-server/test/end-to-end-continuity-proof.test.ts` | 1 | ❌ fail | 0.790s |
| 7 | `corepack pnpm broker:continuity` | 254 | ❌ fail | 0.441s |
| 8 | `corepack pnpm --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/m003-s01-inspect.sqlite --once` | 0 | ✅ pass | 0.806s |

## Diagnostics

Future agents can inspect the frozen continuity vocabulary in `packages/review-broker-core/src/domain.ts` and `packages/review-broker-core/src/contracts.ts`. The contract proof lives in `packages/review-broker-core/test/continuity-contracts.test.ts`. The current runtime still emits the older startup-recovery shape through `packages/review-broker-server/src/cli/start-broker.ts --once`, which is why this task kept the continuity contract additive rather than forcing a premature server refactor. The generated placeholder tests in `packages/review-broker-server/test/*.test.ts` identify exactly which downstream tasks still own each missing verification target.

## Deviations

- The workspace substrate already existed locally, so I did not recreate `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, or the package manifests from scratch. Instead I verified the existing workspace and narrowed T01 to the missing continuity-contract work.
- I created the missing slice-verification test files early, even though most are owned by later tasks, because the execution contract for the first task requires those named verification targets to exist.

## Known Issues

- `packages/review-broker-server/test/recovery-transitions.test.ts`, `claim-timeout-recovery.test.ts`, `reviewer-exit-recovery.test.ts`, `startup-sweep.test.ts`, `recovery-status-surfaces.test.ts`, and `end-to-end-continuity-proof.test.ts` are intentional failing placeholders until T02-T04 replace them with real proofs.
- The root `broker:continuity` script does not exist yet; that remains owned by T04.
- The server runtime has not adopted the new continuity status/timeline/startup-recovery schemas yet, so the shared contract is ahead of the runtime by design at the end of T01.

## Files Created/Modified

- `packages/review-broker-core/src/domain.ts` — added recovery reasons/outcomes, action-required vocabulary, `review.detached`, and canonical continuity/status/timeline/startup summary types.
- `packages/review-broker-core/src/contracts.ts` — added Zod schemas for ownership, continuity snapshots, status/timeline payloads, and startup recovery summaries.
- `packages/review-broker-core/test/continuity-contracts.test.ts` — froze the new continuity contract with concrete enum and payload-shape assertions.
- `packages/review-broker-core/test/reviewer-contracts.test.ts` — updated reviewer contract expectations to cover the expanded continuity vocabulary.
- `packages/review-broker-core/src/domain.js` — regenerated checked-in JS artifact to match the updated TS source.
- `packages/review-broker-core/src/contracts.js` — regenerated checked-in JS artifact to match the updated TS source.
- `packages/review-broker-core/dist/*` — rebuilt exported package artifacts after the shared continuity contract changes.
- `packages/review-broker-server/test/recovery-transitions.test.ts` — created intentional T02 placeholder coverage target.
- `packages/review-broker-server/test/claim-timeout-recovery.test.ts` — created intentional T03 placeholder coverage target.
- `packages/review-broker-server/test/reviewer-exit-recovery.test.ts` — created intentional T03 placeholder coverage target.
- `packages/review-broker-server/test/startup-sweep.test.ts` — created intentional T03 placeholder coverage target.
- `packages/review-broker-server/test/recovery-status-surfaces.test.ts` — created intentional T04 placeholder coverage target.
- `packages/review-broker-server/test/end-to-end-continuity-proof.test.ts` — created intentional T04 placeholder coverage target.
- `.gsd/KNOWLEDGE.md` — recorded the checked-in JS shadowing behavior so later agents regenerate artifacts before debugging phantom failures.
