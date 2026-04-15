#!/usr/bin/env node
/**
 * Long-lived reviewer worker.
 *
 * Modes:
 * - `reviewer-worker.mjs <reviewId>`: review one specific review and exit.
 * - `reviewer-worker.mjs`: poll for pending reviews forever, claim one, review it, sleep, repeat.
 *
 * The spawned broker reviewer manager injects REVIEW_BROKER_REVIEWER_ID so each worker
 * claims reviews using the same reviewer identity as the tracked reviewer record.
 *
 * This worker relies on the `gsd` CLI and the current working directory having access
 * to a `review-broker` MCP server configuration.
 */
import process from 'node:process';
import { spawn } from 'node:child_process';

const reviewerId = process.env.REVIEW_BROKER_REVIEWER_ID || 'reviewer-pool-agent';
const model = process.env.REVIEWER_MODEL || 'claude-opus-4-6';
const pollIntervalMs = parsePositiveInteger(process.env.REVIEWER_POLL_INTERVAL_MS, 3_000);
const reviewId = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;

let shuttingDown = false;
let activeChild = null;

process.on('SIGTERM', handleShutdownSignal);
process.on('SIGINT', handleShutdownSignal);

function handleShutdownSignal() {
  shuttingDown = true;

  if (activeChild && activeChild.exitCode === null && activeChild.signalCode === null) {
    activeChild.kill('SIGTERM');
    return;
  }

  process.exit(0);
}

function parsePositiveInteger(rawValue, fallback) {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSingleReviewPrompt(targetReviewId) {
  return `You are reviewer ${reviewerId}. Review exactly one broker review and then stop.

Do these steps in order:
1. Call mcp_call(server="review-broker", tool="claim_review", args={"reviewId":"${targetReviewId}","claimantId":"${reviewerId}"}).
2. If the claim outcome is not "claimed", explain briefly and stop.
3. Call mcp_call(server="review-broker", tool="get_proposal", args={"reviewId":"${targetReviewId}"}).
4. Analyze the diff carefully for correctness, bugs, security issues, missing edge cases, and whether the description matches the change.
5. If useful, call mcp_call(server="review-broker", tool="add_message", args={"reviewId":"${targetReviewId}","actorId":"${reviewerId}","body":"<specific feedback>"}).
6. Call mcp_call(server="review-broker", tool="submit_verdict", args={"reviewId":"${targetReviewId}","actorId":"${reviewerId}","verdict":"approved" or "changes_requested","reason":"<detailed rationale>"}).
7. End with a one-line summary naming the reviewId and verdict.`;
}

function buildQueuePrompt() {
  return `You are reviewer ${reviewerId}. Review at most one pending broker review in this run.

Do these steps in order:
1. Call mcp_call(server="review-broker", tool="list_reviews", args={"status":"pending","limit":10}).
2. If there are no pending reviews, respond with exactly: NO_PENDING_REVIEWS
3. Pick one pending review and call mcp_call(server="review-broker", tool="claim_review", args={"reviewId":"<chosen reviewId>","claimantId":"${reviewerId}"}).
4. If the claim result is "stale" or "not_claimable", try another pending review from the list. If none remain claimable, respond with exactly: NO_CLAIMABLE_REVIEWS
5. After a successful claim, call mcp_call(server="review-broker", tool="get_proposal", args={"reviewId":"<claimed reviewId>"}).
6. Analyze the diff carefully for correctness, bugs, security issues, missing edge cases, and whether the description matches the change.
7. If useful, call mcp_call(server="review-broker", tool="add_message", args={"reviewId":"<claimed reviewId>","actorId":"${reviewerId}","body":"<specific feedback>"}).
8. Call mcp_call(server="review-broker", tool="submit_verdict", args={"reviewId":"<claimed reviewId>","actorId":"${reviewerId}","verdict":"approved" or "changes_requested","reason":"<detailed rationale>"}).
9. End with a one-line summary naming the reviewId and verdict.`;
}

async function runReviewCycle(targetReviewId) {
  const prompt = targetReviewId ? buildSingleReviewPrompt(targetReviewId) : buildQueuePrompt();

  return await new Promise((resolve) => {
    const child = spawn('gsd', ['--print', '--model', model, prompt], {
      cwd: process.cwd(),
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env },
    });

    activeChild = child;

    child.on('exit', (code, signal) => {
      if (activeChild === child) {
        activeChild = null;
      }

      if (signal === 'SIGTERM' && shuttingDown) {
        resolve(0);
        return;
      }

      resolve(code ?? 1);
    });

    child.on('error', (error) => {
      console.error(`[reviewer-worker] failed to start gsd: ${error.message}`);
      if (activeChild === child) {
        activeChild = null;
      }
      resolve(1);
    });
  });
}

async function main() {
  console.error(
    `[reviewer-worker] starting reviewerId=${reviewerId} mode=${reviewId ? 'single-review' : 'queue-loop'} model=${model}`,
  );

  if (reviewId) {
    process.exitCode = await runReviewCycle(reviewId);
    return;
  }

  while (!shuttingDown) {
    const exitCode = await runReviewCycle(null);

    if (shuttingDown) {
      break;
    }

    if (exitCode !== 0) {
      console.error(`[reviewer-worker] gsd exited with code ${exitCode}; retrying in ${pollIntervalMs}ms`);
    }

    await delay(pollIntervalMs);
  }
}

await main();
