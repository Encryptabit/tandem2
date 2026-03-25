# S02 UAT: Full review lifecycle parity

S02 does not require human UI acceptance, so this UAT is a **mechanical acceptance checklist** for the standalone broker’s full review lifecycle parity, durable lifecycle state, and smoke diagnostics.

## Preconditions
- Working directory: `/home/cari/repos/tandem2/.gsd/worktrees/M001`
- Dependencies are installed for this worktree.
- `corepack`, `git`, and `tsx` are available through the workspace toolchain.
- Remove stale smoke/UAT DBs before starting:
  - `rm -f .tmp/s02-uat-observe.sqlite*`
  - `rm -f packages/review-broker-server/.tmp/s02-smoke.sqlite*`

---

## Test Case 1 — Full slice verification contract

**Goal:** Prove the exact slice-level verification commands from the plan all pass.

### Steps
1. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/state-machine.test.ts`
2. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/broker-service.test.ts packages/review-broker-server/test/review-discussion.test.ts packages/review-broker-server/test/review-verdicts.test.ts packages/review-broker-server/test/review-lifecycle-parity.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts`
3. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/review-lifecycle-parity.test.ts --testNamePattern "invalid lifecycle transitions remain inspectable"`
4. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s02-smoke.sqlite --once`

### Expected outcome
- All four commands exit `0`.
- The core suite reports **2 passed files** and **15 passed tests**.
- The server suite reports **7 passed files** and **16 passed tests**.
- The named invalid-transition verification reports **1 passed test** with **2 skipped** unrelated tests from the same file.
- The CLI smoke output contains:
  - `broker.started`
  - `broker.once_complete`
  - `migrations: ["001_init", "002_review_lifecycle_parity"]`
  - `migrationCount: 2`

### Failure signals to inspect
- missing `review-lifecycle-parity.test.ts`
- invalid close/requeue transitions becoming allowed or no longer inspectable
- migration drift causing `migrationCount !== 2`
- any smoke output that omits the richer lifecycle summary fields

---

## Test Case 2 — Requeue parity path through the real started runtime

**Goal:** Prove the broker preserves the full `changes_requested` → proposer follow-up requeue path through the started runtime.

### Steps
1. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/review-lifecycle-parity.test.ts --testNamePattern "proves the changes-requested requeue path through the started broker runtime"`
2. Review the Vitest output.

### Expected outcome
- Exit code is `0`.
- The named test passes.
- The proved behavior includes:
  - create → claim → first discussion message moves `claimed -> submitted`
  - reviewer `changes_requested` verdict persists `latestVerdict` and `verdictReason`
  - proposer follow-up message requeues the review to `pending`
  - `currentRound` advances from `1` to `2`
  - `counterPatchStatus` becomes `pending`
  - activity feed remains chronological

### Failure signals to inspect
- review stays `changes_requested` instead of requeueing to `pending`
- `currentRound` fails to increment
- counter-patch state remains `none`
- activity ordering differs from the lifecycle path

---

## Test Case 3 — Approve-and-close parity path plus counter-patch decisions

**Goal:** Prove approved close semantics and durable counter-patch decision behavior.

### Steps
1. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/review-lifecycle-parity.test.ts --testNamePattern "proves the approve-and-close path with ordered activity output through the started broker runtime"`
2. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/review-verdicts.test.ts --testNamePattern "submits approved verdicts, exposes enriched status/proposal payloads, and closes approved reviews|accepts pending counter-patches and exposes the decision through review, proposal, repository, and activity surfaces|rejects pending counter-patches and preserves the rejection in durable state and activity history"`

### Expected outcome
- Both commands exit `0`.
- The approve-and-close parity test proves:
  - approved verdict persists durable lifecycle snapshot fields
  - close succeeds only from the approved path
  - ordered activity output includes the close transition
- The counter-patch verdict tests prove:
  - pending counter-patches can be accepted or rejected
  - the decision is visible through `getReviewStatus`, `getProposal`, durable repository reads, and activity history
  - accept/reject do **not** invent a new top-level review status

### Failure signals to inspect
- close succeeds from a non-approved review
- `proposal.counterPatchStatus` differs from `review.counterPatchStatus`
- repository state and activity history disagree on counter-patch decisions

---

## Test Case 4 — Restart persistence of S02 lifecycle metadata

**Goal:** Confirm a fresh runtime reopening the same SQLite file preserves S02 lifecycle state, not just S01 claim metadata.

### Steps
1. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/restart-persistence.test.ts --testNamePattern "reopens the same SQLite file through a fresh runtime instance and preserves S02 lifecycle metadata"`
2. Review the test output.

