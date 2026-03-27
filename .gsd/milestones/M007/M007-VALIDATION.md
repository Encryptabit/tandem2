---
verdict: needs-attention
remediation_round: 0
---

# Milestone Validation: M007

## Success Criteria Checklist
## Success Criteria Checklist

The M007 roadmap has **no explicit success criteria** — the title field is empty and vision is "TBD" due to roadmap corruption. Criteria are inferred from M007-CONTEXT.md and slice deliverables.

### Inferred Criterion 1: In-process pi-mono agent that calls broker methods as tools
- [x] **PASS** — S01 delivered 6 typed AgentTools wrapping BrokerService (list_reviews, claim_review, get_proposal, get_review_status, submit_verdict, add_message), `createReviewerAgent()` factory, and REVIEWER_SYSTEM_PROMPT. Integration test proves full lifecycle (claim → read → verdict) with mock LLM and real SQLite. 2/2 tests pass.

### Inferred Criterion 2: Agent tools use TypeBox schemas (pi-mono convention)
- [x] **PASS** — S01 T02 implemented parallel TypeBox schemas for all 6 tools. D035 documents the design choice. Tests verify AJV validation works.

### Inferred Criterion 3: pi-mono SDK wired as dependency without bundling provider side effects
- [x] **PASS** — `@gsd/pi-agent-core` and `@gsd/pi-ai` wired as `link:` deps, marked `external` in tsup. D035 documents rationale.

### Inferred Criterion 4: M006 pool infrastructure coexists with agent code on same codebase
- [x] **PASS** — S02 ported all M006 files (reviewer-pool, pool-config, JSONL writer, migration 004). 59 tests pass across 5 suites (reviewer-agent: 2, reviewer-pool: 35, pool-config: 20, restart-persistence: 2). review-broker-core builds cleanly.

### Inferred Criterion 5: Pool manager gains dual-mode spawn (agent vs subprocess)
- [ ] **NOT DELIVERED** — S02 T02 (dual-mode spawn) and T03 (integration tests) have PLAN files but were never executed. S02 was completed after only T01. D037 describes this architecture but it was not implemented. S02 summary explicitly defers: "Next slice should wire createReviewerAgent() into the pool manager."

### Inferred Criterion 6: Agent events piped to JSONL via agent.subscribe()
- [ ] **NOT DELIVERED** — This was part of T02/T03 scope, which was not executed.

## Slice Delivery Audit
## Slice Delivery Audit

| Slice | Claimed Deliverable | Delivered? | Evidence |
|-------|-------------------|------------|----------|
| S01 | Pi-mono integration: 6 AgentTools, createReviewerAgent(), system prompt, integration test | ✅ Yes | 3/3 tasks complete. Files exist: `src/agent/reviewer-tools.ts`, `reviewer-agent.ts`, `reviewer-prompt.ts`. 2/2 tests pass (verified live). S01-SUMMARY.md and S01-UAT.md present. |
| S02 | M006 pool infrastructure port to M007 | ✅ Partially | T01 (port/merge) completed — all M006 files ported, 59 tests pass across 5 suites (verified live). **However**, T02 (dual-mode agent spawn) and T03 (agent lifecycle integration tests) have PLAN files on disk but no SUMMARY files — never started. Slice was marked complete after only T01. |

### S01 Detail
- All 3 tasks have SUMMARY files with `completed_at` timestamps (2026-03-26)
- S01 marked `status: done` in frontmatter
- Code artifacts verified: 3 agent source files, index.ts re-exports, tsup external config, link: deps in package.json

### S02 Detail
- T01 has SUMMARY and VERIFY.json — completed 2026-03-27T01:52:42Z
- T02 has PLAN only (7 steps, 5 files) — "Extend pool manager with dual-mode agent spawn and JSONL capture"
- T03 has PLAN only (5 steps, 3 files) — "Agent lifecycle integration tests and CLI display"
- Slice marked complete at 2026-03-27T01:55:52Z despite T02/T03 being unexecuted
- S02 SUMMARY acknowledges the gap: "The pool manager still only spawns subprocess-based reviewers"

