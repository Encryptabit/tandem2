---
id: S03
parent: M001
milestone: M001
status: researched
---

# S03: Reviewer lifecycle and recovery

## Summary

This is **targeted research**, not deep research. The stack and patterns are already established by S01/S02; the main work is filling an obvious capability gap: the standalone broker has durable review lifecycle parity, but it has **no reviewer lifecycle implementation yet**.

S03 primarily targets:
- **R005** — broker-owned reviewer lifecycle (`spawn/list/kill`, reviewer assignment state)
- **R010** — visible reviewer state, audit signals, and failure inspectability
- advances **R001** — stronger real-runtime proof for the standalone broker
- advances the M001 support portion of **R012** — reclaim/recovery from reviewer exits and stale sessions

The repo already has the right foundations for S03:
- durable SQLite migrations and repositories
- a shared zod contract package
- a versioned notification bus
- CAS-style reclaim protection via `claim_generation`
- a reusable `startBroker()` runtime and real CLI smoke path

What is missing is everything reviewer-specific:
- no reviewer request/response schemas
- no reviewer records or repository
- no reviewer process management code
- no spawn/list/kill service methods
- no recovery/startup reconciliation for dead reviewers
- no reviewer-specific diagnostics in `inspectBrokerRuntime()` / `start-broker.ts --once`

## Recommendation

Build S03 as **one additive reviewer subsystem** on top of the existing review lifecycle, not as a rewrite of review ownership.

Recommended shape:
1. **Freeze reviewer contract in `review-broker-core` first**
   - add reviewer record/list/spawn/kill schemas
   - extend audit vocabulary for reviewer lifecycle events as needed
   - keep existing review lifecycle payloads stable
2. **Add one durable reviewer persistence seam in `review-broker-server`**
   - new migration for reviewer rows
   - new `reviewers-repository.ts`
   - keep review assignment sourced from existing `reviews.claimed_by` / `claim_generation`
3. **Add a dedicated reviewer runtime manager module**
   - do **not** inline subprocess orchestration into the already-1127-line `broker-service.ts`
   - encapsulate child-process spawn/exit/kill/watch logic behind a focused module
4. **Use existing review reclaim semantics for recovery**
   - when a tracked reviewer dies, reclaim only the review states that are actually limbo-prone (`claimed`, `submitted`)
   - append durable audit rows explaining the cause
   - reuse `claim_generation` fencing so recovery cannot clobber a newer claim
5. **Prove it with a real spawned fixture process**
   - use an actual local child process in tests
   - extend CLI `--once` smoke diagnostics so reviewer state is visible without attaching a debugger

Strong recommendation: **do not make `claimReview()` depend on pre-registered reviewers yet**. Current S02 behavior accepts arbitrary `claimantId` strings and many tests rely on that. Reviewer lifecycle should be additive in S03, not a breaking reinterpretation of claim semantics.

## Implementation Landscape

### Existing files that matter

#### Shared contract layer
- `packages/review-broker-core/src/domain.ts`
  - `REVIEWER_STATUSES` already exists at `:41-43` with `idle | assigned | offline`
  - `AUDIT_EVENT_TYPES` is still review-only at `:45-61`
  - there are no reviewer record types yet
- `packages/review-broker-core/src/contracts.ts`
  - `ReviewerStatusSchema` exists at `:16`
  - review lifecycle schemas are fully frozen through `GetActivityFeedResponseSchema` and related types
  - there are **no** reviewer request/response schemas yet (`spawn/list/kill` are absent)
- `packages/review-broker-core/src/notifications.ts`
  - `VersionedNotificationBus` accepts arbitrary string topics at `:31-96`
  - this means reviewer-specific topics can be added without changing bus internals
- `packages/review-broker-core/test/contracts.test.ts`
  - current contract freeze tests are the right place to lock reviewer payloads before server work

#### Runtime composition / diagnostics
- `packages/review-broker-server/src/runtime/app-context.ts`
  - current app context wires `reviews`, `messages`, `audit`, and notifications only
  - this is the natural place to add `reviewers` repository and reviewer manager wiring
- `packages/review-broker-server/src/index.ts`
  - `startBroker()` at `:73`
  - `inspectBrokerRuntime()` at `:108`
  - currently only inspects review/message/audit counts and latest snapshots
  - `close()` is synchronous and currently only tears down SQLite + signal handlers
- `packages/review-broker-server/src/cli/start-broker.ts`
  - real CLI smoke entrypoint
  - already emits structured JSON startup / once-complete diagnostics
  - should become the slice’s operator-facing reviewer visibility surface too

