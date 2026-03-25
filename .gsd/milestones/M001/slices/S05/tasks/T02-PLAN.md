---
estimated_steps: 4
estimated_files: 7
skills_used:
  - gsd
  - test
  - review
  - debug-like-expert
  - best-practices
---

# T02: Finish reviewer-recovery parity and wire the `broker:parity` entrypoint

**Slice:** S05 — End-to-end standalone parity proof
**Milestone:** M001

## Description

Finish the milestone closeout proof by extending the new acceptance harness to the reviewer lifecycle and startup-recovery path, then expose that proof through a root `broker:parity` script that is easy to rerun. This task should keep the proof additive, reuse the existing stale-reviewer seeding pattern, and ensure the new final-assembly gate does not regress the earlier S02-S04 suites.

## Steps

1. Extend `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts` with a startup-recovery scenario that seeds stale reviewer-owned work through the existing low-level context path, then reopens the same DB through standalone inspection, real stdio MCP, and the typed client.
2. Assert that the recovered reviewer and review state matches the already-frozen vocabulary: reviewer offline with `startup_recovery`, claimed/submitted reviews reclaimed to `pending`, audit/activity evidence preserved, and redaction-safe diagnostics still available.
3. Update `package.json` with a named root `broker:parity` verification entry for the final parity proof using command forms already known to work in this harness.
4. Re-run the focused regression pack from S04/S03/S02 plus `broker:smoke` so the final acceptance proof proves composition without replacing the earlier subsystem checks.

## Must-Haves

- [ ] The acceptance file proves startup recovery through the same assembled path instead of relying only on isolated restart tests.
- [ ] Reviewer offline/reclaim/audit vocabulary is asserted through standalone inspection, real MCP, and typed-client reads after restart.
- [ ] `package.json` exposes a root `broker:parity` script for the new final parity proof, and the focused regression pack remains green.

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:parity`
- `./node_modules/.bin/vitest run packages/review-broker-server/test/client-mcp-parity.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts packages/review-broker-client/test/in-process-client.test.ts packages/review-broker-server/test/mcp-server.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:smoke`

## Observability Impact

- Signals added/changed: the final acceptance harness now checks `startupRecovery`, `reviewer.offline`, and `review.reclaimed` evidence through standalone CLI, MCP stderr/runtime state, and typed-client reads after reopen.
- How a future agent inspects this: run `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:parity` or the explicit regression commands above, then inspect the startup-recovery phase in `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts` for the exact boundary that drifted.
- Failure state exposed: reviewer recovery mismatches, stale-session reclaim regressions, or broken final proof wiring become visible as one named acceptance failure instead of scattered subsystem-only symptoms.

## Inputs

- `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts` — acceptance harness created in T01 and extended here.
- `packages/review-broker-server/test/restart-persistence.test.ts` — low-level stale-reviewer seeding and startup-recovery assertion pattern to reuse.
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — standalone startup-recovery inspection pattern to reuse.
- `packages/review-broker-server/test/mcp-server.test.ts` — real stdio MCP diagnostics and stderr expectations to preserve.
- `packages/review-broker-client/test/in-process-client.test.ts` — typed-client reviewer visibility expectations to preserve.
- `package.json` — root verification entrypoint to update.
- `packages/review-broker-server/src/index.ts` — startup-recovery snapshot surface the new assertions depend on.

## Expected Output

- `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts` — final acceptance test proving both restart-safe lifecycle parity and startup-recovery parity across the assembled surfaces.
- `package.json` — root script entry for the final parity proof.
