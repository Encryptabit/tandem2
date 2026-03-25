# S03 UAT — Blocked-review policy and gate continuity

## UAT Type
- UAT mode: focused local workflow/runtime verification on the restored in-worktree `src/resources/extensions/gsd` substrate

## Preconditions
1. Run from this worktree root.
2. Node supports `--experimental-strip-types`.
3. The restored local substrate exists:
   - `src/resources/extensions/gsd/auto-loop.ts`
   - `src/resources/extensions/gsd/review/gate.ts`
   - `src/resources/extensions/gsd/review/pause-state.ts`
   - `src/resources/extensions/gsd/commands/handlers/review.ts`
   - `src/resources/extensions/gsd/tests/resolve-ts.mjs`
4. `.gsd/milestones/M002/slices/S03/S03-SOURCE-HANDOFF.md` is present so the restored local substrate can be audited for drift.
5. Use only relative in-worktree paths; do not point the commands at an external `gsd-2` checkout.

## Test Case 1 — Source-handoff substrate exists locally and is the active execution baseline
**Goal:** prove S03 can execute inside this tandem worktree without depending on an external source tree.

Steps:
1. Run:
   `test -f src/resources/extensions/gsd/auto-loop.ts && test -f src/resources/extensions/gsd/review/gate.ts && test -f src/resources/extensions/gsd/commands/handlers/review.ts && test -f src/resources/extensions/gsd/tests/resolve-ts.mjs && test -f src/resources/extensions/gsd/tests/auto-loop.test.ts`
2. Open `.gsd/milestones/M002/slices/S03/S03-SOURCE-HANDOFF.md`.
3. Confirm the manifest includes checksums for the restored runtime and test files.

Expected outcomes:
- the command exits 0
- the local `src/resources/extensions/gsd` subtree is present in this worktree
- the source-handoff manifest documents provenance and checksum-based drift detection
- no external absolute path is required to execute the slice

## Test Case 2 — Review gate reuses the active review and resolves blocked policy by mode
**Goal:** prove blocked-review policy and waiting continuity are owned by the review gate, not re-derived later.

Steps:
1. Run:
   `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-preferences.test.ts ./src/resources/extensions/gsd/tests/auto-review-gate.test.ts`
2. Confirm the following test cases pass:
   - `reuses same-unit review id before submitting again`
   - `waiting reviews keep review identity visible on session state`
   - `blocked-policy resolution stays mode-aware`
   - `mode-default resolves to auto-loop for auto mode`
   - `mode-default resolves to intervene for human mode`
   - `explicit blocked policy wins over mode defaults`

Expected outcomes:
- all 6 tests pass
- a pending/waiting/blocked review for the same unit refreshes status instead of submitting again
- waiting state preserves the active `reviewId`
- auto mode defaults to `auto-loop`
- human mode defaults to `intervene`
- explicit preferences still override the mode default

## Test Case 3 — Blocked auto reviews retry the same unit and do not silently progress
**Goal:** prove the finalize seam treats broker review as real control flow.

Steps:
1. Run:
   `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/auto-loop.test.ts`
2. Confirm the following cases pass:
   - `retry prompt framing stays truthful for verification failures vs broker review feedback`
   - `allow outcome progresses through post-verification seam and clears stale retry context`
   - `blocked auto-loop retries the same unit without pausing or post-verification fallthrough`
   - `blocked intervene pauses visibly without retry injection or post-verification fallthrough`
   - `waiting pauses visibly without retry injection or post-verification fallthrough`
   - `broker errors pause visibly without retry injection or post-verification fallthrough`

Expected outcomes:
- all 6 tests pass
- blocked auto-mode review uses `retry-unit` on the same unit
- `pauseAuto()` is not called for the blocked auto-loop branch
- `postUnitPostVerification()` is not called for blocked/wait/error branches
- reviewer feedback is framed as review feedback, not as a verification failure
- `pendingVerificationRetry` is only populated for the blocked auto-loop case

## Test Case 4 — Observability surfaces expose blocked-review auto-loop state clearly
**Goal:** prove the inspectable state surfaces called out in the plan actually show the blocked-review branch.

Steps:
1. Run this probe:
   ```sh
   node --experimental-strip-types --input-type=module <<'EOF'
   import { finalizeReviewForUnit } from './src/resources/extensions/gsd/auto-loop.ts';
   import { createAutoSession } from './src/resources/extensions/gsd/auto/session.ts';

   const session = createAutoSession();
   const outcome = await finalizeReviewForUnit({
     session,
     unit: { unitId: 'M002-S03-UAT' },
     mode: 'auto',
     transport: {
       async submitReview() {
         return {
           reviewId: 'rev-uat-block',
           status: 'blocked',
           summary: 'Needs changes.',
           feedback: 'Add continuity details.'
         };
       },
       async getStatus() { throw new Error('not used'); }
     }
   });

   console.log(JSON.stringify({
     action: outcome.action,
     paused: session.paused,
     pendingRetry: session.pendingVerificationRetry,
     history: session.history,
     reviewGateState: session.reviewGateState
   }, null, 2));
   EOF
   ```
2. Inspect the JSON output.

Expected outcomes:
- `action` is `retry-unit`
- `paused` is `false`
- `pendingRetry.source` is `review`
- `pendingRetry.reviewId` is `rev-uat-block`
- `history` ends with `review-blocked:auto-loop:rev-uat-block:...`
- `reviewGateState.reviewId` and `reviewGateState.blockedPolicy` remain visible

## Test Case 5 — Paused review state persists through `paused-session.json` and manual status can recover it
**Goal:** prove the same review-state model survives pause/restart and is reused by `/gsd review-status`.

Steps:
1. Run:
   `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-status-command.test.ts ./src/resources/extensions/gsd/tests/review-pause-state.test.ts`
