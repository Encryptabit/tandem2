#!/usr/bin/env node
/**
 * Long-lived reviewer worker.
 *
 * Modes:
 * - `reviewer-worker.mjs <reviewId>`: claim and review one specific review, then exit.
 * - `reviewer-worker.mjs`: poll for pending reviews forever, claim one, review it, sleep, repeat.
 *
 * This worker uses deterministic broker CLI operations for queue handling/state mutation
 * (list/claim/proposal/verdict) and uses `gsd --print` only for review analysis text.
 */
import process from 'node:process';
import { spawn } from 'node:child_process';

const reviewerId = process.env.REVIEW_BROKER_REVIEWER_ID || 'reviewer-pool-agent';
const model = process.env.REVIEWER_MODEL || 'gpt-5.3-codex';
const pollIntervalMs = parsePositiveInteger(process.env.REVIEWER_POLL_INTERVAL_MS, 3_000);
const reviewId = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const gsdCommand = process.env.REVIEWER_GSD_COMMAND || 'gsd';
const tandemCommand = process.env.REVIEWER_TANDEM_COMMAND || 'tandem';
const brokerDbPath = process.env.REVIEW_BROKER_DB_PATH || null;

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

function appendDbPath(args) {
  if (!brokerDbPath) {
    return args;
  }

  if (args.includes('--db-path')) {
    return args;
  }

  return [...args, '--db-path', brokerDbPath];
}

function runCommand(command, args, options = {}) {
  const {
    captureStdout = true,
    captureStderr = true,
    inheritStderr = false,
  } = options;

  return new Promise((resolve) => {
    const stdio = [
      'ignore',
      captureStdout ? 'pipe' : 'inherit',
      inheritStderr ? 'inherit' : captureStderr ? 'pipe' : 'inherit',
    ];

    let stdout = '';
    let stderr = '';

    let child;
    try {
      child = spawn(command, args, {
        cwd: process.cwd(),
        stdio,
        env: { ...process.env },
      });
    } catch (error) {
      resolve({
        exitCode: 1,
        signal: null,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    activeChild = child;

    if (captureStdout && child.stdout) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf8');
      });
    }

    if (!inheritStderr && captureStderr && child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf8');
      });
    }

    child.on('exit', (code, signal) => {
      if (activeChild === child) {
        activeChild = null;
      }

      resolve({
        exitCode: code ?? 1,
        signal,
        stdout,
        stderr,
      });
    });

    child.on('error', (error) => {
      if (activeChild === child) {
        activeChild = null;
      }

      resolve({
        exitCode: 1,
        signal: null,
        stdout,
        stderr: `${stderr}${error instanceof Error ? error.message : String(error)}`,
      });
    });
  });
}

async function runTandemJson(args) {
  const fullArgs = appendDbPath([...args, '--json']);
  const result = await runCommand(tandemCommand, fullArgs, {
    captureStdout: true,
    captureStderr: true,
    inheritStderr: false,
  });

  if (result.signal === 'SIGTERM' && shuttingDown) {
    return null;
  }

  if (result.exitCode !== 0) {
    throw new Error(
      `[reviewer-worker] tandem ${fullArgs.join(' ')} failed (${result.exitCode}): ${result.stderr.trim()}`,
    );
  }

  const text = result.stdout.trim();
  if (!text) {
    throw new Error(`[reviewer-worker] tandem ${fullArgs.join(' ')} returned empty stdout.`);
  }

  return JSON.parse(text);
}

async function listPendingReviews() {
  const response = await runTandemJson(['reviews', 'list', '--status', 'pending', '--limit', '10']);
  return Array.isArray(response?.reviews) ? response.reviews : [];
}

async function claimReview(targetReviewId) {
  return await runTandemJson(['reviews', 'claim', targetReviewId, '--actor', reviewerId]);
}

async function getProposal(targetReviewId) {
  const response = await runTandemJson(['proposal', 'show', targetReviewId]);
  return response?.proposal ?? null;
}

async function addMessage(targetReviewId, body) {
  if (!body || body.trim().length === 0) {
    return null;
  }

  return await runTandemJson(['discussion', 'add', targetReviewId, '--actor', reviewerId, '--body', body.trim()]);
}

async function submitVerdict(targetReviewId, verdict, reason) {
  return await runTandemJson([
    'reviews',
    'verdict',
    targetReviewId,
    '--actor',
    reviewerId,
    '--verdict',
    verdict,
    '--reason',
    reason,
  ]);
}

