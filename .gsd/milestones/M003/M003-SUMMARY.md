---
id: M003
title: Runtime hardening and continuity
status: complete
verification_verdict: pass
completed_on: 2026-03-23
validated_requirements:
  - R003
  - R010
  - R012
advanced_requirements:
  - R005
requirement_outcomes:
  - id: R003
    from_status: active
    to_status: validated
    proof: "M003 closeout re-ran the explicit five-test continuity Vitest lane, `corepack pnpm broker:continuity`, and direct absolute-path `start-broker.ts --once` / `inspect-continuity.ts` checks; together with the assembled end-to-end continuity proof, they verify one durable SQLite database stays coherent across live reviewer exit, broker crash via `AppContext.close()`, startup stale-session sweep, and idempotent post-restart inspection."
  - id: R010
    from_status: active
    to_status: validated
    proof: "M003 closeout re-verified `recovery-status-surfaces`, `continuity-cli`, the end-to-end continuity proof, `broker:continuity`, and direct CLI inspection, showing `getReviewStatus`, `getReviewTimeline`, runtime continuity snapshots, `inspect-continuity.ts`, and `start-broker.ts --once` all expose coherent, argv-safe recovery visibility after reviewer exit and broker restart."
  - id: R012
    from_status: active
    to_status: validated
    proof: "M003 closeout re-ran the five-test continuity lane and direct CLI checks, confirming timed-out claims are reclaimed safely, ambiguous exit/restart cases are detached and marked action-required, startup stale-session sweep clears stale ownership before normal use, and no review remains in unexplained claimed/stale limbo on the shipped broker surfaces."
---

# M003: Runtime hardening and continuity

## Outcome
M003 is complete and milestone verification is a clean **pass**. The milestone produced real non-`.gsd/` implementation work, not just planning artifacts: `git diff --stat HEAD $(git merge-base HEAD main) -- ':!.gsd/'` returned a non-empty diff covering 64 files across `packages/review-broker-core`, `packages/review-broker-server`, runtime/CLI code, and continuity-focused tests. Closeout verification also re-ran the final acceptance lanes successfully, so the milestone can be sealed as delivered.

## What shipped in this milestone
- A continuity-aware broker contract in `review-broker-core` covering reclaim/detach outcomes, recovery reasons, action-required state, and runtime continuity inspection payloads.
- Additive durable SQLite continuity state in `review-broker-server`, including `004_review_continuity.sql`, persisted reviewer-session ownership, recovery metadata, and audit evidence without rewriting older migrations.
- One conservative recovery policy reused across claim timeout, reviewer exit, and startup stale-session sweep: safe claimed work is reclaimed, ambiguous open/submitted work is detached and left explicit.
- Broker-owned continuity inspection surfaces across runtime, typed client/MCP parity, and CLI entrypoints, including `inspectRuntimeContinuity`, `inspect-continuity.ts`, and `start-broker.ts --once`.
- A canonical repo-level acceptance lane, `corepack pnpm broker:continuity`, plus the broadened end-to-end proof that exercises reviewer exit, broker crash via `AppContext.close()`, restart on the same SQLite file, and post-restart inspection.

## Success criteria verification

### 1. A real reviewer subprocess can exit while owning work and the broker leaves no review stranded in claimed/stale limbo
**Result:** met

**Evidence**
- Closeout re-ran `packages/review-broker-server/test/end-to-end-continuity-proof.test.ts`, which passed and explicitly proves a live reviewer exit plus later broker crash/restart remain coherent on one durable SQLite database.
- Closeout re-ran `packages/review-broker-server/test/continuity-cli.test.ts`, which passed and proves the assembled reviewer-exit plus startup-recovery story through shipped CLI surfaces.
- S01 and S03 slice summaries both describe the live reviewer-exit reclaim/detach behavior and confirm neither branch leaves work stranded in unexplained limbo.

### 2. Timed-out claims and dead-reviewer ownership are recovered conservatively: safe `claimed` work is reclaimed automatically, while ambiguous open attachments are detached and explained instead of being silently advanced
**Result:** met

