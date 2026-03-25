# S02 Research — Restart sweep and continuity commands

**Date:** 2026-03-23

## Summary

S02 is no longer a recovery-policy slice. The startup recovery policy already exists, already shares S01’s reclaim-vs-detach contract, and already runs before callers can begin new work. The key ordering is in `packages/review-broker-server/src/index.ts:117-120`, where `startBroker()` creates the context/service, runs `runStartupRecoverySweep()`, and only then returns the runtime. The sweep itself lives in `packages/review-broker-server/src/runtime/broker-service.ts:1135` and already marks stale reviewers offline with `startup_recovery`, reuses the same ownership recovery path as timeout/reviewer-exit recovery, and returns a typed `StartupRecoverySummary`.

The actual gap is operator surface coverage. Runtime-wide continuity inspection already exists in `packages/review-broker-server/src/runtime/status-service.ts:80` (`inspectRuntimeContinuity()`) and `packages/review-broker-server/src/index.ts:170` (`inspectBrokerRuntime()`), and CLI `--once` already emits that data from `packages/review-broker-server/src/cli/start-broker.ts:39-66`. But none of that is exposed through the broker operation registry in `packages/review-broker-core/src/operations.ts:63`, so typed-client/MCP consumers still only get per-review status/timeline plus generic list operations.

The generic list surfaces are too lossy for S02’s operator goals:
- `packages/review-broker-core/src/contracts.ts:72` defines `ReviewSummary` without `actionRequired`, `actionRequiredReason`, `recoveryReason`, or `reviewerSessionId`.
- `packages/review-broker-core/src/contracts.ts:245` / `:273` limit `listReviews` and `listReviewers` filters to generic status/limit semantics.
- `packages/review-broker-server/src/db/reviewers-repository.ts:126-129` derives only one `currentReviewId` per reviewer via `LIMIT 1`, so reviewer state alone cannot explain all attached/detached reviews.
- `packages/review-broker-server/src/db/audit-repository.ts:233` / `:290` only expose continuity history per review; there is no runtime-wide recent recovery feed.

I ran the current S02-adjacent verification lane:

`corepack pnpm exec vitest run packages/review-broker-core/test/continuity-contracts.test.ts packages/review-broker-server/test/startup-sweep.test.ts packages/review-broker-server/test/recovery-status-surfaces.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts`

Observed result:
- `continuity-contracts.test.ts` ✅
- `startup-sweep.test.ts` ✅
- `recovery-status-surfaces.test.ts` ✅
- `restart-persistence.test.ts` ❌
- `start-broker.smoke.test.ts` ❌

The failures are stale expectations, not a missing startup sweep implementation:
- `packages/review-broker-server/test/restart-persistence.test.ts:95-103` still expects migrations to stop at `003_reviewer_lifecycle`, but the live schema already includes additive migration `004_review_continuity`.
- `packages/review-broker-server/test/restart-persistence.test.ts:163-330` still expects startup recovery to reclaim submitted/open work; live code now detaches ambiguous submitted work and marks it action-required, consistent with S01 and the milestone constraints.
- `packages/review-broker-server/test/start-broker.smoke.test.ts:44-62`, `:92-119`, and `:172-218` still expect pre-S01 startup summary/once output: 3 migrations, no detached/action-required counts, and no runtime continuity snapshot fields.

Requirement targeting for S02 stays the same as the roadmap/context: **supports R012 directly** and **strengthens R003, R005, and R010** by making restart cleanup inspectable through supported broker surfaces rather than raw SQLite reads.

## Recommendation

Treat the recovery policy as locked.

Do **not** change `recoverReviewOwnershipState()` in `packages/review-broker-server/src/runtime/broker-service.ts:1257` or introduce a startup-specific policy fork. The milestone/user constraints are already encoded correctly:
- safe `claimed` work reclaims
- ambiguous open/submitted work detaches
- timeout, reviewer-exit, and startup recovery share the same semantics

Recommended execution order:

1. **Repair the red baseline first.**
   Update `restart-persistence.test.ts` and `start-broker.smoke.test.ts` to the S01 contract before adding any new surface area. Right now the slice verification lane is noisy for the wrong reasons.