### Expected outcome
- Exit code is `0`.
- The named test passes.
- Reopened state preserves:
  - migration 002
  - discussion history
  - `latestVerdict`
  - `verdictReason`
  - `counterPatchStatus`
  - `lastMessageAt`
  - `lastActivityAt`
  - durable counter-patch decision payload

### Failure signals to inspect
- lifecycle snapshot fields reset after reopen
- discussion history exists but round-aware lifecycle state does not
- reopened runtime sees only S01-era fields

---

## Test Case 5 — Seeded observability smoke for lifecycle diagnostics

**Goal:** Prove the broker’s observability/diagnostic surfaces expose durable lifecycle state clearly without leaking patch or message bodies.

### Steps
1. Seed a clean absolute-path DB with a lifecycle scenario:
   - `rm -f .tmp/s02-uat-observe.sqlite* && corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx -e "import { createAppContext, createBrokerService } from './src/index.ts'; import { readFileSync } from 'node:fs'; const dbPath = '/home/cari/repos/tandem2/.gsd/worktrees/M001/.tmp/s02-uat-observe.sqlite'; void (async () => { const diff = readFileSync('./test/fixtures/valid-review.diff', 'utf8'); const context = createAppContext({ cwd: '/home/cari/repos/tandem2/.gsd/worktrees/M001', dbPath }); try { const service = createBrokerService(context); const created = await service.createReview({ title: 'S02 UAT observability smoke', description: 'verify lifecycle diagnostics', diff, authorId: 'author-1', priority: 'normal' }); await service.claimReview({ reviewId: created.review.reviewId, claimantId: 'reviewer-1' }); await service.addMessage({ reviewId: created.review.reviewId, actorId: 'reviewer-1', body: 'Please update tests.' }); await service.submitVerdict({ reviewId: created.review.reviewId, actorId: 'reviewer-1', verdict: 'changes_requested', reason: 'Need another test case.' }); await service.addMessage({ reviewId: created.review.reviewId, actorId: 'author-1', body: 'Added follow-up patch.' }); const status = await service.getReviewStatus({ reviewId: created.review.reviewId }); const proposal = await service.getProposal({ reviewId: created.review.reviewId }); const activity = await service.getActivityFeed({ reviewId: created.review.reviewId }); console.log(JSON.stringify({ reviewId: created.review.reviewId, status: status.review.status, currentRound: status.review.currentRound, latestVerdict: status.review.latestVerdict, counterPatchStatus: status.review.counterPatchStatus, proposalCounterPatchStatus: proposal.proposal.counterPatchStatus, activity: activity.activity.map((event) => ({ type: event.eventType, summary: event.summary })) }, null, 2)); } finally { context.close(); } })();"`
