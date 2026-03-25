---
estimated_steps: 4
estimated_files: 7
skills_used:
  - gsd
  - best-practices
  - test
  - review
---

# T03: Implement broker review flows with diff validation and fencing

**Slice:** S01 — Broker core runtime with durable state
**Milestone:** M001

## Description

Turn the shared core package and SQLite primitives into a real broker service. This task should implement the narrow S01 contract — create, list, claim, inspect status, fetch proposal data, and reclaim — with the same durable claim-fencing fields and diff validation expectations the later parity slices will build on.

## Steps

1. Introduce an application context that composes the open database, shared notification bus, and repository helpers created in T02.
2. Implement `src/runtime/diff.ts` so review creation validates patches with `git apply --check` and extracts affected files with `parse-diff` instead of hand-rolled parsing.
3. Implement `src/runtime/broker-service.ts` methods for `createReview`, `listReviews`, `claimReview`, `getReviewStatus`, `getProposal`, and `reclaimReview`, using shared contract types, audit rows, and claim-generation fencing.
4. Add parity-oriented tests for happy-path create/claim flows, invalid diff rejection, proposal retrieval, and the concurrent-claim race where exactly one claimant succeeds.

## Must-Haves

- [ ] `createReview` persists only valid proposals and records affected files and audit state.
- [ ] `claimReview` enforces durable single-winner fencing with `claim_generation` and `claimed_at`, and the losing claimant receives a deterministic stale/invalid result.
- [ ] All S01 broker service methods accept and return the shared core contracts rather than redefining payload types locally.

## Verification

- `pnpm test -- --run packages/review-broker-server/test/broker-service.test.ts packages/review-broker-server/test/claim-concurrency.test.ts`
- `pnpm build`

## Observability Impact

- Signals added/changed: persisted create/claim/reclaim audit rows, notification version bumps after state changes, and deterministic diff-validation errors.
- How a future agent inspects this: via `packages/review-broker-server/test/broker-service.test.ts`, `packages/review-broker-server/test/claim-concurrency.test.ts`, and direct reads of the `audit_events` / `reviews` tables in the same SQLite file.
- Failure state exposed: invalid diff submissions, stale claim attempts, and reclaim transitions remain visible as status/audit records instead of disappearing in memory.

## Inputs

- `packages/review-broker-core/src/contracts.ts` — shared request/response shapes.
- `packages/review-broker-core/src/notifications.ts` — versioned notification primitive from T01.
- `packages/review-broker-server/src/db/open-database.ts` — durable DB bootstrap from T02.
- `packages/review-broker-server/src/db/reviews-repository.ts` — review persistence helpers from T02.
- `packages/review-broker-server/src/db/audit-repository.ts` — audit persistence helpers from T02.
- `packages/review-broker-server/src/runtime/path-resolution.ts` — runtime path rules from T02.
- `.gsd/milestones/M001/slices/S01/S01-PLAN.md` — slice demo and must-haves.

## Expected Output

- `packages/review-broker-server/src/runtime/app-context.ts` — runtime composition for DB + notifications + repositories.
- `packages/review-broker-server/src/runtime/diff.ts` — diff validation and affected-file extraction.
- `packages/review-broker-server/src/runtime/broker-service.ts` — S01 broker service methods.
- `packages/review-broker-server/test/broker-service.test.ts` — create/list/status/proposal/reclaim proof.
- `packages/review-broker-server/test/claim-concurrency.test.ts` — single-winner claim proof.
- `packages/review-broker-server/test/fixtures/valid-review.diff` — valid diff fixture for parity-style tests.
- `packages/review-broker-server/test/fixtures/invalid-review.diff` — invalid diff fixture for rejection tests.
