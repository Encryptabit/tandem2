# S05 UAT: End-to-end standalone parity proof

S05 does not require human UI acceptance, so this UAT is a **mechanical acceptance checklist** for the final assembled standalone broker proof. It verifies that one persisted SQLite database survives typed-client mutations, restart, real stdio MCP access, standalone inspection, and startup recovery without cross-surface drift or redaction failures.

## Preconditions
- Working directory: `/home/cari/repos/tandem2/.gsd/worktrees/M001`
- Dependencies are installed for this worktree.
- `corepack`, `tsx`, and the workspace Vitest toolchain are available.
- Remove stale smoke DBs before starting:
  - `rm -f packages/review-broker-server/.tmp/s01-smoke.sqlite*`
- Confirm these files exist before starting:
  - `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts`
  - `packages/review-broker-server/src/cli/start-broker.ts`
  - `packages/review-broker-server/src/cli/start-mcp.ts`
  - `packages/review-broker-client/src/index.ts`
  - `package.json`

---

## Test Case 1 — Full slice verification contract

**Goal:** Prove the exact slice-level verification commands from the plan all pass.

### Steps
1. Run:
   - `./node_modules/.bin/vitest run packages/review-broker-server/test/end-to-end-standalone-parity.test.ts`
2. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:parity`
3. Run:
   - `./node_modules/.bin/vitest run packages/review-broker-server/test/client-mcp-parity.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts packages/review-broker-client/test/in-process-client.test.ts packages/review-broker-server/test/mcp-server.test.ts`
4. Run:
   - `./node_modules/.bin/vitest run packages/review-broker-server/test/mcp-server.test.ts --testNamePattern "structured tool failures"`
5. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:smoke`

### Expected outcome
- All five commands exit `0`.
- Step 1 reports **1 passed file** and **2 passed tests**.
- Step 2 runs the same acceptance file successfully through the root script.
- Step 3 reports **5 passed files** and **12 passed tests**.
- Step 4 reports **1 passed test** and **3 skipped** sibling tests.
- Step 5 emits `broker.started` and `broker.once_complete` JSON containing:
  - `migrations: ["001_init", "002_review_lifecycle_parity", "003_reviewer_lifecycle"]`
  - `migrationCount: 3`
  - `reviewCount: 0`
  - `reviewerCount: 0`
  - `startupRecovery.recoveredReviewerIds: []`

### Failure signals to inspect
- the new parity harness failing in either the lifecycle or recovery scenario
- `broker:parity` not matching the intended acceptance file
- MCP diagnostics regressing after the end-to-end proof landed
- smoke output missing structured startup/recovery fields

---

## Test Case 2 — Restart-safe lifecycle parity across typed client, MCP, typed reopen, and standalone inspection

**Goal:** Confirm one persisted review lifecycle stays identical across all supported surfaces after restart.

### Steps
1. Run:
   - `./node_modules/.bin/vitest run packages/review-broker-server/test/end-to-end-standalone-parity.test.ts --testNamePattern "persists one review lifecycle across typed client restart, real stdio MCP reopen, typed reopen, and standalone inspection"`
2. Open `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts`.
3. Review the first test’s phase boundaries and assertions.

### Expected outcome
- The focused command exits `0`.
- The test proves this exact flow on one absolute temp SQLite file:
  1. typed client creates a review and moves it to `changes_requested`
  2. real stdio MCP reopens the same DB and reads the exact persisted status/proposal/discussion/activity payloads
  3. MCP continues the lifecycle through proposer follow-up, reviewer re-claim, `approved`, and `closed`
  4. typed client reopens and reads the same final review state and activity feed
  5. standalone `start-broker.ts --once` reports matching final counts and latest review/message/audit snapshots
- The first test’s final state includes:
  - review `status: "closed"`
  - `currentRound: 2`
  - `latestVerdict: "approved"`
  - `counterPatchStatus: "pending"`
  - 2 persisted discussion messages
  - 11 audit events
- Standalone `broker.started` and `broker.once_complete` JSON both include an empty `startupRecovery` snapshot for this already-clean DB.

### Failure signals to inspect
- typed-client and MCP payloads differing for the same review
- standalone `--once` counts not matching the runtime snapshot after typed/MCP work
- a restart reopening the DB but silently dropping discussion/activity state

---

## Test Case 3 — Startup recovery parity across standalone inspection, MCP, and typed-client reads

**Goal:** Confirm stale reviewer-owned work is reclaimed once, persisted durably, and then observed consistently through later surfaces.

### Steps
1. Run:
   - `./node_modules/.bin/vitest run packages/review-broker-server/test/end-to-end-standalone-parity.test.ts --testNamePattern "proves startup recovery parity across standalone inspection, real stdio MCP reopen, and typed-client reads"`
2. Open `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts`.
3. Review the second test’s seeding and post-reopen assertions.