2. **Add one additive runtime-wide continuity surface.**
   The lightest seam is to wrap existing status/read-model helpers instead of inventing new recovery logic:
   - reuse `inspectRuntimeContinuity()` / `inspectBrokerRuntime()` for current ownership + action-required visibility
   - keep per-review recovery history on existing `getReviewTimeline()`
   - expose the runtime-wide continuity view through the broker service + core operation registry if S02 wants typed-client/MCP parity, not just CLI `--once`

3. **Only add runtime-wide recent recovery history if the planner decides the milestone wording needs it explicitly.**
   If so, extend `AuditRepository` with a cross-review continuity query; do not scrape raw SQL from CLI code.

4. **Keep CLI work thin.**
   `start-broker.ts --once` already opens the runtime, runs startup sweep, and emits structured JSON. Prefer a narrow continuity/status wrapper or additive flag/subcommand over a second ad hoc DB-inspection path.

## Skill Discovery

Relevant installed skills:
- `test` — best fit once implementation begins, because S02 is mostly contract/integration verification work.
- `debug-like-expert` — good escalation path if startup-order or stale-session behavior flakes during restart proofing.

No directly installed SQLite/Vitest specialty skill was present. Promising external skills I found (not installed):
- `npx skills add martinholovsky/claude-skills-generator@sqlite-database-expert` — 703 installs
- `npx skills add onmax/nuxt-skills@vitest` — 902 installs

I would use the loaded `test` skill principles here: keep tests narrow, mirror the existing broker-service/CLI parity style, and add focused verification around the new continuity surface instead of expanding the end-to-end proof first.

## Implementation Landscape

### Recovery and ordering seams that already exist

- `packages/review-broker-server/src/index.ts:117-120`
  - `startBroker()` already runs `runStartupRecoverySweep()` before returning the runtime.
- `packages/review-broker-server/src/runtime/broker-service.ts:1135`
  - `runStartupRecoverySweep()` is already real, additive, and typed.
- `packages/review-broker-server/src/runtime/broker-service.ts:1232`
  - `listRecoverableContinuityStates()` centralizes which reviews are even candidates for recovery.
- `packages/review-broker-server/src/runtime/broker-service.ts:1257`
  - `recoverReviewOwnershipState()` is the shared reclaim/detach policy seam. This is the place to preserve, not redesign, semantics.
- `packages/review-broker-server/src/runtime/status-service.ts:47`, `:63`, `:80`
  - per-review continuity status, per-review continuity timeline, and runtime-wide continuity inspection already exist as read models.
- `packages/review-broker-server/src/index.ts:170`
  - `inspectBrokerRuntime()` already adds runtime continuity fields on top of the broader broker snapshot.
- `packages/review-broker-server/src/cli/start-broker.ts:39-66`
  - `--once` already emits `startupRecovery`, `recoveryReviewCount`, `actionRequiredReviewIds`, `latestRecovery`, and `recoveryReviews`.

### Gaps S02 still needs to close

- `packages/review-broker-core/src/operations.ts:63`
  - broker registry still stops at per-review + generic list operations. There is no runtime-wide continuity/status operation.
- `packages/review-broker-core/src/contracts.ts:72`, `:245`, `:273`
  - generic list contracts cannot answer “what needs operator action now?” without client-side stitching.
- `packages/review-broker-server/src/db/reviewers-repository.ts:126-129`
  - reviewer state only exposes one `currentReviewId`; not enough for ownership inspection if one reviewer/session touched multiple reviews.
- `packages/review-broker-server/src/db/audit-repository.ts:233`, `:290`
  - continuity history is queryable only per review. A runtime-wide “recent recovery actions” command would need a new repository seam.
- `packages/review-broker-server/src/cli/`
  - only `start-broker.ts` and `start-mcp.ts` exist today. There is no dedicated continuity/status CLI entry.

### Natural task seams

#### 1. Fix stale S01-pre-S02 expectations
Files:
- `packages/review-broker-server/test/restart-persistence.test.ts`
- `packages/review-broker-server/test/start-broker.smoke.test.ts`

