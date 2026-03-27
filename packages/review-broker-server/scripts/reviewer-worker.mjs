#!/usr/bin/env node
/**
 * Reviewer worker — uses gsd --print to claim and review one pending review
 * via the review-broker MCP server.
 */
import { spawn } from 'node:child_process';

const reviewId = process.argv[2];
if (!reviewId) {
  console.error('Usage: reviewer-worker.mjs <reviewId>');
  process.exit(1);
}

const REVIEWER_PROMPT = `You are an automated code reviewer. You must review exactly one specific review.

Do these steps IN ORDER:

1. Call mcp_call(server="review-broker", tool="claim_review", args={"reviewId": "${reviewId}", "claimantId": "reviewer-pool-agent"}) to claim it.
2. Call mcp_call(server="review-broker", tool="get_proposal", args={"reviewId": "${reviewId}"}) to read the full diff and description.
3. Analyze the diff carefully. Consider: correctness, bugs, security, performance, whether description matches the diff.
4. Call mcp_call(server="review-broker", tool="submit_verdict", args={"reviewId": "${reviewId}", "actorId": "reviewer-pool-agent", "verdict": "approved" or "changes_requested", "reason": "<your detailed review>"})

Be concise but thorough. Focus on substance.`;

const child = spawn('gsd', ['--print', '--model', 'claude-opus-4-6', REVIEWER_PROMPT], {
  cwd: process.cwd(),
  stdio: ['ignore', 'inherit', 'inherit'],
  env: { ...process.env },
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
