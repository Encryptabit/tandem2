# S01 Summary — Reviewer-exit and stale-claim recovery

## Outcome

S01 is **slice-complete**.

This closer pass re-ran every slice-level verification command from the plan, confirmed the continuity inspection surfaces work through supported broker APIs/CLI output, validated **R012**, and compressed the task work into one broker-first continuity record for downstream slices.

## What this slice actually delivered

### 1. A shared continuity contract in `review-broker-core`
S01 froze the vocabulary that later runtime and operator surfaces now share:
- recovery reasons such as `claim_timeout` and `reviewer_exit`
- recovery outcomes such as reclaim vs detach
- action-required reasons such as `detached_review`
- continuity-aware status, timeline, and startup-recovery payload shapes
- additive broker contracts that preserve existing response fields while extending them with continuity data

This matters because S02/S03 can now build on one canonical contract instead of inventing new recovery strings or ad hoc inspection payloads.

### 2. Durable SQLite continuity state and audit evidence in `review-broker-server`
S01 extended the durable SQLite model with the recovery fields the milestone needs:
- `reviewer_session_id`
- `recovery_reason`
- `action_required`
- `action_required_reason`
- existing `claim_generation` / `claimed_at` fencing carried through recovery
- canonical continuity snapshots persisted in `audit_events`

The key implementation choice was additive: the slice introduced `004_review_continuity.sql` instead of rewriting older migrations, so existing databases keep passing migration/checksum validation while gaining continuity state.

### 3. One conservative recovery policy path across timeout, reviewer exit, and startup sweep
The runtime now uses the same repository-backed reclaim/detach logic in all three continuity seams:
- **timed-out safe `claimed` work** is reclaimed back to `pending`
- **ambiguous opened/submitted work** is detached conservatively and left action-required instead of being silently advanced
- **stale or fenced races** are recorded durably as rejected recovery attempts instead of mutating the wrong row

The runtime also now persists reviewer session IDs on claims so the broker can explain which specific reviewer session owned work when timeout, exit, or startup recovery happens.

### 4. Recovery-aware broker inspection surfaces
S01 made continuity inspectable without raw SQLite reads through supported broker surfaces:
- `BrokerService.getReviewStatus({ reviewId })`
- `BrokerService.getReviewTimeline({ reviewId })`
- `inspectBrokerRuntime()`
- `start-broker.ts --once`
- root rerun entry: `corepack pnpm broker:continuity`

These surfaces now expose ownership, latest recovery evidence, action-required state, runtime-wide recovery snapshots, and startup recovery summaries.

### 5. Real continuity proof on one durable SQLite database
This slice did not stop at unit helpers. It proved the assembled runtime with:
- real reviewer subprocesses
- real reviewer exit (`SIGKILL`) recovery
- claim-timeout recovery
- startup stale-session sweep
- reopen/reinspect against the same SQLite database
- CLI once inspection that matches persisted recovery state

The end-to-end proof shows the intended outcome clearly: after reviewer exit, one review is reclaimed safely, another is detached conservatively, and neither remains stranded in claimed/stale limbo.

## What patterns this slice established

### Additive continuity evolution
Continuity support was added without breaking the recognizable broker contract:
- core contracts stayed additive
- `getReviewStatus` kept the existing `review` summary and attached continuity fields around it
- `getReviewTimeline` became the explicit continuity-history surface instead of overloading status
- runtime-wide inspection reused `inspectBrokerRuntime()` / `--once` instead of creating a separate operator-only path

### Durable evidence over log-only explanation
Recovery evidence now lives in SQLite and broker surfaces, not just logs. The durable explanation model is:
- current ownership/action-required state on `reviews`
- canonical recovery history in `audit_events`
- runtime/CLI summary views assembled from those persisted facts

### Reuse one reclaim/detach rule everywhere
Timeout recovery, reviewer-exit recovery, and startup sweep now share one conservative policy. S02 should extend this policy, not fork it.

## Verification status

All slice-plan verification commands passed in the closer pass:

1. `corepack pnpm exec vitest run packages/review-broker-core/test/continuity-contracts.test.ts packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/recovery-transitions.test.ts`
2. `corepack pnpm exec vitest run packages/review-broker-server/test/claim-timeout-recovery.test.ts packages/review-broker-server/test/reviewer-exit-recovery.test.ts packages/review-broker-server/test/startup-sweep.test.ts packages/review-broker-server/test/recovery-status-surfaces.test.ts`
3. `corepack pnpm exec vitest run packages/review-broker-server/test/end-to-end-continuity-proof.test.ts`
4. `corepack pnpm broker:continuity`
5. `corepack pnpm --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/m003-s01-inspect.sqlite --once`

Observed closer-pass result:
- all Vitest suites passed
- `broker:continuity` passed
- `start-broker.ts --once` emitted the structured startup/runtime snapshot successfully

## Observability / diagnostics confirmed

The slice plan’s diagnostic surfaces are now real and working:
- durable `review.reclaimed`, `review.detached`, `review.transition_rejected`, and `reviewer.offline` evidence exists in continuity timelines/status snapshots
- `inspectBrokerRuntime()` now reports `recoveryReviewCount`, `actionRequiredReviewIds`, `latestRecovery`, and `recoveryReviews`
- CLI `--once` output includes `startupRecovery`, migration IDs, and runtime recovery snapshots

The fresh-DB closer pass for `--once` showed:
- migrations `001_init`, `002_review_lifecycle_parity`, `003_reviewer_lifecycle`, `004_review_continuity`
- zero recovery counts on a clean inspection DB
- structured JSON output suitable for later continuity commands and operator inspection work

## Requirement impact

- **R012:** validated in this slice
- **R003:** strengthened with additive continuity migration, transactional reclaim/detach persistence, and durable restart-safe evidence
- **R005:** strengthened with broker-owned reviewer-session-aware recovery and live reviewer-exit supervision
- **R010:** strengthened with durable status/timeline/runtime/CLI continuity inspection surfaces

## Decisions and gotchas future slices should preserve

1. **Do not rewrite old SQLite migrations** just to add continuity fields; keep using additive migrations against live databases.
2. **Do not invent a second recovery policy** in S02/S03; timeout, reviewer-exit, and startup recovery should keep sharing the same reclaim/detach semantics.
3. **Prefer supported broker surfaces over raw DB reads** for acceptance and debugging. Status, timeline, runtime inspection, and CLI once are now the intended inspection path.
4. **Regenerate checked-in `src/*.js` mirrors and exported `dist/` artifacts** after TypeScript contract changes, or Vitest/tsx can validate against stale JS.
5. **Use `AppContext.close()` to simulate a crash** when you want startup sweep behavior instead of graceful reviewer-offline behavior.
6. **Use an absolute `--db-path`** with `pnpm --filter review-broker-server exec tsx ... --once` when you care about repo-root temp locations; relative paths resolve from the package directory.

## What S02 should know

S02 should treat S01 as the continuity substrate, not as a prototype:
- the reclaim/detach rules and `claim_generation` fencing are now the canonical ownership contract
- `startupRecovery` already exists and should be extended, not replaced
- operator inspection should keep flowing through broker-owned status/timeline/runtime/CLI surfaces
- action-required detached reviews are intentional and should remain explicit rather than being auto-healed aggressively

In short: S01 removed the risky limbo states and made them inspectable. S02 should widen the continuity command/operator story around the same durable state model instead of redesigning recovery semantics.
