---
estimated_steps: 4
estimated_files: 8
skills_used:
  - gsd
  - debug-like-expert
  - test
---

# T03: Wire live reviewer-exit, stale-claim, and startup-sweep recovery

**Slice:** S01 — Reviewer-exit and stale-claim recovery
**Milestone:** M003

## Description

Implement the live broker recovery behavior. This task is the slice’s highest-risk increment: it must combine real reviewer subprocess supervision, timed-out claim detection, and startup stale-session cleanup while preserving the conservative reclaim-vs-detach rules frozen earlier in the slice.

## Steps

1. Add runtime composition in `packages/review-broker-server/src/runtime/app-context.ts` and `packages/review-broker-server/src/index.ts`, then create `packages/review-broker-server/src/runtime/reviewer-manager.ts` to spawn and monitor a real local reviewer fixture process from `packages/review-broker-server/test/fixtures/reviewer-worker.mjs`.
2. Implement recovery-aware broker logic in `packages/review-broker-server/src/runtime/broker-service.ts` for claim timeout checks, dead-reviewer handling, and startup stale-reviewer/session sweep before normal work begins.
3. Use the transactional repositories from T02 so live recovery reclaims only safe `claimed` reviews, detaches ambiguous open attachments with explicit action-required state, and records durable reasoned evidence instead of silent auto-healing.
4. Prove the behavior with `packages/review-broker-server/test/claim-timeout-recovery.test.ts`, `packages/review-broker-server/test/reviewer-exit-recovery.test.ts`, and `packages/review-broker-server/test/startup-sweep.test.ts`, each using the real runtime path rather than only repository-level fixtures.

## Must-Haves

- [ ] Reviewer supervision remains broker-owned and uses a real subprocess fixture, not a mock-only liveness abstraction.
- [ ] Timed-out claims, reviewer exits, and startup stale-session recovery all follow the conservative reclaim-vs-detach rules established in the slice plan.
- [ ] Startup cleanup runs before normal broker work starts, so restart cannot compound stale ownership ambiguity.

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/claim-timeout-recovery.test.ts packages/review-broker-server/test/reviewer-exit-recovery.test.ts packages/review-broker-server/test/startup-sweep.test.ts`
- `test -f /home/cari/repos/tandem2/.gsd/worktrees/M003/packages/review-broker-server/test/fixtures/reviewer-worker.mjs`

## Observability Impact

- Signals added/changed: reviewer offline/exit evidence, per-review reclaim or detach audit rows, startup sweep summary data, and recovery-visible ownership timestamps/generations.
- How a future agent inspects this: run the three named recovery tests, inspect `packages/review-broker-server/src/runtime/broker-service.ts` and `packages/review-broker-server/src/runtime/reviewer-manager.ts`, and compare persisted review/reviewer/audit rows on a temp SQLite file.
- Failure state exposed: dead-reviewer races, timeout reclamation mistakes, and startup-order bugs become visible as concrete recovery-test failures with persisted state to inspect afterward.

## Inputs

- `.gsd/milestones/M003/slices/S01/S01-PLAN.md` — slice-level recovery and ordering rules.
- `packages/review-broker-core/src/domain.ts` — shared recovery enums and record shapes.
- `packages/review-broker-core/src/contracts.ts` — shared status/timeline/recovery schemas.
- `packages/review-broker-server/src/db/open-database.ts` — DB bootstrap from T02.
- `packages/review-broker-server/src/db/reviews-repository.ts` — transactional review recovery operations from T02.
- `packages/review-broker-server/src/db/reviewers-repository.ts` — durable reviewer state helpers from T02.
- `packages/review-broker-server/src/db/audit-repository.ts` — append-only audit persistence from T02.
- `packages/review-broker-server/test/recovery-transitions.test.ts` — repository-level recovery expectations from T02.

## Expected Output

- `packages/review-broker-server/src/runtime/app-context.ts` — runtime composition for DB, repositories, and reviewer supervision.
- `packages/review-broker-server/src/runtime/reviewer-manager.ts` — real reviewer subprocess supervision.
- `packages/review-broker-server/src/runtime/broker-service.ts` — live timeout/exit/startup recovery logic.
- `packages/review-broker-server/src/index.ts` — startup wiring that runs stale cleanup before normal work.
- `packages/review-broker-server/test/fixtures/reviewer-worker.mjs` — real reviewer process fixture.
- `packages/review-broker-server/test/claim-timeout-recovery.test.ts` — timed-out claim recovery proof.
- `packages/review-broker-server/test/reviewer-exit-recovery.test.ts` — dead-reviewer recovery proof.
- `packages/review-broker-server/test/startup-sweep.test.ts` — stale-session startup ordering proof.