**Evidence**
- Closeout re-ran `packages/review-broker-server/test/recovery-status-surfaces.test.ts` and `packages/review-broker-server/test/startup-sweep.test.ts`; both passed.
- The assembled end-to-end proof and `broker:continuity` acceptance lane passed, re-proving reclaim for safe claimed work and detach/action-required for ambiguous work.
- `R012` in `.gsd/REQUIREMENTS.md` now records validated evidence for timeout, reviewer-exit, and startup-sweep recovery without raw DB inspection.

### 3. A broker restart over one durable SQLite database sweeps stale reviewer/session ownership before new work begins and leaves an inspectable recovery summary
**Result:** met

**Evidence**
- Closeout re-ran `packages/review-broker-server/test/restart-persistence.test.ts` and `packages/review-broker-server/test/startup-sweep.test.ts`; both passed.
- Direct CLI verification on `/home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-closeout.sqlite` succeeded for both `start-broker.ts --once` and `inspect-continuity.ts --limit 10`.
- The direct CLI output showed migrations `001_init`, `002_review_lifecycle_parity`, `003_reviewer_lifecycle`, and `004_review_continuity`, along with structured `startupRecovery` payloads emitted before the once-mode runtime snapshot.

### 4. Operators can inspect current ownership, recent recovery actions, and any action-required cases through broker CLI/status surfaces without reading raw SQLite or waiting for dashboard work
**Result:** met

**Evidence**
- Closeout re-ran `packages/review-broker-server/test/recovery-status-surfaces.test.ts` and `packages/review-broker-server/test/continuity-cli.test.ts`; both passed.
- `corepack pnpm broker:continuity` passed and delegated to the package `test:continuity` bundle, confirming the supported acceptance path stays intact.
- Direct `start-broker.ts --once` and `inspect-continuity.ts` runs both returned structured runtime continuity snapshots, `startupRecovery`, reviewer counts, and recovery aggregates without any raw SQLite inspection.
- `R010` is now validated in `.gsd/REQUIREMENTS.md` with closeout proof anchored in those broker-owned status/timeline/runtime/CLI surfaces.

### 5. Final acceptance is proven with real reviewer subprocess exits and broker restart against durable state, not only simulated fixtures or in-memory tests
**Result:** met

**Evidence**
- Closeout re-ran the explicit five-test continuity Vitest lane; all 5 files and 8 tests passed.
- The end-to-end continuity proof explicitly covers live reviewer exit, later broker crash via `AppContext.close()`, restart on the same SQLite database, and verification through runtime plus CLI continuity surfaces.
- `broker:continuity` passed as the shipped repo-level acceptance lane, and the direct absolute-path CLI commands also passed.

### Criteria not met
None.

## Definition of done verification
- **All slices marked complete:** verified from the roadmap context; S01, S02, and S03 are all `[x]`.
- **All slice summaries exist:** verified by directory scan; `S01-SUMMARY.md`, `S02-SUMMARY.md`, and `S03-SUMMARY.md` are present under `.gsd/milestones/M003/slices/`.
- **Cross-slice integration points work correctly:** verified. S01 established the canonical reclaim/detach contract, S02 extended that same durable continuity state into runtime/MCP/CLI inspection surfaces, and S03 re-proved the assembled lifecycle on one database without introducing a second policy or raw-DB acceptance path.
- **Durable operator evidence exists:** verified through passing runtime/CLI tests, `broker:continuity`, and direct CLI runs with structured `startupRecovery` and runtime continuity snapshots.
- **Milestone shipped actual code:** verified by non-empty non-`.gsd/` diff stat across broker core/server/runtime/test files.
- **Milestone definition of done:** satisfied.

