---
id: T03
parent: S02
milestone: M001
provides:
  - Durable broker-service lifecycle methods for verdicts, discussion, activity feeds, close, requeue, and counter-patch decisions in review-broker-server
key_files:
  - packages/review-broker-server/src/runtime/broker-service.ts
  - packages/review-broker-server/test/broker-service.test.ts
  - packages/review-broker-server/test/review-discussion.test.ts
  - packages/review-broker-server/test/review-verdicts.test.ts
  - .gsd/DECISIONS.md
  - .gsd/KNOWLEDGE.md
key_decisions:
  - D014: Treat first discussion on a claimed review as claim→submitted, proposer follow-up after changes_requested as the pending requeue/currentRound+1 moment, and counter-patch accept/reject as durable metadata decisions on the pending review
patterns_established:
  - Verify round-aware discussion behavior through messages-repository plus ReviewSummary/ReviewProposal lifecycle snapshots because the shared discussion response intentionally omits per-message round numbers
observability_surfaces:
  - packages/review-broker-server/test/broker-service.test.ts
  - packages/review-broker-server/test/review-discussion.test.ts
  - packages/review-broker-server/test/review-verdicts.test.ts
  - SQLite reviews, messages, and audit_events tables
  - packages/review-broker-server/src/cli/start-broker.ts --once JSON output
duration: 1h14m
verification_result: passed
completed_at: 2026-03-21T04:13:31-07:00
blocker_discovered: false
---

# T03: Implement verdict, discussion, activity, and counter-patch runtime flows

**Implemented durable broker-service lifecycle flows for verdicts, discussion, activity feeds, close, and counter-patch decisions.**

## What Happened

I extended `packages/review-broker-server/src/runtime/broker-service.ts` with the full S02 lifecycle surface: `submitVerdict`, `closeReview`, `addMessage`, `getDiscussion`, `getActivityFeed`, `acceptCounterPatch`, and `rejectCounterPatch`, with every request/response parsed through the shared `review-broker-core` schemas.

For runtime behavior, I made the first discussion message on a claimed review move the review into the shared `submitted` state, and I made a proposer follow-up message on a `changes_requested` review perform the durable requeue back to `pending`, clear the active claim, increment `currentRound`, and mark `counterPatchStatus` as `pending`. Counter-patch accept/reject now persist durable decision metadata on the review row, append redaction-safe audit rows, and return the enriched shared status/proposal payloads without inventing a new top-level lifecycle branch.

I preserved observability while implementing these flows. Every lifecycle mutation now writes audit rows with summaries and machine-usable metadata but avoids persisting message bodies into audit metadata. Mutations that should wake downstream waiters continue to bump both the queue and per-review notification topics via the existing notification bus, and the new tests prove those wakeups on a real SQLite-backed runtime.

On the test side, I updated `packages/review-broker-server/test/broker-service.test.ts` to cover the enriched lifecycle snapshot/activity payload shape, added `packages/review-broker-server/test/review-discussion.test.ts` for chronological discussion plus proposer requeue behavior, and added `packages/review-broker-server/test/review-verdicts.test.ts` for approved close flow and accepted/rejected counter-patch decisions.

I also recorded D014 in `.gsd/DECISIONS.md` for the runtime-state model and added a `.gsd/KNOWLEDGE.md` note that round-aware discussion assertions must combine repository reads with lifecycle snapshot fields because the shared discussion response intentionally omits `roundNumber`.

## Verification

I first ran the focused T03 verification command covering the updated service harness plus the new discussion/verdict test files; all three files passed.

I then ran the package build, which passed for both `review-broker-core` and `review-broker-server`.

For the slice-level gate, I ran all four verification commands from `S02-PLAN.md`. The shared core tests passed, the expanded server suite passed with the new T03 files in place, and the real `start-broker.ts --once` smoke command still emitted the expected structured JSON with both migrations. The only remaining failing slice-level check is still the targeted `review-lifecycle-parity.test.ts` command, which exits with “No test files found” because that proof file is explicitly scheduled for T04.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/broker-service.test.ts packages/review-broker-server/test/review-discussion.test.ts packages/review-broker-server/test/review-verdicts.test.ts` | 0 | ✅ pass | 0.54s |
| 2 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 build` | 0 | ✅ pass | 4.6s |
| 3 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/state-machine.test.ts` | 0 | ✅ pass | 0.50s |
| 4 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/broker-service.test.ts packages/review-broker-server/test/review-discussion.test.ts packages/review-broker-server/test/review-verdicts.test.ts packages/review-broker-server/test/review-lifecycle-parity.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts` | 0 | ✅ pass | 1.01s |
| 5 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/review-lifecycle-parity.test.ts --testNamePattern "invalid lifecycle transitions remain inspectable"` | 1 | ❌ fail | 2.6s |
| 6 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s02-smoke.sqlite --once` | 0 | ✅ pass | 2.6s |

## Diagnostics

The fastest inspection surfaces for this task are `packages/review-broker-server/test/review-discussion.test.ts` and `packages/review-broker-server/test/review-verdicts.test.ts`: they directly prove ordered discussion history, proposer requeue/current-round behavior, durable counter-patch state, audit summaries, and queue/per-review notification wakeups.

For persisted state, inspect the SQLite `reviews`, `messages`, and `audit_events` tables after running those tests. `messages.round_number` is now the authoritative per-message round source, while `reviews.current_round`, `latest_verdict`, `verdict_reason`, `counter_patch_status`, `last_message_at`, and `last_activity_at` expose the shared lifecycle snapshot returned by status/proposal APIs.

For runtime smoke diagnostics, `packages/review-broker-server/src/cli/start-broker.ts --once` remains the quickest end-to-end check: it emits structured JSON with DB path, workspace root, PRAGMAs, and applied migrations without logging patch bodies.

## Deviations

- No `packages/review-broker-server/src/index.ts` change was needed in local reality because the existing package surface already re-exported `broker-service.ts`; extending the runtime interface and implementation automatically exposed the new methods to downstream imports.

## Known Issues

- `packages/review-broker-server/test/review-lifecycle-parity.test.ts` still does not exist, so the slice-level targeted parity command continues to fail with “No test files found” until T04 adds that file.

## Files Created/Modified

- `packages/review-broker-server/src/runtime/broker-service.ts` — implemented durable S02 lifecycle methods, audit writes, and notification wakeups for verdicts, discussion, close, requeue, and counter-patch decisions.
- `packages/review-broker-server/test/broker-service.test.ts` — extended the durable service harness to assert enriched lifecycle snapshots and activity-feed payloads.
- `packages/review-broker-server/test/review-discussion.test.ts` — added focused proof for chronological discussion, proposer requeue, round tracking, and queue/per-review waiter wakeups.
- `packages/review-broker-server/test/review-verdicts.test.ts` — added focused proof for approved close flow plus accepted/rejected counter-patch behavior.
- `.gsd/DECISIONS.md` — recorded D014 for the runtime lifecycle model used by discussion and counter-patch operations.
- `.gsd/KNOWLEDGE.md` — documented the round-number inspection gotcha for future agents working against the shared discussion contract.
