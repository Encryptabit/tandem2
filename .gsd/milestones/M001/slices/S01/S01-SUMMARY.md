---
id: S01
parent: M001
milestone: M001
status: complete
validated_requirements:
  - R002
  - R003
advanced_requirements:
  - R001
  - R010
  - R012
---

# S01: Broker core runtime with durable state

## Outcome
S01 established the first runnable standalone TypeScript broker baseline for `tandem2`. The repo now contains a real pnpm/TypeScript workspace, a canonical shared contract package (`packages/review-broker-core`), and a standalone server/runtime package (`packages/review-broker-server`) that can open a SQLite database, apply migrations, create/list/claim/inspect/reclaim reviews, persist audit history, and reopen the same DB file safely.

This slice did **not** finish full lifecycle parity or reviewer lifecycle management, but it did deliver the durable core those later slices now depend on.

## What this slice delivered

### 1. Canonical shared review contract package
`packages/review-broker-core` now owns the S01 review vocabulary for:
- review statuses, priorities, reviewer statuses, audit event types, and notification topics
- zod-backed request/response schemas for create/list/claim/status/proposal/reclaim flows
- an explicit review state machine with transition validation helpers
- a versioned notification bus with wait semantics

This is now the single contract source used by server code and tests instead of re-describing shapes in each consumer.

### 2. Durable SQLite bootstrap and repository layer
`packages/review-broker-server` now opens SQLite through explicit bootstrap code that:
- resolves the broker DB/config paths from CLI args, env, or defaults
- applies WAL, busy timeout, foreign key, and synchronous PRAGMAs
- creates and tracks `schema_migrations`
- applies `001_init.sql` idempotently with checksum validation
- persists `reviews`, `messages`, and `audit_events`
- stores S01 claim fencing fields including `claimed_at` and `claim_generation`

The database can be reopened by a fresh runtime instance without losing review or audit state.

### 3. Broker service methods for the S01 runtime contract
The runtime now exposes real implementations for:
- `createReview`
- `listReviews`
- `claimReview`
- `getReviewStatus`
- `getProposal`
- `reclaimReview`

These methods all parse inputs through shared schemas, operate against durable SQLite state, and return shared-contract payloads.

### 4. Diff validation and redacted failure persistence
Review proposals are validated against the real workspace root using `git apply --check`, while `parse-diff` extracts affected file paths for storage and diagnostics. Invalid diffs are rejected before a review row is created, and the broker records a durable `review.diff_rejected` audit row that keeps affected-file metadata without storing full patch bodies.

### 5. Concurrency fencing and restart-safe proof
The broker now uses `claim_generation` as a compare-and-set fence for claim/reclaim operations. This delivered two important guarantees:
- exactly one concurrent claimant wins a race
- stale claim/reclaim attempts become durable, inspectable audit events instead of silent corruption

A fresh runtime can reopen the same SQLite file and still retrieve the persisted review, proposal metadata, and audit history.

### 6. Real standalone runtime entrypoint
S01 produced both:
- a reusable `startBroker()` composition surface for in-process use
- a real CLI entrypoint at `packages/review-broker-server/src/cli/start-broker.ts`

The CLI supports `--once` smoke mode and emits structured JSON startup/inspection events with DB path, workspace root, applied migration IDs, PRAGMA settings, and row-count snapshots.

## Patterns established for later slices
- **Shared types live in `review-broker-core` first.** Server/runtime code should import and extend those contracts, not redefine payloads locally.
- **Validate at the boundary, persist through repositories.** Requests are parsed with zod before broker logic runs; DB mapping stays inside repository helpers.
- **Use explicit state transitions.** Transition legality is centralized in `state-machine.ts`, not spread through ad hoc status checks.
- **Use durable audit rows for both success and failure.** Rejections such as invalid diffs and stale claim races are first-class persisted events.
- **Use `claim_generation` fencing for mutable review ownership state.** Later recovery/reviewer lifecycle work should reuse this pattern for stale-session protection.
- **Use notification versions instead of polling.** Queue-level and review-level wait semantics already exist through the versioned notification bus.
- **Preserve redaction boundaries.** Diagnostics should record IDs, statuses, paths, and error codes, but not raw patch bodies.
- **Treat the CLI `--once` mode as the fastest operational smoke test.** It gives startup, migration, and row-count visibility without needing a long-running server session.