#### Review lifecycle service and recovery pattern to reuse
- `packages/review-broker-server/src/runtime/broker-service.ts`
  - `BrokerService` interface starts at `:97`; no reviewer methods exist yet
  - `claimReview()` at `:221`
  - `reclaimReview()` at `:363`
  - `addMessage()` at `:641`
  - `notifyReviewMutation()` at `:928`
  - `handleCounterPatchDecision()` at `:998`
  - current service uses the same pattern everywhere: parse with zod → repo transaction → audit append → notification bump
- `packages/review-broker-server/test/claim-concurrency.test.ts`
  - proves `claim_generation` CAS fencing and durable stale detection
  - this is the key prior art for reviewer-exit recovery races

#### Durable storage
- `packages/review-broker-server/src/db/migrations/001_init.sql`
  - tables: `reviews`, `messages`, `audit_events`
  - `audit_events.review_id` is nullable, which is useful for reviewer-global audit rows
- `packages/review-broker-server/src/db/migrations/002_review_lifecycle_parity.sql`
  - shows the established additive-migration pattern
- `packages/review-broker-server/src/db/reviews-repository.ts`
  - owns persisted lifecycle snapshots and claim fencing
  - this should remain the source of truth for active review ownership
- `packages/review-broker-server/src/db/audit-repository.ts`
  - already supports `reviewId?: string | null`
  - can store reviewer-global events without a new audit table if reviewer audit types are added

#### Existing verification pattern
- `packages/review-broker-server/test/sqlite-bootstrap.test.ts`
  - schema + migration verification pattern
- `packages/review-broker-server/test/restart-persistence.test.ts`
  - restart-safe persistence verification pattern
- `packages/review-broker-server/test/review-lifecycle-parity.test.ts`
  - real `startBroker()` parity proof pattern
- `packages/review-broker-server/test/start-broker.smoke.test.ts`
  - CLI `--once` smoke proof pattern

### What is missing right now

Searches across `packages/review-broker-core/src` and `packages/review-broker-server/src` found:
- no `spawnReviewer`
- no `listReviewers`
- no `killReviewer`
- no reviewer repository
- no reviewer migration
- no subprocess management beyond diff validation and smoke-test helpers

The current repo has reviewer **vocabulary** (`ReviewerStatusSchema`) but not reviewer **behavior**.

### Natural seams / likely task boundaries

#### Seam 1 — Shared reviewer contract freeze
Files:
- `packages/review-broker-core/src/domain.ts`
- `packages/review-broker-core/src/contracts.ts`
- `packages/review-broker-core/src/index.ts`
- `packages/review-broker-core/test/contracts.test.ts`

Deliverables:
- reviewer record schema(s)
- `listReviewers`, `spawnReviewer`, `killReviewer` request/response schemas
- reviewer audit event vocabulary if exposed through shared activity/audit surfaces

Why first:
- everything else depends on payload shape
- current repo has only the status enum, so contract drift is otherwise guaranteed

#### Seam 2 — Durable reviewer persistence
Files:
- `packages/review-broker-server/src/db/migrations/003_*.sql`
- `packages/review-broker-server/src/db/reviewers-repository.ts` (new)
- `packages/review-broker-server/src/runtime/app-context.ts`
- `packages/review-broker-server/src/index.ts` exports
- `packages/review-broker-server/test/sqlite-bootstrap.test.ts`

Recommended design:
- add a `reviewers` table for process lifecycle state (`reviewer_id`, launch metadata, pid, spawned_at, exited_at, exit_code, signal, last_seen_at/updated_at, etc.)
- **do not duplicate assignment state** if it can be derived from `reviews.claimed_by`

Why this is the clean seam:
- `claimedBy` already exists on reviews and is durable
- duplicating `assigned_review_id` in a second table invites drift unless there is a real pre-claim assignment concept
- current `ReviewerStatus` values can be derived at read time:
  - `offline` = reviewer row marked exited/dead
  - `assigned` = reviewer alive + matching active review claim
  - `idle` = reviewer alive + no active review claim

#### Seam 3 — Reviewer process manager / lifecycle watcher
Likely new files:
- `packages/review-broker-server/src/runtime/reviewer-manager.ts` (recommended new module)
- possibly `packages/review-broker-server/src/runtime/reviewer-recovery.ts` if recovery becomes substantial

Why a new module is strongly preferred:
- `broker-service.ts` is already 1127 lines
- reviewer subprocess logic needs its own state, listeners, and cleanup discipline
- following the `best-practices` skill, this code must avoid leaked listeners/process handles and clean up resources deterministically

Recommended responsibilities:
- spawn real local reviewer process
- persist reviewer row at launch
- watch exit/close/error events
- mark reviewer offline with durable metadata on exit
- expose kill operation with signal/result metadata
- provide startup reconciliation hook for stale reviewer rows
- provide shutdown cleanup from `startBroker().close()`

