# S01: Pi-mono integration and reviewer agent tools — UAT

**Milestone:** M007
**Written:** 2026-03-27T02:11:06.802Z

# S01: Pi-mono integration and reviewer agent tools — UAT\n\n**Milestone:** M007\n\n## UAT Type\n- UAT mode: integration test\n- Why: Agent review lifecycle proven through mock LLM stream against real BrokerService + SQLite\n\n## Smoke Test\nRun `pnpm vitest run packages/review-broker-server/test/reviewer-agent.test.ts` — 2 tests pass\n\n## Test Cases\n\n### 1. Agent claims review and submits verdict\n1. Run reviewer-agent.test.ts\n2. Expected: Agent claims pending review, reads proposal, submits approved verdict\n3. Database confirms: review status = approved, claimedBy = reviewerId\n\n### 2. Agent audit trail\n1. Check activity feed after agent run\n2. Expected: review.created, review.claimed, review.approved events present