What changes:
- expect migration `004_review_continuity`
- expect submitted/open work to detach on startup recovery, not reclaim
- expect `StartupRecoverySummary` counts/lists and `--once` runtime continuity fields already shipped in S01

This should happen first because it restores signal in the slice verification lane.

#### 2. Add runtime-wide continuity contract surface
Files:
- `packages/review-broker-core/src/contracts.ts`
- `packages/review-broker-core/src/operations.ts`
- `packages/review-broker-core/src/index.ts`
- checked-in mirrors: `packages/review-broker-core/src/*.js`
- exported artifacts: `packages/review-broker-core/dist/*`

What changes:
- add request/response schemas for a runtime-wide continuity/status command if the planner wants broker-service + typed-client + MCP parity
- keep it additive; do not overload `ReviewSummary` or generic list responses with continuity-only fields

#### 3. Server read model / service exposure
Files:
- `packages/review-broker-server/src/runtime/status-service.ts`
- `packages/review-broker-server/src/runtime/broker-service.ts`
- `packages/review-broker-server/src/index.ts`

What changes:
- thin service wrapper over existing runtime continuity inspection
- optionally carry startup recovery summary through the same operator-facing surface
- preserve the existing per-review `getReviewStatus` / `getReviewTimeline` contract

#### 4. Audit/history expansion only if needed
Files:
- `packages/review-broker-server/src/db/audit-repository.ts`
- possibly a new additive SQL migration in `packages/review-broker-server/src/db/migrations/`

What changes:
- only if S02 explicitly wants cross-review recent recovery history rather than just current ownership/action-required visibility
- if a global continuity query is added and needs indexing, do it via a new additive migration, not by rewriting old SQL

#### 5. CLI/packaging
Files:
- `packages/review-broker-server/src/cli/start-broker.ts` and/or a new CLI file
- `packages/review-broker-server/package.json`
- root `package.json` if a convenience rerun script is warranted

What changes:
- expose the new continuity/status surface without bypassing the broker runtime
- keep the CLI output JSON and broker-first, matching the existing `--once` style

## Risks / Surprises

- The biggest surprise is that the code is ahead of some tests. S01 already landed additive continuity migration/state/output, but `restart-persistence.test.ts` and `start-broker.smoke.test.ts` still encode the older contract.
- If S02 adds a runtime-wide recent-events command, avoid writing direct raw-SQL CLI logic. The established pattern is repository/query helper → read model/service → CLI/MCP/typed surface.
- Any `review-broker-core` contract change must be mirrored into checked-in `packages/review-broker-core/src/*.js` and rebuilt into `dist/`; otherwise Vitest/tsx can validate against stale generated JS.
- If a new global continuity-history query becomes hot enough to care about indexing, add a new migration (likely `005_*`) rather than rewriting `001_init.sql` or `004_review_continuity.sql`.

## Verification

Use this order so failures stay attributable:

1. **Baseline repair**
   - `corepack pnpm exec vitest run packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts`

2. **Existing continuity/order proof still green**
   - `corepack pnpm exec vitest run packages/review-broker-core/test/continuity-contracts.test.ts packages/review-broker-server/test/startup-sweep.test.ts packages/review-broker-server/test/recovery-status-surfaces.test.ts`

3. **New runtime-wide continuity surface**
   - add a focused Vitest file for the new command/op
   - if the new surface enters the broker operation registry, also extend `packages/review-broker-server/test/client-mcp-parity.test.ts`

4. **Artifact sync**
   - regenerate `packages/review-broker-core/src/*.js` mirrors
   - run `corepack pnpm build`

5. **CLI proof**
   - `corepack pnpm --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path /absolute/path/to/s02-inspect.sqlite --once`
   - if S02 adds a new continuity CLI command, prove it against the same durable SQLite file

Use an **absolute** `--db-path` for package-scoped `pnpm --filter review-broker-server exec tsx ... --once` commands; relative paths resolve from the package directory, which is easy to misread during restart/smoke verification.