### Roadmap Integrity Issue
- S01 is **completely missing** from the roadmap table — only S02 appears
- Roadmap title is empty, vision is "TBD"
- S02's "After this" column contains the entire UAT document (rendering corruption)

## Cross-Slice Integration
## Cross-Slice Integration

### S01 → S02 Boundary
- **S01 provides**: `createReviewerAgent()`, `createReviewerAgentTools()`, `REVIEWER_SYSTEM_PROMPT` — all exported from `src/index.ts`
- **S02 consumes**: S02 T01 required S01 agent files present (checked them out from M007 branch). S02 summary confirms S01 agent tests (2) pass alongside pool tests.
- **Status**: ✅ Boundary correctly crossed — S01 agent code and S02 pool code coexist, both test suites pass.

### S02 → Future (Dual-Mode Integration)
- **S02 provides**: Pool infrastructure ready for agent integration
- **Undelivered consumer**: T02 would have consumed both S01's agent factory and S02's pool manager to create dual-mode spawn. This integration was never built.
- **Status**: ⚠️ The boundary between agent infrastructure (S01) and pool management (S02) is established but NOT bridged. D037 documents the planned architecture but it remains unimplemented.

### No Boundary Mismatches in Delivered Code
All code that was actually built and deployed is internally consistent. The 59 tests passing across 5 suites confirm no integration failures between delivered components.

## Requirement Coverage
## Requirement Coverage

No active requirements were explicitly mapped to M007 slices. The inlined context states "Requirements Advanced: None", "Requirements Validated: None", "Requirements Invalidated or Re-scoped: None."

The M007 CONTEXT document defines the milestone's scope implicitly (in-process reviewer agent, dual-mode pool, config-driven spawn mode), but these were not formalized as tracked requirements.

No requirement gaps to flag — but the lack of formal requirement tracking for this milestone means coverage cannot be audited against a formal baseline.

## Verdict Rationale
**Verdict: needs-attention** (not blocking, but material observations that should be documented before sealing)

**What works well:**
1. All delivered code is verified — 59 tests pass across 5 suites (confirmed by live test run)
2. S01 delivered a complete, tested agent infrastructure (tools, factory, prompt, integration test)
3. S02 T01 successfully merged M006 pool infrastructure with no regressions
4. Three architectural decisions (D035, D036, D037) are well-documented

**Attention items (do not require remediation, but should be acknowledged):**

1. **Roadmap corruption**: M007-ROADMAP.md has an empty title, TBD vision, S01 is missing from the slice table, and S02's "After this" cell contains the full UAT document. This is a tooling/rendering artifact, not a code problem.

2. **S02 scope reduction**: S02 was marked complete after only T01, with T02 (dual-mode spawn) and T03 (integration tests) planned but never started. The slice summary explicitly acknowledges this and defers the work. This is acceptable scope management, but the leftover PLAN files for T02/T03 could cause confusion.

3. **Dual-mode integration not yet delivered**: D037 describes the dual-mode pool architecture, and T02/T03 plans detail the implementation — but this code was never written. The milestone title "Pi-native reviewer agent" is partially fulfilled: the agent exists and works, but it is not yet integrated into the pool manager. This is explicitly called out as follow-up work.

4. **No formal success criteria**: The roadmap never had success criteria defined, making objective pass/fail assessment impossible. The inferred criteria from M007-CONTEXT.md show 4/6 met, with the 2 unmet criteria being the deferred dual-mode integration work.

**Why not needs-remediation**: The delivered code is solid, tested, and internally consistent. The scope reduction was documented and acknowledged in the S02 summary. The missing work (dual-mode integration) is a natural follow-up milestone, not a regression or failure. Sealing M007 with what was delivered is reasonable — the agent infrastructure and pool infrastructure coexisting is meaningful incremental progress.