### Expected outcome
- The focused command exits `0`.
- The test seeds one reviewer plus three reviews against one absolute temp SQLite file:
  - one `claimed` review
  - one `submitted` review with a persisted reviewer message
  - one `approved` review
- The first standalone `start-broker.ts --once` reopen reports a non-empty `startupRecovery` snapshot showing:
  - `recoveredReviewerIds` contains the seeded reviewer
  - `reclaimedReviewIds` contains the claimed and submitted review IDs
  - `staleReviewIds` is empty
  - `unrecoverableReviewIds` is empty
- The completed standalone snapshot shows:
  - 3 total reviews
  - 1 reviewer row
  - reviewer status counts `{ offline: 1 }`
  - review status counts `{ approved: 1, pending: 2 }`
  - reviewer `offlineReason: "startup_recovery"`
- MCP reopen and typed-client reopen then read the persisted recovered state:
  - the claimed and submitted reviews are both `pending`
  - both reclaimed reviews have `claimGeneration: 2`
  - the approved review remains `approved`
  - activity feeds end with `review.reclaimed` for the reclaimed reviews and still show `review.approved` for the unaffected review
- Later MCP/typed reopens do **not** expect `startupRecovery` to run again; they validate the durable rows instead.

### Failure signals to inspect
- recovery reclaiming an already approved review
- review rows updating but reviewer row not going offline
- later reopens incorrectly depending on recovery to execute a second time

---

## Test Case 4 — Redaction-safe diagnostics survive the final assembled proof

**Goal:** Confirm the final parity harness proves patch-body redaction on real operational surfaces.

### Steps
1. Run:
   - `./node_modules/.bin/vitest run packages/review-broker-server/test/end-to-end-standalone-parity.test.ts`
2. Open `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts` and find the sentinel strings:
   - `SECRET_PATCH_BODY_SHOULD_NOT_APPEAR_END_TO_END`
   - `SECRET_PATCH_BODY_SHOULD_NOT_APPEAR_STARTUP_RECOVERY`
3. Run:
   - `./node_modules/.bin/vitest run packages/review-broker-server/test/mcp-server.test.ts --testNamePattern "structured tool failures"`

### Expected outcome
- Both commands exit `0`.
- The end-to-end parity file proves each sentinel is injected into a diff body and then asserted absent from:
  - standalone CLI stdout
  - MCP stderr lines
- The focused MCP structured-failure run proves invalid tool dispatch still yields:
  - a structured tool error result
  - redacted `mcp.tool_failed` stderr diagnostics
  - no patch-body leakage

### Failure signals to inspect
- any sentinel appearing in CLI stdout or stderr diagnostics
- MCP failure diagnostics regressing to prose-only output
- stdout contamination during MCP startup or tool failure handling

---

## Test Case 5 — Root `broker:parity` remains the milestone closeout gate

**Goal:** Confirm the repo has one obvious root command for the final assembled proof.

### Steps
1. Open `package.json`.
2. Verify the `scripts` section contains:
   - `"broker:parity": "vitest run packages/review-broker-server/test/end-to-end-standalone-parity.test.ts"`
3. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:parity`

### Expected outcome
- File inspection shows the root script exists exactly once and points at the S05 acceptance file.
- The command exits `0`.
- The command output shows the two S05 end-to-end tests passing.

### Failure signals to inspect
- the root script pointing at a broader or different suite than the acceptance harness
- the acceptance file passing directly but failing through the root script due to path or runner drift

---

## Edge-case checklist

### Edge Case A — Fresh-db smoke path still stays clean after S05
- Covered by `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:smoke`
- Expected outcome:
  - `broker.started` and `broker.once_complete` both emit valid JSON
  - `startupRecovery` is empty on a fresh DB
  - migration list still includes `003_reviewer_lifecycle`

### Edge Case B — Recovery is a one-time mutation, not a repeated observation
- Covered by the second end-to-end test
- Expected outcome:
  - only the first standalone reopen reports non-empty `startupRecovery`
  - later MCP and typed-client reopens validate recovered persisted rows instead of triggering new recovery work

### Edge Case C — Reviewer recovery preserves unaffected approved work
- Covered by the second end-to-end test
- Expected outcome:
  - the approved review remains `approved`
  - its activity feed ends with `review.approved`, not `review.reclaimed`

### Edge Case D — Cross-surface proof uses one DB file, not hand-copied fixtures
- Covered by code inspection in `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts`
- Expected outcome:
  - each scenario creates one absolute temp SQLite path
  - typed client, MCP, and standalone CLI all reuse that same `dbPath`

---

## Acceptance decision
S05 is acceptable only if **all five test cases pass** and the edge-case expectations remain true. Any failure means M001 is still missing milestone-closeout proof that the standalone broker, persistence, reviewer recovery, typed client, MCP surface, and redaction-safe operational inspection converge on the same durable runtime state.
