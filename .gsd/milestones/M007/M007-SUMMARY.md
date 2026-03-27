---
id: M007
title: "Pi-native reviewer agent"
status: complete
completed_at: 2026-03-27T02:12:39.442Z
key_decisions:
  - D035: Use link: protocol with absolute paths to globally installed gsd-pi monorepo packages, mark external in tsup — preserves symlink chain for transitive deps
  - D036: AgentTool execute() returns { content, details } — text content for LLM, details for programmatic access; reviewerId closure-injected, not in tool schemas
  - D037: Dual-mode pool manager architecture — config-driven selection between in-process agents (model+provider present) and subprocess spawn (absent)
key_files:
  - packages/review-broker-server/src/agent/reviewer-tools.ts
  - packages/review-broker-server/src/agent/reviewer-prompt.ts
  - packages/review-broker-server/src/agent/reviewer-agent.ts
  - packages/review-broker-server/src/index.ts
  - packages/review-broker-server/test/reviewer-agent.test.ts
  - packages/review-broker-server/package.json
  - packages/review-broker-server/tsup.config.ts
  - packages/review-broker-server/src/runtime/reviewer-pool.ts
  - packages/review-broker-server/src/runtime/pool-config.ts
  - packages/review-broker-server/src/runtime/jsonl-log-writer.ts
  - packages/review-broker-server/src/db/migrations/004_pool_management.sql
  - packages/review-broker-core/src/domain.ts
  - packages/review-broker-core/src/contracts.ts
lessons_learned:
  - link: protocol with absolute paths is the correct way to consume pi-mono packages from worktrees — relative paths break across worktree/main boundaries
  - TypeBox schemas for agent tools should be parallel to (not derived from) existing Zod schemas — only need the LLM-facing subset, keeps coupling low
  - Mock stream pattern for agent testing: use AssistantMessageEventStream with queueMicrotask-driven events, turn detection via toolResult message counting — enables full agent lifecycle testing without real LLM calls
  - Cross-milestone code ports via git show + manual merge of shared files is reliable but requires careful discovery of hidden dependencies (e.g. countByStatus was needed by pool but missing from target branch)
  - S01 was planned and executed in the M007 worktree before the DB tracking was set up — milestone completion required retroactive DB registration of the slice and its tasks
---

# M007: Pi-native reviewer agent

**Delivered an in-process pi-mono reviewer agent with 6 typed AgentTools wrapping BrokerService, and merged M006 pool infrastructure into the same codebase — 61 tests pass across agent and pool suites.**

## What Happened

M007 transformed the review-broker from a subprocess-only system into one that can run reviewers as in-process pi-mono agents. The milestone was delivered across two slices.

**S01 — Pi-mono integration and reviewer agent tools:** Wired `@gsd/pi-agent-core` and `@gsd/pi-ai` into review-broker-server as `link:` dependencies. Created 6 typed AgentTools (list_reviews, claim_review, get_proposal, get_review_status, submit_verdict, add_message) with TypeBox schemas, each wrapping a BrokerService method directly. The `createReviewerAgent()` factory constructs an Agent with closure-injected reviewerId (keeping identity out of tool schemas) and a configurable streamFn for mock testing. A reviewer system prompt (~3200 chars) guides the agent through the review workflow. An integration test proved the full lifecycle: mock LLM stream drives the agent to list → claim → read proposal → submit verdict, with database state confirming approved status and correct claimantId.

**S02 — M006 pool infrastructure port to M007:** Bridged the divergence between M006's pool management code and M007's agent branch. Used `git show` to copy M006-only files verbatim (reviewer-pool.ts, pool-config.ts, jsonl-log-writer.ts, migration 004_pool_management.sql) and manually merged shared files (reviewers-repository.ts, reviews-repository.ts, reviewer-manager.ts, broker-service.ts, app-context.ts, index.ts). Domain types were merged into review-broker-core. A gap was discovered — reviewer-pool.ts needed `countByStatus()` in reviews-repository, which was added. After the port, all 59 tests pass: agent (2), pool (35), pool-config (20), restart-persistence (2), and review-broker-core builds cleanly.

The milestone establishes the architectural foundation for dual-mode pool management: when `model` + `provider` fields are set in pool config, the pool can spawn in-process agents; when absent, the subprocess path is preserved unchanged. The actual dual-mode wiring is a follow-up.

## Success Criteria Results

### Success Criteria Results

- **Pi-mono SDK wired as library dependency:** ✅ MET — `@gsd/pi-agent-core` and `@gsd/pi-ai` are `link:` dependencies in review-broker-server, imports verified via `node -e` checks, both marked `external` in tsup to prevent bundling
- **6 AgentTools wrapping BrokerService methods:** ✅ MET — `reviewer-tools.ts` contains `list_reviews`, `claim_review`, `get_proposal`, `get_review_status`, `submit_verdict`, `add_message` with TypeBox schemas and direct BrokerService calls
- **createReviewerAgent() factory:** ✅ MET — `reviewer-agent.ts` exports factory accepting `{ brokerService, reviewerId, model?, streamFn? }`, returns configured Agent with closure-injected identity
- **Integration test proving full agent review lifecycle:** ✅ MET — 2/2 tests pass in `reviewer-agent.test.ts`, proving agent claims review, reads proposal, submits verdict through real BrokerService + SQLite with mock LLM stream
- **M006 pool infrastructure coexisting with agent code:** ✅ MET — 59 tests pass across 5 suites after M006 port (pool 35, pool-config 20, restart-persistence 2, agent 2) + review-broker-core builds cleanly

## Definition of Done Results

### Definition of Done Results

- **S01 complete with summary:** ✅ — S01-SUMMARY.md exists with full task drill-downs (T01, T02, T03)
- **S02 complete with summary:** ✅ — S02-SUMMARY.md exists with task drill-down (T01)
- **All tests pass:** ✅ — 59 tests across 5 suites: reviewer-agent (2), reviewer-pool (35), pool-config (20), restart-persistence (2), review-broker-core build (exit 0)
- **Cross-slice integration:** ✅ — S02 port verified that S01's agent code (reviewer-agent.test.ts) still passes alongside M006's pool code
- **Code changes committed:** ✅ — S02 commit (66f264e) on main includes both agent and pool code; M007 worktree has 8 files/+495 lines of S01 code

## Requirement Outcomes

No formal requirements (REQUIREMENTS.md empty) were tracked for M007. No requirement status transitions occurred.

## Deviations

S01 was planned and executed in the M007 worktree before DB tracking was established. S02 discovered that reviewer-pool.ts depended on countByStatus() which wasn't in M007 — added as a deviation. The ROADMAP only formally tracked S02 (S01 was tracked via worktree-local plan files). The milestone vision and formal success criteria were marked TBD in the roadmap — verification was done against the M007-CONTEXT.md goals instead.

## Follow-ups

Wire createReviewerAgent() into the pool manager as a dual-mode spawn path (when model+provider config present, spawn agent instead of subprocess). Extend PoolConfig with model/provider fields. Handle PID-less reviewer DB registration for in-process agents. Pipe agent events to JSONL log writer via agent.subscribe(). Wire AbortController for agent cancellation in pool drain lifecycle.