Testing note:
- use a **plain Node `.mjs` fixture process** for spawned reviewers rather than a TypeScript fixture that requires `tsx` at runtime
- that keeps reviewer-process tests closer to real production execution and avoids extra toolchain coupling

#### Seam 4 — Service methods + recovery integration
Files:
- `packages/review-broker-server/src/runtime/broker-service.ts`
- `packages/review-broker-server/src/index.ts`
- new server tests for reviewer lifecycle/recovery

Additive methods likely needed on `BrokerService`:
- `listReviewers`
- `spawnReviewer`
- `killReviewer`

Recovery integration should use existing review semantics, not invent a second state machine.

## Key Findings

### 1. The review side already contains the recovery primitive S03 should reuse

`claimReview()` / `reclaimReview()` already use `expectedClaimGeneration` CAS updates and durable stale rejection audit rows. The concurrency proof in `packages/review-broker-server/test/claim-concurrency.test.ts:29` is the strongest existing pattern in the repo for S03.

**Implication:** reviewer-exit recovery should reclaim with the same `claim_generation` fence rather than raw unconditional updates.

### 2. The right recovery target is narrower than “all claimedBy rows”

Based on the current S02 lifecycle implementation:
- `claimed` and `submitted` are the risky limbo states that truly depend on a live reviewer
- `changes_requested` is waiting on the proposer; proposer follow-up already clears the claim and requeues
- `approved` can still be closed without a live child process because `closeReview()` does not depend on process liveness
- `closed` obviously should not be recovered

**Recommendation:** on reviewer death/startup recovery, reclaim only reviews in `claimed` or `submitted` unless later parity evidence shows the old broker reclaimed more aggressively.

### 3. Reviewer lifecycle can reuse the existing audit table

`audit_events.review_id` is nullable in `001_init.sql`. That means S03 can keep a single durable audit store:
- reviewer-global events with `review_id = NULL`
- per-review recovery events with `review_id = <reviewId>`

This is much simpler than inventing a second reviewer-event table.

### 4. Per-review failure visibility should stay on the existing review activity surface

If a reviewer exits while owning a live review, operators need that visible from the review itself.

Best fit:
- append `review.reclaimed` (or another explicitly chosen review event) with metadata like:
  - `reason: "reviewer_exit" | "startup_recovery" | "operator_kill"`
  - `reviewerId`
  - `pid`
  - `exitCode` / `signal`
- keep reviewer-global lifecycle rows as separate reviewer audit events

This preserves the S02 pattern that `getActivityFeed()` is the place to understand why a review moved.

### 5. The notification bus is already flexible enough

`VersionedNotificationBus` accepts arbitrary string topics, not only the fixed enum. S03 can add reviewer-related topics such as reviewer list/status invalidation without changing bus internals.

### 6. There is an unused config seam available if needed

`resolveBrokerPaths()` and the CLI already surface `.gsd/review-broker/config.json`, but nothing reads it yet.

**Recommendation:** do not make config parsing the first blocker. S03 can prove reviewer lifecycle with explicit spawn inputs first. If defaults are needed, this config path is the clean existing seam.

### 7. `startBroker().close()` is a real design pressure point

Today `StartedBrokerRuntime.close()` is synchronous and only cleans up DB + signal handlers. Once child reviewers exist, S03 must define whether shutdown is:
- synchronous best-effort kill, or
- async graceful stop with waiting

Planner should expect this to be a real implementation choice, not just wiring.

## Don’t Hand-Roll

- **Do not create a second visibility system** for reviewer anomalies if `audit_events` + `getActivityFeed()` + `inspectBrokerRuntime()` can carry the story.
- **Do not duplicate assignment state** in a second table unless S03 introduces a real concept of assignment before claim.
- **Do not bake reviewer spawning directly into `broker-service.ts`**; isolate process management so recovery and cleanup remain testable.
- **Do not weaken S02 claim semantics** by making untracked claimant IDs invalid. Reviewer lifecycle should be additive in S03.

## Suggested task order

1. **Freeze reviewer contract and event vocabulary in core**
   - smallest surface area
   - unblocks all other slices of work
2. **Add migration + repository for reviewer rows**
   - makes runtime work durable and restart-testable
3. **Build reviewer manager with real process fixture and exit observation**
   - highest risk implementation step
4. **Wire broker service spawn/list/kill + recovery hooks**
   - use repo + manager together
5. **Extend diagnostics / smoke output**
   - prove operator-facing inspectability for R010
6. **Run restart/recovery proof last**
   - this is the assembled slice proof, not the first coding step

