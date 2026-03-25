---
id: S02
parent: M001
milestone: M001
status: complete
validated_requirements:
  - R004
advanced_requirements:
  - R001
  - R010
---

# S02: Full review lifecycle parity

## Outcome
S02 completed the standalone broker’s first full lifecycle parity pass. The TypeScript runtime now preserves the review contract beyond create/claim basics: discussion, verdicts, chronological activity, approved-only close, proposer requeue after `changes_requested`, and counter-patch accept/reject decisions all execute against durable SQLite state and return shared-contract payloads.

This slice did **not** implement reviewer lifecycle/recovery or external client/MCP surfaces yet, but it did finish the core review lifecycle parity that downstream slices now build on.

## What this slice delivered

### 1. Frozen shared lifecycle contract for the standalone broker
`packages/review-broker-core` now defines the S02 lifecycle vocabulary and payloads for:
- verdict submission, close, add-message, discussion retrieval, activity retrieval, and counter-patch decisions
- lifecycle snapshot fields shared by both `ReviewSummary` and `ReviewProposal`
- the explicit mapping that TypeScript `submitted` is the standalone broker equivalent of legacy Python `in_review`
- tightened transition rules so:
  - `claimed -> submitted` is the discussion-start transition
  - proposer follow-up after `changes_requested` requeues to `pending`
  - `approved -> closed` is the only successful close path

The important downstream consequence is that later slices can treat lifecycle snapshot fields as part of the canonical broker contract rather than server-only metadata.

### 2. Additive durable lifecycle schema in SQLite
`packages/review-broker-server/src/db/migrations/002_review_lifecycle_parity.sql` extends the S01 schema without mutating `001_init.sql`. The runtime now persists:
- `reviews.current_round`
- `reviews.latest_verdict`
- `reviews.verdict_reason`
- `reviews.counter_patch_status`
- `reviews.last_message_at`
- `reviews.last_activity_at`
- counter-patch decision actor/note/timestamp metadata on the review row
- discussion `author_role` and `round_number` on `messages`

This keeps S02 restart-safe and gives later slices cheap status/proposal reads plus durable per-round discussion history.

### 3. Dedicated repository support for lifecycle reads and writes
The server package now includes durable repository helpers instead of ad hoc SQL drift:
- `reviews-repository.ts` owns lifecycle snapshot persistence, verdict writes, counter-patch decision writes, and message-activity updates
- `messages-repository.ts` provides chronological round-aware discussion storage and retrieval
- `audit-repository.ts` provides chronological activity-feed reads with stable summaries from persisted metadata
- `app-context.ts` wires the new repositories into the broker runtime

This established the S02 pattern that lifecycle state is parsed at the shared-contract boundary and persisted/read through repositories, not hand-assembled at each call site.

### 4. Real broker-service lifecycle flows
`packages/review-broker-server/src/runtime/broker-service.ts` now implements durable runtime methods for:
- `submitVerdict`
- `closeReview`
- `addMessage`
- `getDiscussion`
- `getActivityFeed`
- `acceptCounterPatch`
- `rejectCounterPatch`

Behavioral parity delivered by those methods includes:
- first discussion on a claimed review promotes it to `submitted`
- reviewer verdicts persist `latestVerdict` and `verdictReason`
- proposer follow-up after `changes_requested` requeues the review to `pending`, clears the claim, increments `currentRound`, and sets `counterPatchStatus: pending`
- counter-patch accept/reject are durable metadata decisions on the pending review rather than separate top-level review statuses
- lifecycle mutations append durable audit rows and wake both `review-queue` and `review-status:<reviewId>` notification topics where appropriate

### 5. End-to-end parity proof through the real started runtime
S02 added `packages/review-broker-server/test/review-lifecycle-parity.test.ts` as the parity-oriented end-to-end proof file. It proves two lifecycle paths through the real started broker composition:
- `create -> claim -> discussion -> changes_requested -> proposer follow-up requeue`
- `create -> claim -> approved -> close`

It also adds the explicit failure-path proof `invalid lifecycle transitions remain inspectable`, which matters because downstream slices now have a named regression surface for contract drift and inspectability regressions.

### 6. Richer smoke diagnostics for migrated lifecycle state
`start-broker.ts --once` and `inspectBrokerRuntime()` now surface richer redaction-safe lifecycle diagnostics:
- migration IDs and counts
- `reviewCount`, `messageCount`, and `auditEventCount`
- per-status and per-counter-patch status counts
- latest review/message/audit-event snapshots without patch bodies or message bodies

This turned the standalone CLI smoke path into a useful operational inspection surface for lifecycle parity work, not just a bootstrap ping.

## Patterns established for later slices
- **Use shared lifecycle snapshots, not surface-specific payload forks.** `currentRound`, `latestVerdict`, `verdictReason`, `counterPatchStatus`, `lastMessageAt`, and `lastActivityAt` are now canonical contract fields.
- **Keep `submitted` as the TS-side in-review state.** Later typed client and MCP work should preserve that vocabulary instead of reintroducing a separate `in_review` status string.
- **Treat proposer follow-up as the requeue moment.** After `changes_requested`, the author’s follow-up message is what returns the review to `pending` and advances the round.
- **Treat counter-patch outcomes as metadata on the pending review.** Accept/reject decisions are visible through shared status/proposal payloads and audit history, not as new main lifecycle statuses.
- **Persist round numbers in storage, not in the discussion API.** The shared discussion response intentionally omits per-message `roundNumber`; when later slices need round-aware debugging, combine repository reads with lifecycle snapshot fields.
- **Extend lifecycle behavior through additive migrations.** New durable lifecycle state should continue to preserve restart-safe migration history instead of editing baseline migrations.
- **Use CLI `--once` output as an inspectable parity surface.** It now exposes enough redaction-safe runtime state to diagnose migration drift and lifecycle persistence problems quickly.

