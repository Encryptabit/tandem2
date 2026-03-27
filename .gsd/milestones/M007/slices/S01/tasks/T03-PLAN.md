---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T03: Integration test proving full agent review cycle

Vitest test with mock LLM stream proving agent claims review, reads proposal, submits verdict through real broker

## Inputs

- None specified.

## Expected Output

- `packages/review-broker-server/test/reviewer-agent.test.ts`

## Verification

pnpm vitest run packages/review-broker-server/test/reviewer-agent.test.ts passes
