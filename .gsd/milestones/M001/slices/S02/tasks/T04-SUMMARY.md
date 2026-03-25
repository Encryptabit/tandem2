---
id: T04
parent: S02
milestone: M001
provides:
  - End-to-end lifecycle parity proof plus richer smoke diagnostics for the standalone broker runtime
key_files:
  - packages/review-broker-server/test/review-lifecycle-parity.test.ts
  - packages/review-broker-server/test/restart-persistence.test.ts
  - packages/review-broker-server/test/start-broker.smoke.test.ts
  - packages/review-broker-server/src/index.ts
  - packages/review-broker-server/src/cli/start-broker.ts
  - .gsd/milestones/M001/slices/S02/S02-PLAN.md
key_decisions:
  - Reuse the exported startBroker()/inspectBrokerRuntime composition as the parity and smoke-test inspection surface instead of inventing a separate test-only harness snapshot
patterns_established:
  - Deterministic startBroker tests need one extra leading timestamp because the runtime consumes the shared now() clock for startedAt before the first persisted lifecycle mutation
observability_surfaces:
  - packages/review-broker-server/test/review-lifecycle-parity.test.ts
  - packages/review-broker-server/test/restart-persistence.test.ts
  - packages/review-broker-server/test/start-broker.smoke.test.ts
  - packages/review-broker-server/src/cli/start-broker.ts --once JSON output
  - SQLite reviews, messages, audit_events, and schema_migrations tables
duration: 10m
verification_result: passed
completed_at: 2026-03-21T04:28:30-07:00
blocker_discovered: false
---

# T04: Prove full lifecycle parity through end-to-end tests and smoke diagnostics

**Added end-to-end lifecycle parity proof and richer `start-broker --once` diagnostics for the S02 broker runtime.**

## What Happened

I added `packages/review-broker-server/test/review-lifecycle-parity.test.ts` as the dedicated S02 parity proof. It exercises the two full lifecycle paths the slice contract requires against the real started runtime composition via `startBroker()`: create → claim → discussion → changes_requested → proposer follow-up requeue, and create → claim → approved → close. I also added the targeted `invalid lifecycle transitions remain inspectable` test so the slice’s named failure-path verification now resolves to a concrete, durable proof instead of a missing file.

For the requeue path, the parity test asserts the end-to-end behavior that downstream slices care about: first reviewer discussion promotes `claimed -> submitted`, a `changes_requested` verdict persists round-one verdict metadata, the proposer follow-up requeues back to `pending` with `currentRound = 2`, the shared status/proposal payloads reflect the counter-patch state, the persisted messages keep round numbers in storage, the activity feed remains chronological, and the exported runtime snapshot reports the same state without leaking patch bodies.

I upgraded `packages/review-broker-server/test/restart-persistence.test.ts` from an S01-style claim-state reopen check into an S02 lifecycle reopen proof. The reopened runtime now has to preserve migration 002, round-aware discussion history, `latestVerdict`, `verdictReason`, `counterPatchStatus`, `lastMessageAt`, `lastActivityAt`, and the durable counter-patch decision payload after a fresh runtime instance reopens the same SQLite file.

I expanded the smoke diagnostics surface behind `start-broker.ts --once` by enriching `inspectBrokerRuntime()` in `packages/review-broker-server/src/index.ts` and forwarding the added fields from `packages/review-broker-server/src/cli/start-broker.ts`. The once-complete JSON now reports `messageCount`, per-status counts, per-counter-patch counts, and redaction-safe summaries of the latest review, latest message, and latest audit event in addition to the existing migration and row counts.

I then rewrote `packages/review-broker-server/test/start-broker.smoke.test.ts` so it proves both parts of the smoke contract: a fresh CLI run still bootstraps a migrated database cleanly with both migrations applied, and a reopened CLI run over a seeded S02 lifecycle database surfaces the persisted lifecycle state clearly through structured JSON. The seeded state is created through the real broker service rather than direct fixture rows, so the smoke assertions stay aligned with the shipped runtime behavior.

I also aligned `.gsd/milestones/M001/slices/S02/S02-PLAN.md` with local reality by marking T03 and T04 complete, and I added a `.gsd/KNOWLEDGE.md` note for the deterministic `startBroker({ now })` timestamp gotcha discovered while building the new parity coverage.