## Verification performed
All slice-level verification passed.

### Automated verification
1. `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/state-machine.test.ts`
   - Result: **pass**
   - Evidence: 2 test files passed, 15 tests passed

2. `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/broker-service.test.ts packages/review-broker-server/test/review-discussion.test.ts packages/review-broker-server/test/review-verdicts.test.ts packages/review-broker-server/test/review-lifecycle-parity.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts`
   - Result: **pass**
   - Evidence: 7 test files passed, 16 tests passed

3. `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/review-lifecycle-parity.test.ts --testNamePattern "invalid lifecycle transitions remain inspectable"`
   - Result: **pass**
   - Evidence: 1 named test passed, 2 unrelated tests skipped in the same file

4. `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s02-smoke.sqlite --once`
   - Result: **pass**
   - Evidence: emitted `broker.started` and `broker.once_complete` JSON with `migrations: ["001_init", "002_review_lifecycle_parity"]` and `migrationCount: 2`

### Observability/diagnostic confirmation
In addition to the required slice checks, I ran a seeded lifecycle smoke against a clean absolute-path DB and confirmed the observability surfaces work together:
- a real review flowed to `pending` round 2 after reviewer discussion + `changes_requested` verdict + proposer follow-up
- `getReviewStatus` and `getProposal` both reported `counterPatchStatus: "pending"`
- `getActivityFeed` returned the ordered summaries:
  - `review.created`
  - `review.claimed`
  - `review.submitted`
  - `review.message_added`
  - `review.changes_requested`
  - `review.requeued`
  - `review.message_added`
- `start-broker.ts --once --db-path /home/cari/repos/tandem2/.gsd/worktrees/M001/.tmp/s02-uat-observe.sqlite` reported:
  - `reviewCount: 1`
  - `messageCount: 2`
  - `auditEventCount: 7`
  - `migrationCount: 2`
  - `statusCounts: { "pending": 1 }`
  - `counterPatchStatusCounts: { "pending": 1 }`
  - redaction-safe `latestReview`, `latestMessage`, and `latestAuditEvent` snapshots
- direct SQLite inspection of that same DB confirmed:
  - `schema_migrations.count === 2`
  - `reviews.count === 1`
  - `messages.count === 2`
  - `audit_events.count === 7`
  - stored lifecycle state `status: pending`, `currentRound: 2`, `latestVerdict: changes_requested`, `counterPatchStatus: pending`
  - latest message stored with `authorRole: proposer` and `roundNumber: 2`

## Requirement impact
- **Validated:** R004 full review lifecycle parity on the standalone broker
- **Advanced but not closed:**
  - R001 standalone runtime proof is stronger now because lifecycle operations are exercised through the real broker process and smoke path, but the milestone still needs reviewer lifecycle, typed client, MCP, and assembled final proof
  - R010 lifecycle anomaly inspectability improved through durable audit/activity/state snapshots and the named invalid-transition proof, but reviewer-state and crashed-reviewer visibility still belong to S03

## What remains for the next slices

### For S03 (reviewer lifecycle and recovery)
- Attach reviewer spawn/list/kill/recovery behavior to the same durable app context and audit/event model used here.
- Reuse the established lifecycle snapshot and activity-feed patterns so reviewer anomalies are inspectable without inventing a second failure-visibility surface.
- Keep claim/requeue semantics compatible with the S02 lifecycle rules; reviewer recovery should not reinterpret rounds, counter-patch state, or approved-only close behavior.

### For S04 (typed client and MCP exposure)
- Wrap the shared lifecycle schemas directly; do not redefine verdict/discussion/activity payloads in the client or MCP layer.
- Preserve the shared `submitted` vocabulary and the shared lifecycle snapshot fields exactly as frozen here.
- Expose the same status/proposal/activity contract across direct typed calls and MCP tools.

### For S05 (assembled parity proof)
- Re-run the S02 lifecycle paths as part of the full assembled end-to-end proof, not just package-level parity tests.
- Keep using `startBroker()` plus `start-broker.ts --once` as the real runtime composition/smoke surfaces.
- Recheck restart-safe behavior after S03/S04 add more state and external surfaces.

## Downstream cautions
- `corepack pnpm --filter review-broker-server exec ...` runs with `packages/review-broker-server` as the working directory, so cross-checking the same SQLite file between service seeding and CLI smoke is safest with an absolute `--db-path`.
- The shared discussion payload intentionally omits per-message round numbers; use `messages.round_number` plus `ReviewSummary.currentRound` / `ReviewProposal.currentRound` for round-aware inspection.
- Core package tests in this repo still execute checked-in `packages/review-broker-core/src/*.js` siblings, so shared-contract changes must keep TS and JS runtime files in sync.
- Harness-managed worktree paths may appear in runtime output even when commands were launched with the repo alias path; this is expected in this environment.

## Bottom line
S02 retired the milestone’s main review-lifecycle parity risk. The standalone TypeScript broker now preserves the verdict/discussion/activity/close/requeue/counter-patch contract durably, proves it through parity-oriented tests and restart checks, and exposes enough redaction-safe diagnostics that later slices can build reviewer lifecycle, client, and MCP work on top of a mechanically proven lifecycle core.