function buildAnalysisPrompt(proposal) {
  return `You are reviewer ${reviewerId}. Analyze this code review and return ONLY JSON.

Return object:
{"verdict":"approved"|"changes_requested","reason":"<clear rationale>","message":"<optional concise feedback>"}

Rules:
- Output valid JSON only. No markdown.
- reason must be non-empty.
- verdict must be exactly approved or changes_requested.
- message is optional.

Review payload:
${JSON.stringify(proposal, null, 2)}
`;
}

function parseDecision(raw) {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('empty model output');
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/u);
    if (!match) {
      throw new Error('model output did not include JSON object');
    }
    parsed = JSON.parse(match[0]);
  }

  const verdict = parsed?.verdict;
  const reason = typeof parsed?.reason === 'string' ? parsed.reason.trim() : '';
  const message = typeof parsed?.message === 'string' ? parsed.message.trim() : '';

  if (verdict !== 'approved' && verdict !== 'changes_requested') {
    throw new Error(`invalid verdict: ${String(verdict)}`);
  }

  if (!reason) {
    throw new Error('reason missing');
  }

  return {
    verdict,
    reason,
    ...(message ? { message } : {}),
  };
}

async function runModelDecision(proposal) {
  const prompt = buildAnalysisPrompt(proposal);
  const result = await runCommand(gsdCommand, ['--print', '--no-session', '--model', model, prompt], {
    captureStdout: true,
    captureStderr: false,
    inheritStderr: true,
  });

  if (result.signal === 'SIGTERM' && shuttingDown) {
    return null;
  }

  if (result.exitCode !== 0) {
    throw new Error(`[reviewer-worker] gsd exited with code ${result.exitCode}`);
  }

  return parseDecision(result.stdout);
}

async function claimNextPendingReview() {
  const pending = await listPendingReviews();

  if (pending.length === 0) {
    return null;
  }

  for (const review of pending) {
    const targetReviewId = review?.reviewId;
    if (!targetReviewId) {
      continue;
    }

    const claim = await claimReview(targetReviewId);
    if (claim?.outcome === 'claimed') {
      return targetReviewId;
    }
  }

  return null;
}

async function reviewClaimedReview(targetReviewId) {
  const proposal = await getProposal(targetReviewId);

  if (!proposal) {
    throw new Error(`[reviewer-worker] proposal missing for ${targetReviewId}`);
  }

  let decision;
  try {
    decision = await runModelDecision(proposal);
  } catch (error) {
    const fallbackReason = error instanceof Error ? error.message : String(error);
    decision = {
      verdict: 'changes_requested',
      reason: `Automated reviewer failed: ${fallbackReason}`,
    };
  }

  if (decision === null) {
    return;
  }

  if (decision.message) {
    await addMessage(targetReviewId, decision.message).catch((error) => {
      console.error(`[reviewer-worker] add_message failed for ${targetReviewId}: ${error.message}`);
    });
  }

  await submitVerdict(targetReviewId, decision.verdict, decision.reason);

  console.error(`[reviewer-worker] completed reviewId=${targetReviewId} verdict=${decision.verdict}`);
}

async function claimSpecificReview(targetReviewId) {
  const claim = await claimReview(targetReviewId);
  return claim?.outcome === 'claimed';
}

async function main() {
  console.error(
    `[reviewer-worker] starting reviewerId=${reviewerId} mode=${reviewId ? 'single-review' : 'queue-loop'} model=${model}`,
  );

  if (reviewId) {
    const claimed = await claimSpecificReview(reviewId).catch((error) => {
      console.error(`[reviewer-worker] claim failed for ${reviewId}: ${error.message}`);
      return false;
    });

    if (!claimed) {
      console.error(`[reviewer-worker] reviewId=${reviewId} was not claimable`);
      process.exitCode = 0;
      return;
    }

    await reviewClaimedReview(reviewId).catch((error) => {
      console.error(`[reviewer-worker] review cycle failed for ${reviewId}: ${error.message}`);
      process.exitCode = 1;
    });
    return;
  }

  while (!shuttingDown) {
    const claimedReviewId = await claimNextPendingReview().catch((error) => {
      console.error(`[reviewer-worker] queue claim failed: ${error.message}`);
      return null;
    });

    if (claimedReviewId) {
      await reviewClaimedReview(claimedReviewId).catch((error) => {
        console.error(`[reviewer-worker] review cycle failed for ${claimedReviewId}: ${error.message}`);
      });
    }

    if (shuttingDown) {
      break;
    }

    await delay(pollIntervalMs);
  }
}

await main();
