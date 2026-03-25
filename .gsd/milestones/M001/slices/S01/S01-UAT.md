# S01 UAT: Broker core runtime with durable state

S01 does not require human UI acceptance, so this UAT is a **mechanical acceptance checklist** for the standalone runtime, durable state, and shared-contract behavior delivered in this slice.

## Preconditions
- Working directory: `/home/cari/repos/tandem2/.gsd/worktrees/M001`
- Dependencies are installed for this worktree.
- `corepack` and `git` are available.
- Remove any stale smoke DB before starting:
  - `rm -f packages/review-broker-server/.tmp/s01-smoke.sqlite*`

---

## Test Case 1 — Fresh standalone broker bootstrap and migration smoke

**Goal:** Prove the real standalone CLI can open a fresh SQLite DB, apply migrations, and exit cleanly without the old Python broker.

### Steps
1. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s01-smoke.sqlite --once`
2. Capture stdout.

### Expected outcome
- Exit code is `0`.
- Stdout contains a `broker.started` JSON line.
- Stdout contains a `broker.once_complete` JSON line.
- The `broker.started` payload reports:
  - `mode: "once"`
  - `dbPathSource: "argument"`
  - `pragmas.journalMode: "WAL"`
  - `pragmas.synchronous: "NORMAL"`
  - `pragmas.foreignKeys: true`
  - `migrations: ["001_init"]`
- The `broker.once_complete` payload reports:
  - `reviewCount: 0`
  - `auditEventCount: 0`
  - `migrationCount: 1`

### Failure signals to inspect
- `broker.start_failed` event
- missing `001_init` migration
- unexpected nonzero review/audit counts on a fresh DB

---

## Test Case 2 — Direct SQLite inspection after smoke bootstrap

**Goal:** Confirm the smoke command created the expected durable schema state in the same SQLite file.

### Steps
1. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx -e "import Database from 'better-sqlite3'; const db = new Database('./.tmp/s01-smoke.sqlite', { readonly: true }); const reviewCount = db.prepare('select count(*) as count from reviews').get(); const auditCount = db.prepare('select count(*) as count from audit_events').get(); const migrationCount = db.prepare('select count(*) as count from schema_migrations').get(); console.log(JSON.stringify({ reviewCount, auditCount, migrationCount })); db.close();"`
2. Capture stdout.

### Expected outcome
- Exit code is `0`.
- Output is valid JSON.
- JSON reports:
  - `reviewCount.count === 0`
  - `auditCount.count === 0`
  - `migrationCount.count === 1`

### Failure signals to inspect
- `no such table` errors
- `migrationCount.count !== 1`
- path confusion caused by `pnpm --filter review-broker-server exec ...` running from `packages/review-broker-server`

---

## Test Case 3 — Full slice verification suite

**Goal:** Prove the shared contract package, SQLite bootstrap layer, broker service, concurrency fencing, restart persistence, and CLI smoke tests all pass together.

### Steps
1. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/state-machine.test.ts packages/review-broker-core/test/notifications.test.ts packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/path-resolution.test.ts packages/review-broker-server/test/broker-service.test.ts packages/review-broker-server/test/claim-concurrency.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts`
2. Review the Vitest summary.

### Expected outcome
- Exit code is `0`.
- Vitest reports **9 passed files** and **25 passed tests**.
- Coverage implied by the suite includes:
  - shared contract/state-machine/notification behavior
  - SQLite bootstrap and path resolution
  - create/list/claim/status/proposal/reclaim happy path
  - invalid diff rejection with redacted audit persistence
  - exactly one concurrent claim winner plus one stale loser
  - restart-safe reopen against the same DB file
  - real CLI smoke startup through `start-broker.ts`

### Failure signals to inspect
- any failing broker-service assertions around audit metadata or claim generation
- concurrency test returning two winners or zero winners
- restart test losing persisted review/audit rows

---

## Test Case 4 — Review-status wait semantics and audit ordering smoke

**Goal:** Confirm the notification-bus wait path and durable audit ordering work under real broker service calls.

### Steps
1. Run:
   - `rm -f packages/review-broker-server/.tmp/s01-observe.sqlite* && corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx -e "import { createAppContext, createBrokerService } from './src/index.ts'; import { readFileSync } from 'node:fs'; void (async () => { const diff = readFileSync('./test/fixtures/valid-review.diff', 'utf8'); const context = createAppContext({ cwd: '/home/cari/repos/tandem2/.gsd/worktrees/M001', dbPath: './.tmp/s01-observe.sqlite' }); try { const service = createBrokerService(context); const created = await service.createReview({ title: 'S01 observability smoke', description: 'verify audit rows and notification versions', diff, authorId: 'observer', priority: 'normal' }); const before = await service.getReviewStatus({ reviewId: created.review.reviewId }); const waiter = service.getReviewStatus({ reviewId: created.review.reviewId, wait: true, sinceVersion: before.version, timeoutMs: 500 }); await service.claimReview({ reviewId: created.review.reviewId, claimantId: 'reviewer-a' }); const after = await waiter; const reclaimed = await service.reclaimReview({ reviewId: created.review.reviewId, actorId: 'reviewer-a' }); const audit = context.audit.listForReview(created.review.reviewId).map((event) => ({ eventType: event.eventType, statusFrom: event.statusFrom, statusTo: event.statusTo, errorCode: event.errorCode })); console.log(JSON.stringify({ reviewId: created.review.reviewId, initialVersion: before.version, claimedVersion: after.version, reclaimedVersion: reclaimed.version, audit })); } finally { context.close(); } })();"`
2. Capture stdout.

### Expected outcome
- Exit code is `0`.
- Output JSON shows:
  - `initialVersion: 1`
  - `claimedVersion: 2`
  - `reclaimedVersion: 3`
- `audit` is an ordered array of:
  1. `review.created`
  2. `review.claimed`
  3. `review.reclaimed`
- No audit entry exposes raw diff text.

### Failure signals to inspect
- waiter timeout instead of version increase
- missing or out-of-order audit events
- version numbers not incrementing across create/claim/reclaim

---

## Edge-case checklist

### Edge Case A — Invalid diff is rejected without creating a review
- Covered by `packages/review-broker-server/test/broker-service.test.ts`
- Expected outcome:
  - broker throws `INVALID_DIFF`
  - `reviews` table remains empty
  - one `review.diff_rejected` audit row is recorded
  - audit metadata contains affected-file hints but not raw patch bodies

### Edge Case B — Concurrent claim race is fenced durably
- Covered by `packages/review-broker-server/test/claim-concurrency.test.ts`
- Expected outcome:
  - exactly one claimant gets `outcome: "claimed"`
  - one claimant gets `outcome: "stale"`
  - persisted review remains `claimed` with `claimGeneration: 1`
  - audit history contains one `review.claimed` and one `review.transition_rejected` with `STALE_CLAIM_GENERATION`

### Edge Case C — Reopen preserves review and audit state
- Covered by `packages/review-broker-server/test/restart-persistence.test.ts`
- Expected outcome:
  - a second runtime reading the same DB sees the prior review
  - proposal metadata is still available
  - audit history still contains `review.created` then `review.claimed`

---

## Acceptance decision
S01 is acceptable only if **all four test cases pass** and the edge-case expectations remain true. Any failure means the slice is not yet closed, because S01's contract is specifically about a standalone runtime with durable shared-state behavior, not just compiled artifacts.