## Verification

I first ran the focused T04 verification suite covering the new parity test, the enriched restart proof, and the updated smoke test; all three passed.

I then ran the full slice verification contract exactly as written in `S02-PLAN.md`. The core contract/state-machine tests passed, the full server parity suite passed with the new T04 file in place, the named invalid-transition parity command passed, and the real `review-broker-server` CLI smoke command emitted the richer once-complete JSON with migration 002 plus the new runtime-state fields.

For observability impact, I verified the new signals directly in tests and in the real CLI output: persisted `audit_events` remain chronological and inspectable after requeue/close/invalid-transition flows, round-aware `messages` survive restart, `schema_migrations` still reports both additive migrations, and `start-broker.ts --once` now exposes migrated lifecycle state through JSON without logging patch bodies or message bodies.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/review-lifecycle-parity.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts` | 0 | ✅ pass | 1.50s |
| 2 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/state-machine.test.ts` | 0 | ✅ pass | 0.86s |
| 3 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/broker-service.test.ts packages/review-broker-server/test/review-discussion.test.ts packages/review-broker-server/test/review-verdicts.test.ts packages/review-broker-server/test/review-lifecycle-parity.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts` | 0 | ✅ pass | 1.56s |
| 4 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/review-lifecycle-parity.test.ts --testNamePattern "invalid lifecycle transitions remain inspectable"` | 0 | ✅ pass | 1.92s |
| 5 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s02-smoke.sqlite --once` | 0 | ✅ pass | 0.51s |

## Diagnostics

The fastest inspection surface for this task is now `packages/review-broker-server/test/review-lifecycle-parity.test.ts`: it proves both full-lifecycle paths against the real started runtime and leaves a targeted invalid-transition test name that maps directly to the slice verification contract.

For persisted-state inspection, reopen the SQLite DB from the restart or smoke tests and inspect `reviews`, `messages`, `audit_events`, and `schema_migrations`. The authoritative S02 lifecycle fields remain `reviews.current_round`, `reviews.latest_verdict`, `reviews.verdict_reason`, `reviews.counter_patch_status`, `reviews.last_message_at`, and `reviews.last_activity_at`, while `messages.round_number` retains per-message round information that the shared discussion payload intentionally omits.

For runtime smoke diagnostics, `packages/review-broker-server/src/cli/start-broker.ts --once` now emits structured JSON with:
- migration IDs on `broker.started`
- `reviewCount`, `messageCount`, `auditEventCount`, and `migrationCount`
- `statusCounts` and `counterPatchStatusCounts`
- redaction-safe `latestReview`, `latestMessage`, and `latestAuditEvent` snapshots

Those fields make migration drift, lost lifecycle metadata after reopen, and CLI/runtime drift mechanically inspectable without logging diffs, message bodies, or secrets.

## Deviations

- I expanded `packages/review-broker-server/src/index.ts` in addition to `src/cli/start-broker.ts` because the smoke snapshot logic is exported from `inspectBrokerRuntime()` rather than being implemented directly in the CLI file. This was a local-reality alignment change, not a plan change in behavior.

## Known Issues

None.

## Files Created/Modified

- `packages/review-broker-server/test/review-lifecycle-parity.test.ts` — added the dedicated end-to-end parity proof for requeue, close, and inspectable invalid transitions through `startBroker()`.
- `packages/review-broker-server/test/restart-persistence.test.ts` — upgraded reopen coverage from simple claim-state persistence to full S02 lifecycle metadata persistence.
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — updated the real CLI smoke proof to verify fresh migration bootstrap plus seeded lifecycle-state diagnostics.
- `packages/review-broker-server/src/index.ts` — expanded `inspectBrokerRuntime()` with message counts, status summaries, and latest redaction-safe lifecycle snapshots.
- `packages/review-broker-server/src/cli/start-broker.ts` — forwarded the richer runtime snapshot fields in `broker.once_complete` JSON.
- `.gsd/KNOWLEDGE.md` — recorded the deterministic `startBroker({ now })` timestamp-consumption gotcha for future agents.
- `.gsd/milestones/M001/slices/S02/S02-PLAN.md` — aligned the slice checklist with local reality by marking T03 and T04 complete.