2. Run the real CLI over that same DB:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path /home/cari/repos/tandem2/.gsd/worktrees/M001/.tmp/s02-uat-observe.sqlite --once`
3. Inspect the same SQLite file directly:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx -e "import Database from 'better-sqlite3'; const db = new Database('/home/cari/repos/tandem2/.gsd/worktrees/M001/.tmp/s02-uat-observe.sqlite', { readonly: true }); const counts = { reviews: db.prepare('select count(*) as count from reviews').get(), messages: db.prepare('select count(*) as count from messages').get(), auditEvents: db.prepare('select count(*) as count from audit_events').get(), migrations: db.prepare('select count(*) as count from schema_migrations').get() }; const lifecycle = db.prepare('select status, current_round as currentRound, latest_verdict as latestVerdict, counter_patch_status as counterPatchStatus from reviews limit 1').get(); const latestMessage = db.prepare('select author_role as authorRole, round_number as roundNumber from messages order by message_id desc limit 1').get(); console.log(JSON.stringify({ counts, lifecycle, latestMessage })); db.close();"`

### Expected outcome
- Step 1 outputs JSON showing:
  - `status: "pending"`
  - `currentRound: 2`
  - `latestVerdict: "changes_requested"`
  - `counterPatchStatus: "pending"`
  - `proposalCounterPatchStatus: "pending"`
  - ordered activity summaries ending with `review.requeued` then round-2 `review.message_added`
- Step 2 outputs `broker.started` and `broker.once_complete` JSON showing:
  - `reviewCount: 1`
  - `messageCount: 2`
  - `auditEventCount: 7`
  - `migrationCount: 2`
  - `statusCounts: { "pending": 1 }`
  - `counterPatchStatusCounts: { "pending": 1 }`
  - redaction-safe `latestReview`, `latestMessage`, and `latestAuditEvent`
- Step 3 outputs JSON showing:
  - `counts.reviews.count === 1`
  - `counts.messages.count === 2`
  - `counts.auditEvents.count === 7`
  - `counts.migrations.count === 2`
  - `lifecycle.status === "pending"`
  - `lifecycle.currentRound === 2`
  - `lifecycle.latestVerdict === "changes_requested"`
  - `lifecycle.counterPatchStatus === "pending"`
  - `latestMessage.authorRole === "proposer"`
  - `latestMessage.roundNumber === 2`

### Failure signals to inspect
- using a relative `--db-path` for the CLI and accidentally reading a different package-local DB
- missing `latestReview` / `latestMessage` / `latestAuditEvent` snapshots in `broker.once_complete`
- direct DB inspection disagreeing with the API/CLI lifecycle state
- message or patch bodies leaking into diagnostic summaries

---

## Edge-case checklist

### Edge Case A — Invalid lifecycle transitions remain inspectable
- Covered by `packages/review-broker-server/test/review-lifecycle-parity.test.ts`
- Expected outcome:
  - rejected transition returns an error instead of silently mutating state
  - durable state remains readable after the failure
  - activity/audit surfaces still explain what happened

### Edge Case B — First discussion is the active in-review transition
- Covered by `packages/review-broker-server/test/review-discussion.test.ts`
- Expected outcome:
  - a claimed review becomes `submitted` on the first discussion message
  - `messages` remain chronological
  - the shared discussion response shows reviewer and proposer messages in order

### Edge Case C — Counter-patch decisions are metadata decisions, not new main statuses
- Covered by `packages/review-broker-server/test/review-verdicts.test.ts`
- Expected outcome:
  - review state remains inspectable through shared status/proposal payloads
  - durable review row stores the decision payload
  - activity history records the decision without redefining the main lifecycle

### Edge Case D — Additive migration expectations stay aligned with smoke diagnostics
- Covered by `packages/review-broker-server/test/sqlite-bootstrap.test.ts` and `packages/review-broker-server/test/start-broker.smoke.test.ts`
- Expected outcome:
  - both `001_init` and `002_review_lifecycle_parity` appear in migration inspection surfaces
  - fresh or reopened DBs continue to report `migrationCount === 2`

---

## Acceptance decision
S02 is acceptable only if **all five test cases pass** and the edge-case expectations remain true. Any failure means the standalone broker has not yet preserved the current review lifecycle contract with durable parity-oriented proof.