## Verification Strategy

Following the `test` skill guidance, S03 verification should match the repo’s existing Vitest style and prove real behavior, not just type-checking.

### Contract verification
Run shared core contract tests after reviewer schemas are added:

```bash
corepack pnpm exec vitest run packages/review-broker-core/test/contracts.test.ts
```

Likely additions:
- reviewer request/response schema parsing
- reviewer record/status shape
- reviewer audit vocabulary if shared

### Persistence verification
Extend SQLite bootstrap tests:

```bash
corepack pnpm exec vitest run packages/review-broker-server/test/sqlite-bootstrap.test.ts
```

Expected proof:
- new migration recorded (likely `003_*`)
- `reviewers` table exists
- reviewer indexes exist if added
- reviewer rows and reviewer/global audit rows survive reopen

### Runtime/service verification
Add at least one dedicated reviewer lifecycle test file, then run it with existing core server tests:

```bash
corepack pnpm exec vitest run \
  packages/review-broker-server/test/broker-service.test.ts \
  packages/review-broker-server/test/claim-concurrency.test.ts \
  packages/review-broker-server/test/reviewer-lifecycle.test.ts \
  packages/review-broker-server/test/reviewer-recovery.test.ts
```

Expected proof:
- spawn returns durable reviewer state with real PID / launch metadata
- list reflects idle → assigned → offline transitions
- kill updates durable state and terminates the real child
- reviewer exit while owning a live review causes durable recovery + inspectable audit trail
- stale recovery cannot overwrite a newer claim because CAS fencing still works

### Restart / stale-session recovery verification
Extend restart persistence proof with reviewer rows and dead-reviewer recovery:

```bash
corepack pnpm exec vitest run packages/review-broker-server/test/restart-persistence.test.ts
```

Expected proof:
- a fresh runtime reconciles stale reviewer rows on open
- live-limbo reviews are reclaimed from dead reviewers
- reviewer failure metadata remains inspectable after restart

### Real runtime / CLI smoke verification
Extend the existing smoke path rather than inventing a new one:

```bash
corepack pnpm exec vitest run packages/review-broker-server/test/start-broker.smoke.test.ts
corepack pnpm --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s03-smoke.sqlite --once
```

Expected once-complete diagnostics to grow with reviewer visibility, e.g.:
- reviewer count
- reviewer status counts
- latest reviewer snapshot or latest reviewer-related audit snapshot
- still no secret-bearing command/env payloads in output

## Risks / planner cautions

- **Big-file risk:** `broker-service.ts` is already large; reviewer lifecycle should not become another 300-line inline branch pile.
- **Shutdown risk:** child processes make runtime teardown materially more complex.
- **Contract drift risk:** only reviewer status enum exists today; payloads must be frozen before service work.
- **Recovery semantics risk:** reclaiming the wrong statuses would silently alter S02 behavior.
- **Observability risk:** if reviewer failures are only logged to console, S03 misses R010 even if spawn/kill technically work.
- **Redaction risk:** reviewer command/config diagnostics must not dump sensitive env vars or full secret-bearing argv strings.

## Skill notes that affect implementation

- From **`test`**: match the project’s existing Vitest + temp-dir + real-runtime style; do not invent a new test style.
- From **`debug-like-expert`**: recovery behavior must be evidence-driven; prove reviewer-exit and stale-session cases explicitly instead of assuming they work.
- From **`best-practices`**: child-process orchestration must clean up listeners/resources and avoid leaked handles.
- From **`review`**: keep findings concrete and file-scoped; avoid style-only churn during implementation.

## Optional skill discovery

No new skill is required to complete S03, but these looked relevant if the executor wants extra specialist guidance:

- **Zod**: `npx skills add pproenca/dot-skills@zod`
  - discovered via `npx skills find "zod"`
  - highest directly relevant zod-specific result in the search output
- **Vitest**: `npx skills add onmax/nuxt-skills@vitest`
  - discovered via `npx skills find "vitest"`
  - highest-install vitest-specific result in the search output
- **SQLite**: `npx skills add martinholovsky/claude-skills-generator@sqlite-database-expert`
  - discovered via `npx skills find "sqlite"`
  - most directly relevant SQLite specialist result returned

## Bottom line

S03 is straightforward in architecture but high-risk in behavior: the repo already has the exact patterns needed for durable recovery, audit visibility, and runtime proof, but **none of the reviewer lifecycle implementation exists yet**. The clean path is:
- freeze reviewer contract in core,
- add one reviewer persistence seam,
- isolate subprocess management in a new runtime module,
- reuse `claim_generation` + review audit patterns for recovery,
- and prove the whole thing with real child processes plus restart-safe CLI smoke evidence.