## Verification performed
All slice-level verification passed.

### Automated verification
1. `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/state-machine.test.ts packages/review-broker-core/test/notifications.test.ts packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/path-resolution.test.ts packages/review-broker-server/test/broker-service.test.ts packages/review-broker-server/test/claim-concurrency.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts`
   - Result: **pass**
   - Evidence: 9 test files passed, 25 tests passed

2. `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s01-smoke.sqlite --once`
   - Result: **pass**
   - Evidence: emitted `broker.started` and `broker.once_complete` JSON with WAL/NORMAL PRAGMAs and `migrationCount: 1`

3. `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx -e "import Database from 'better-sqlite3'; const db = new Database('./.tmp/s01-smoke.sqlite', { readonly: true }); const reviewCount = db.prepare('select count(*) as count from reviews').get(); const auditCount = db.prepare('select count(*) as count from audit_events').get(); const migrationCount = db.prepare('select count(*) as count from schema_migrations').get(); console.log(JSON.stringify({ reviewCount, auditCount, migrationCount })); db.close();"`
   - Result: **pass**
   - Evidence: `{ reviewCount: { count: 0 }, auditCount: { count: 0 }, migrationCount: { count: 1 } }`

### Observability/diagnostic confirmation
In addition to the required slice checks, an explicit service-level smoke confirmed the observability surfaces work together:
- `getReviewStatus(... wait: true, sinceVersion)` woke after a claim transition
- version progression moved `1 -> 2 -> 3` across create/claim/reclaim
- audit history persisted the ordered sequence `review.created`, `review.claimed`, `review.reclaimed`

## Requirement impact
- **Validated:** R002 shared typed review domain
- **Validated:** R003 durable SQLite-backed broker state
- **Advanced but not closed:**
  - R001 standalone runtime now exists and is smokeable, but full milestone proof still depends on S02-S05
  - R010 audit/failure visibility now exists for review-core flows, but reviewer lifecycle visibility still belongs to S03
  - R012 reclaim/stale-claim protection is started via reclaim + claim-generation fencing, but timeout/recovery behavior is still future work

## What remains for the next slices

### For S02 (full review lifecycle parity)
- Extend the existing shared contract/state-machine rather than creating separate lifecycle vocabularies.
- Reuse the persisted `messages` table and audit vocabulary rather than inventing a second discussion/activity store.
- Preserve the create/claim/proposal/status surfaces already proven here while adding verdict/close/requeue/counter-patch behavior.

### For S03 (reviewer lifecycle and recovery)
- Attach reviewer lifecycle state to the existing durable app context and audit repository.
- Reuse notification versions and audit rows as the visibility surface for reviewer/process anomalies.
- Apply the same stale-generation/fencing mindset to reviewer assignment and recovery paths.

### For S04 (typed client and MCP exposure)
- Wrap these shared contracts and runtime surfaces directly; do not redefine schemas in the client or MCP layer.
- Keep `startBroker()` as the composition seam for in-process integration tests and adapters.

## Downstream cautions
- `corepack pnpm --filter review-broker-server exec ...` runs from `packages/review-broker-server`, so relative smoke DB paths land under that package, not the repo root.
- In this harness, exact file-scoped verification should use `corepack pnpm ... exec vitest run ...`, not the root `test -- --run` wrapper.
- The CLI/diagnostic output resolves to the real worktree path, which may appear under the harness-managed worktree location rather than the friendlier repo alias.

## Bottom line
S01 delivered the durable broker core, the shared contract foundation, and a real standalone runtime entrypoint. Later slices should treat this slice as the canonical base for lifecycle expansion, reviewer management, and external client/MCP exposure rather than rebuilding any of those foundations.
