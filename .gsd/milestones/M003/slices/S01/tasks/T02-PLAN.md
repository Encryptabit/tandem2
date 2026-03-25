---
estimated_steps: 4
estimated_files: 8
skills_used:
  - gsd
  - test
  - debug-like-expert
---

# T02: Persist continuity state and transactional recovery primitives

**Slice:** S01 — Reviewer-exit and stale-claim recovery
**Milestone:** M003

## Description

Build the durable SQLite substrate for S01. This task should add the server package, bootstrap the database, and implement transactional persistence helpers for reclaim/detach behavior so later live-process work can depend on restart-safe ownership semantics instead of in-memory shortcuts.

## Steps

1. Create `packages/review-broker-server/package.json` and the initial migration in `packages/review-broker-server/src/db/migrations/001_init.sql` with tables for reviews, reviewers, audit events, and schema migrations; include `claim_generation`, `claimed_at`, session ownership, recovery reason, and action-required fields needed by S01.
2. Implement `packages/review-broker-server/src/db/open-database.ts` with explicit WAL-oriented bootstrap, idempotent migrations, and the transaction pattern this runtime will use for continuity work.
3. Add `packages/review-broker-server/src/db/reviews-repository.ts`, `packages/review-broker-server/src/db/reviewers-repository.ts`, and `packages/review-broker-server/src/db/audit-repository.ts` so reclaim and detach operations update state and append machine-readable audit evidence in the same transaction.
4. Prove the persistence contract with `packages/review-broker-server/test/sqlite-bootstrap.test.ts` and `packages/review-broker-server/test/recovery-transitions.test.ts`, covering restart-safe reopen, `claim_generation` fencing, safe reclaim, ambiguous detach, and durable audit rows.

## Must-Haves

- [ ] SQLite bootstrap is idempotent and restart-safe, with migration tracking and WAL-style settings asserted in tests.
- [ ] Recovery helpers persist reclaim and detach outcomes transactionally, including machine-readable reasons and action-required state.
- [ ] The tests explicitly cover `claim_generation` bumps/fencing so stale ownership cannot silently overwrite a newer claim.

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/recovery-transitions.test.ts`
- `test -f /home/cari/repos/tandem2/.gsd/worktrees/M003/packages/review-broker-server/src/db/migrations/001_init.sql`

## Observability Impact

- Signals added/changed: durable `audit_events` rows for reclaim/detach outcomes, persisted recovery reason/action-required fields on reviews, and schema migration visibility.
- How a future agent inspects this: run the two named tests, inspect `packages/review-broker-server/src/db/migrations/001_init.sql`, and query the SQLite tables that back recovery state.
- Failure state exposed: stale-generation races, missing audit rows, or non-transactional state drift become visible as failing repository tests instead of only at runtime.

## Inputs

- `.gsd/milestones/M003/slices/S01/S01-PLAN.md` — slice-level recovery semantics and verification bar.
- `package.json` — root workspace scripts created in T01.
- `pnpm-workspace.yaml` — workspace package membership from T01.
- `tsconfig.base.json` — shared TS config from T01.
- `packages/review-broker-core/src/domain.ts` — shared continuity vocabulary from T01.
- `packages/review-broker-core/src/contracts.ts` — shared recovery/status schema surface from T01.
- `packages/review-broker-core/test/continuity-contracts.test.ts` — frozen contract expectations from T01.
- `docs/standalone-broker-starting-point.md` — broker/server package boundary to preserve.

## Expected Output

- `packages/review-broker-server/package.json` — server package manifest and local scripts.
- `packages/review-broker-server/src/db/migrations/001_init.sql` — initial continuity schema.
- `packages/review-broker-server/src/db/open-database.ts` — SQLite bootstrap and migration runner.
- `packages/review-broker-server/src/db/reviews-repository.ts` — durable review ownership/recovery persistence.
- `packages/review-broker-server/src/db/reviewers-repository.ts` — durable reviewer ownership/liveness persistence.
- `packages/review-broker-server/src/db/audit-repository.ts` — append-only audit persistence.
- `packages/review-broker-server/test/sqlite-bootstrap.test.ts` — bootstrap/reopen proof.
- `packages/review-broker-server/test/recovery-transitions.test.ts` — reclaim/detach/fencing proof.
