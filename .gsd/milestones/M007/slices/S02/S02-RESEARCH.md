# S02 — Research

**Date:** 2026-03-26

## Summary

S02 replaces the subprocess-based pool scaling path with in-process agent tasks. The M006 pool manager (`reviewer-pool.ts`) calls `reviewerManager.spawnReviewer({ command, args })` which spawns a child process with piped stdio. S02 adds a parallel path: when `model` + `provider` are set in pool config, the pool spawns in-process agents via `createReviewerAgent()` instead. The M006 code lives on `milestone/M006` branch and must be merged into M007 before this work can begin.

Key integration points: Agent class has `abort()` and `waitForIdle()`, tools receive `AbortSignal`, events via `agent.subscribe()` pipe to JSONL. Pool needs dual-mode spawn, PID-less reviewer DB registration, and agent-aware background checks.

## Recommendation

Merge M006 into M007 first, then extend pool manager with dual-mode spawn. Agent tasks tracked as Promises with AbortController. PoolConfig gains `model`+`provider` fields to select agent vs subprocess path.

## Key Files

- `reviewer-pool.ts` — dual-mode spawn, agent Promise tracking
- `reviewer-manager.ts` — subprocess path (preserved)
- `reviewer-agent.ts` — agent factory (S01, no changes)
- `jsonl-log-writer.ts` — reuse for agent events
- `pool-config.ts` — add model/provider fields
- `reviewers-repository.ts` — allow pid:null for agents

## Build Order

1. Merge M006 → M007
2. Extend PoolConfig with model/provider
3. Extend reviewer DB for PID-less agents
4. Add agent task tracking to pool manager
5. Implement agent cancellation/lifecycle
6. CLI display and integration tests

## Risks

- M006 merge conflicts (mechanical but requires care)
- Agent abort semantics (cooperative vs preemptive) need empirical verification
- Subprocess path must remain intact