2. Confirm the following cases pass:
   - `paused review serialization keeps only inspectable fields`
   - `paused review deserialization tolerates missing payloads and restores normalized state`
   - `pauseAuto persists review metadata and startAuto restores reviewGateState from paused-session.json`
   - `formats live review state without falling back to paused state`
   - `falls back to paused review state when no live state exists`
   - `falls back to paused review state when no live state exists and refreshes through the shared runtime path`
   - `returns review_state_missing when no live or paused state exists`

Expected outcomes:
- all 7 tests pass
- `paused-session.json` stores `pausedReviewState.schemaVersion` and `savedAt`
- persisted review metadata is sanitized and does not include raw patch/diff content
- `startAuto()` rehydrates `AutoSession.reviewGateState` from disk
- `/gsd review-status` can render paused state after the live session is gone
- when a paused `reviewId` is still pending, status refresh uses the shared runtime status path

## Test Case 6 — Concrete paused-state artifact inspection
**Goal:** inspect the actual on-disk pause artifact and the `/gsd review-status` fallback output together.

Steps:
1. Run this probe:
   ```sh
   node --experimental-strip-types --input-type=module <<'EOF'
   import { mkdtemp, readFile, rm } from 'node:fs/promises';
   import os from 'node:os';
   import path from 'node:path';
   import { setAutoSession, pauseAuto } from './src/resources/extensions/gsd/auto.ts';
   import { createAutoSession } from './src/resources/extensions/gsd/auto/session.ts';
   import { createReviewGateState } from './src/resources/extensions/gsd/review/types.ts';
   import { handleReviewStatus } from './src/resources/extensions/gsd/commands/handlers/review.ts';

   const tmp = await mkdtemp(path.join(os.tmpdir(), 's03-uat-'));
   setAutoSession(createAutoSession({
     reviewGateState: createReviewGateState({
       phase: 'waiting',
       unit: { unitId: 'M002-S03-UAT' },
       reviewId: 'rev-uat-paused',
       status: 'pending',
       decision: 'wait',
       blockedPolicy: 'auto-loop',
       summary: 'Pending pause.',
       error: { code: 'broker_unavailable', message: 'Broker unavailable.', retryable: true }
     })
   }));

   await pauseAuto(tmp, 'review-waiting');
   setAutoSession(null);

   const pausedJson = JSON.parse(await readFile(path.join(tmp, '.gsd', 'runtime', 'paused-session.json'), 'utf8'));
   const statusOutput = await handleReviewStatus({ projectRoot: tmp });
   console.log(JSON.stringify({ pausedJson, statusOutput }, null, 2));
   await rm(tmp, { recursive: true, force: true });
   EOF
   ```
2. Inspect the JSON output.

Expected outcomes:
- `pausedJson.reason` is `review-waiting`
- `pausedJson.pausedReviewState.schemaVersion` is `1`
- `pausedJson.pausedReviewState.savedAt` is present
- `pausedJson.pausedReviewState.reviewGateState.reviewId` is `rev-uat-paused`
- `statusOutput` reports `source: paused`
- `statusOutput` includes `reviewId: rev-uat-paused`, `status: pending`, `decision: wait`, and the sanitized broker error

## Test Case 7 — Full slice verification matrix passes as one assembled proof set
**Goal:** prove the slice is complete as an assembled unit, not just as isolated spot checks.

Steps:
1. Run the complete matrix in order:
   - `test -f src/resources/extensions/gsd/auto-loop.ts && test -f src/resources/extensions/gsd/review/gate.ts && test -f src/resources/extensions/gsd/commands/handlers/review.ts && test -f src/resources/extensions/gsd/tests/resolve-ts.mjs && test -f src/resources/extensions/gsd/tests/auto-loop.test.ts`
   - `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-preferences.test.ts ./src/resources/extensions/gsd/tests/auto-review-gate.test.ts`
   - `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/auto-loop.test.ts`
   - `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-status-command.test.ts ./src/resources/extensions/gsd/tests/review-pause-state.test.ts`
2. Record TAP output and exit codes.

Expected outcomes:
- all commands exit 0
- the gate, finalize seam, paused-state continuity, and manual status surfaces all pass together
- there is no silent progression on blocked/wait/error outcomes
- the local restored S03 substrate is mechanically verified end to end

## Edge Cases

### Edge Case A — Human-mode blocked reviews pause for intervention by default
Steps:
1. Re-run `auto-loop.test.ts`.
2. Inspect the `blocked intervene pauses visibly without retry injection or post-verification fallthrough` case.

Expected outcomes:
- blocked human-mode reviews pause
- no retry payload is injected
- `postUnitPostVerification()` is not called

### Edge Case B — Broker submit failure is visible and pause-worthy
Steps:
1. Re-run `auto-loop.test.ts`.
2. Inspect the `broker errors pause visibly without retry injection or post-verification fallthrough` case.

Expected outcomes:
- broker failure produces a `review-error` branch
- session state records the pause reason
- no retry payload is created for the error branch
- history records the sanitized broker error code

### Edge Case C — No live or paused review state returns an explicit missing-state signal
Steps:
1. Re-run `review-status-command.test.ts`.
2. Inspect the `returns review_state_missing when no live or paused state exists` case.

Expected outcomes:
- the command returns `review_state_missing`
- the system does not invent a second status cache or fake broker state

### Edge Case D — Legacy top-level paused review payload remains readable
Steps:
1. Re-run `review-pause-state.test.ts`.
2. Inspect the `paused review deserialization tolerates missing payloads and restores normalized state` case.

Expected outcomes:
- deserialization accepts the older top-level `reviewGateState` shape
- normalized review state is restored without requiring the new envelope
- backward compatibility is preserved for older paused-session files