## Closeout evidence inspected
- `.gsd/milestones/M003/slices/S03/S03-SUMMARY.md`
- `.gsd/milestones/M003/M003-VALIDATION.md`
- `.gsd/REQUIREMENTS.md`
- `.gsd/PROJECT.md`
- `.gsd/KNOWLEDGE.md`
- `git diff --stat HEAD $(git merge-base HEAD main) -- ':!.gsd/'`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/end-to-end-continuity-proof.test.ts packages/review-broker-server/test/recovery-status-surfaces.test.ts packages/review-broker-server/test/startup-sweep.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/continuity-cli.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 broker:continuity`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-closeout.sqlite --once`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/inspect-continuity.ts --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-closeout.sqlite --limit 10`

## Requirement status transitions
The following requirement transitions are supported by milestone evidence:

| Requirement | Transition | Proof summary |
| --- | --- | --- |
| R003 | active → validated | Closeout re-ran the explicit five-test continuity lane, `broker:continuity`, and direct absolute-path once/inspect CLI checks, confirming one durable SQLite database stays coherent across live reviewer exit, broker crash, startup stale-session sweep, and idempotent post-restart inspection. |
| R010 | active → validated | Closeout re-verified recovery status/timeline/runtime/CLI surfaces through tests and direct commands, confirming operators can inspect reclaim/detach outcomes, startup recovery, reviewer state, and action-required cases without raw DB reads. |
| R012 | active → validated | Closeout re-ran the continuity acceptance bundle, confirming timed-out claims reclaim safely, ambiguous work detaches conservatively, startup sweep clears stale ownership before normal use, and no review remains in unexplained claimed/stale limbo. |

No other requirement status transitions were validated at closeout. **R005** was strengthened again by the same evidence but remains active under its original owner.

## Cross-slice integration verification
No cross-slice integration gaps were found.

- **S01 → S02:** S02 reused S01’s reclaim/detach semantics, recovery taxonomy, `claim_generation` fencing, and durable evidence model instead of creating a second policy.
- **S02 → S03:** S03 consumed the shipped `startupRecovery`, `inspectRuntimeContinuity`, `inspect-continuity.ts`, and `start-broker.ts --once` surfaces directly in the final proof rather than bypassing them.
- **External runtime boundaries:** the reviewer subprocess boundary, SQLite durability boundary, broker startup-ordering boundary, and operator inspection boundary were all re-proved in the assembled acceptance lane.
- **Preserved gotchas:** additive migrations, one shared recovery policy, supported broker surfaces over raw DB reads, regenerated JS/dist artifacts after contract changes, `AppContext.close()` for crash-style startup tests, and absolute `--db-path` for package-scoped CLI verification all remained intact.

## Requirement coverage result
- **Validated in M003:** R003, R010, R012
- **Strengthened but not status-changed:** R005
- **Active and still owned by earlier/later milestones:** R001, R002, R004, R006, R007, R008, R009, R011
- **Deferred:** R013, R014
- **Out of scope:** R015, R016, R017

## Reusable lessons from the milestone
- Treat `corepack pnpm broker:continuity` as the canonical continuity acceptance lane; extend it instead of inventing a second closeout harness.
- Use `inspect-continuity.ts` first when you need the one real `startupRecovery` snapshot from a stale DB; treat later `start-broker.ts --once` output as the idempotent confirmation surface.
- Keep continuity acceptance on broker-owned status/timeline/runtime/CLI surfaces rather than raw SQLite reads.
- Keep operator projections argv-safe at the CLI boundary even when lower-level runtime snapshots retain fuller fidelity for tests.
- Use absolute `--db-path` values for package-scoped CLI verification so temp DB location and evidence stay predictable.

## Remaining gaps / next milestone handoff
M003 closes cleanly. M004 should treat continuity as a stable broker substrate and build operator/dashboard work on the existing broker-owned status, timeline, runtime, and continuity inspection surfaces.

M004 should **not**:
- add a raw SQLite operator shortcut,
- invent a second restart continuity read model,
- or bypass `broker:continuity` plus the shipped continuity surfaces when extending acceptance or dashboard inspection.

## Bottom line
M003 delivered real runtime hardening, conservative recovery semantics, durable continuity evidence, restart-safe cleanup, and broker-owned operator inspection on one durable SQLite database. Closeout re-verified the shipped implementation with code-diff confirmation, passing tests, the canonical `broker:continuity` lane, and direct CLI inspection, so the milestone is complete with a passing verification verdict.
