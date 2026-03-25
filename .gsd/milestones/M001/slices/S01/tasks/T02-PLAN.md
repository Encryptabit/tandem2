---
estimated_steps: 4
estimated_files: 8
skills_used:
  - gsd
  - best-practices
  - test
  - debug-like-expert
---

# T02: Add SQLite bootstrap, migrations, and persistence primitives

**Slice:** S01 — Broker core runtime with durable state
**Milestone:** M001

## Description

Build the durable storage layer for the standalone broker. This task creates the `review-broker-server` package around explicit SQL migrations, file-backed SQLite open/close behavior, and repository helpers that preserve the S01 state fields the later broker service will depend on.

## Steps

1. Create `packages/review-broker-server` with its own package metadata and TypeScript/test wiring, depending on `review-broker-core` plus `better-sqlite3`.
2. Add the initial SQL schema and bootstrap path in `src/db/migrations/001_init.sql` and `src/db/open-database.ts`, including `journal_mode=WAL`, `busy_timeout`, `foreign_keys=ON`, and idempotent migration tracking.
3. Implement DB/config path resolution and persistence helpers for reviews and audit rows, including `claim_generation` and `claimed_at` so the later service layer can enforce claim fencing without reshaping storage.
4. Add file-backed tests that prove schema creation, PRAGMA setup, path resolution precedence, and reopen safety against the same SQLite file.

## Must-Haves

- [ ] The server package can open a file-backed SQLite database, migrate it idempotently, and assert the expected PRAGMAs in tests.
- [ ] Persisted review and audit storage exists with the S01 fields needed for create/claim/status/proposal/reclaim flows.
- [ ] Path resolution behavior is explicit and tested so later runtime startup does not hide DB-location bugs.

## Verification

- `pnpm test -- --run packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/path-resolution.test.ts`
- `pnpm build`

## Observability Impact

- Signals added/changed: durable `schema_migrations` state, PRAGMA assertions, and audit-row persistence primitives.
- How a future agent inspects this: by opening the SQLite file created in tests and by reading the targeted Vitest failures for path/migration mismatches.
- Failure state exposed: migration failures, wrong DB path selection, and missing claim-fencing columns become explicit test failures instead of hidden runtime assumptions.

## Inputs

- `package.json` — root scripts/workspace dependencies from T01.
- `pnpm-workspace.yaml` — workspace registration from T01.
- `tsconfig.base.json` — shared TS compiler settings from T01.
- `packages/review-broker-core/src/contracts.ts` — shared payload contracts the persistence layer will store for later service methods.
- `packages/review-broker-core/src/state-machine.ts` — transition vocabulary that storage-backed service code must preserve.
- `.gsd/milestones/M001/slices/S01/S01-PLAN.md` — slice-level must-haves and verification targets.

## Expected Output

- `packages/review-broker-server/package.json` — server package scripts and dependencies.
- `packages/review-broker-server/src/db/migrations/001_init.sql` — initial durable schema.
- `packages/review-broker-server/src/db/open-database.ts` — DB open, PRAGMAs, and migration application.
- `packages/review-broker-server/src/runtime/path-resolution.ts` — DB/config path resolution logic.
- `packages/review-broker-server/src/db/reviews-repository.ts` — review persistence helpers.
- `packages/review-broker-server/src/db/audit-repository.ts` — audit persistence helpers.
- `packages/review-broker-server/test/sqlite-bootstrap.test.ts` — migration/PRAGMA/idempotency proof.
- `packages/review-broker-server/test/path-resolution.test.ts` — path-resolution proof.
