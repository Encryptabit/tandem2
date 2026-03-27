# S01: Pi-mono integration and reviewer agent tools

**Goal:** @gsd/pi-agent-core and @gsd/pi-ai wired as dependencies. createReviewerAgent() factory with 6 typed AgentTools wrapping BrokerService. Integration test proving full agent review cycle with mock LLM stream.
**Demo:** After this: pnpm vitest run reviewer-agent.test.ts passes — agent executes full review lifecycle

## Tasks
- [x] **T01: Wire @gsd/pi-agent-core and @gsd/pi-ai as link dependencies** — Add both packages as link: deps, run pnpm install, mark external in tsup
  - Estimate: 20m
  - Files: packages/review-broker-server/package.json, packages/review-broker-server/tsup.config.ts
  - Verify: node -e import check for both packages
- [x] **T02: Implement reviewer agent tools, system prompt, and factory** — Create 6 AgentTools with TypeBox schemas, reviewer system prompt, and createReviewerAgent() factory
  - Estimate: 1h30m
  - Files: packages/review-broker-server/src/agent/reviewer-tools.ts, packages/review-broker-server/src/agent/reviewer-prompt.ts, packages/review-broker-server/src/agent/reviewer-agent.ts, packages/review-broker-server/src/index.ts
  - Verify: TypeScript compilation passes
- [x] **T03: Integration test proving full agent review cycle** — Vitest test with mock LLM stream proving agent claims review, reads proposal, submits verdict through real broker
  - Estimate: 1h
  - Files: packages/review-broker-server/test/reviewer-agent.test.ts
  - Verify: pnpm vitest run packages/review-broker-server/test/reviewer-agent.test.ts passes
