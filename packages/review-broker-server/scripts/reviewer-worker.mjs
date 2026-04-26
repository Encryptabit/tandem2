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
const modelOverride = process.env.REVIEWER_MODEL?.trim() || null;
const pollIntervalMs = parsePositiveInteger(process.env.REVIEWER_POLL_INTERVAL_MS, 3_000);
const workerArgs = process.argv.slice(2);
const analysisProviderFlag = extractOption(workerArgs, '--analysis-provider');
const reviewId = workerArgs.find((arg) => !arg.startsWith('--')) ?? null;
const tandemCommand = process.env.REVIEWER_TANDEM_COMMAND || 'tandem';
const brokerDbPath = process.env.REVIEW_BROKER_DB_PATH || null;
const modelFailureVerdict = parseFallbackVerdict(process.env.REVIEWER_FALLBACK_VERDICT);
const maxBrokerTextLength = parsePositiveInteger(process.env.REVIEWER_MAX_BROKER_TEXT_LENGTH, 8_000);
const analysisProvider = parseAnalysisProvider(
  analysisProviderFlag ?? process.env.REVIEWER_ANALYSIS_PROVIDER ?? process.env.REVIEWER_PROVIDER_NAME,
);
const gsdInvocation = resolveGsdInvocation();
const codexInvocation = resolveCodexInvocation();

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

function parseFallbackVerdict(rawValue) {
  if (rawValue === 'changes_requested') {
    return 'changes_requested';
  }
  return 'approved';
}

function parseAnalysisProvider(rawValue) {
  if (typeof rawValue !== 'string') {
    return 'codex';
  }

  const normalized = rawValue.trim().toLowerCase();
  if (normalized.length === 0) {
    return 'codex';
  }
  if (normalized === 'codex') {
    return 'codex';
  }
  return 'gsd';
}

function extractOption(args, optionName) {
  const equalsPrefix = `${optionName}=`;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === optionName) {
      const value = args[index + 1];
      if (value && !value.startsWith('--')) {
        args.splice(index, 2);
        return value;
      }
      args.splice(index, 1);
      return null;
    }
    if (arg.startsWith(equalsPrefix)) {
      args.splice(index, 1);
      return arg.slice(equalsPrefix.length);
    }
  }
  return null;
}

function resolveGsdInvocation() {
  const explicitCommand = process.env.REVIEWER_GSD_COMMAND;
  if (typeof explicitCommand === 'string' && explicitCommand.trim().length > 0) {
    return {
      command: explicitCommand.trim(),
      args: [],
    };
  }

  const gsdBinPath = process.env.GSD_BIN_PATH;
  if (typeof gsdBinPath === 'string' && gsdBinPath.trim().length > 0) {
    return {
      command: process.execPath,
      args: [gsdBinPath],
    };
  }

  return {
    command: 'gsd',
    args: [],
  };
}

function resolveCodexInvocation() {
  const explicitCommand = process.env.REVIEWER_CODEX_COMMAND;
  if (typeof explicitCommand === 'string' && explicitCommand.trim().length > 0) {
    return {
      command: explicitCommand.trim(),
      args: [],
    };
  }

  const codexBinPath = process.env.CODEX_BIN_PATH;
  if (typeof codexBinPath === 'string' && codexBinPath.trim().length > 0) {
    return {
      command: codexBinPath.trim(),
      args: [],
    };
  }

  return {
    command: 'codex',
    args: [],
  };
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
    stdin = null,
  } = options;

  return new Promise((resolve) => {
    const stdio = [
      stdin === null ? 'ignore' : 'pipe',
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

    const appendStderr = (message) => {
      if (!message) {
        return;
      }
      stderr = stderr.length > 0 && !stderr.endsWith('\n') ? `${stderr}\n${message}` : `${stderr}${message}`;
    };

    if (stdin !== null && child.stdin) {
      child.stdin.on('error', (error) => {
        const message = error instanceof Error ? error.message : String(error);
        appendStderr(`stdin: ${message}`);
      });

      try {
        child.stdin.end(stdin);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendStderr(`stdin: ${message}`);
      }
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

async function claimReview(targetReviewId) {
  return await runTandemJson(['reviews', 'claim', targetReviewId, '--actor', reviewerId]);
}

async function claimNextReview() {
  return await runTandemJson(['reviews', 'claim-next', '--actor', reviewerId]);
}

async function reclaimReview(targetReviewId) {
  return await runTandemJson(['reviews', 'reclaim', targetReviewId, '--actor', reviewerId]);
}

async function getReviewStatus(targetReviewId) {
  const response = await runTandemJson(['reviews', 'show', targetReviewId]);
  return response?.review ?? null;
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
    truncateForBroker(reason),
  ]);
}

function truncateForBroker(value, maxLength = maxBrokerTextLength) {
  const text = String(value ?? '').trim();
  if (text.length <= maxLength) {
    return text;
  }

  const suffix = `\n...[truncated ${text.length - maxLength} chars]`;
  return `${text.slice(0, Math.max(0, maxLength - suffix.length))}${suffix}`;
}

function errorText(error) {
  return truncateForBroker(error instanceof Error ? error.message : String(error), 1_500);
}

function isTerminalReviewStatus(status) {
  return status === 'approved' || status === 'changes_requested' || status === 'closed';
}

function formatGsdInvocationForLog(args) {
  const safeArgs = args.length > 0 ? [...args.slice(0, -1), '<prompt>'] : [];
  return [gsdInvocation.command, ...safeArgs].join(' ');
}

function formatCodexInvocationForLog(args) {
  return [codexInvocation.command, ...args].join(' ');
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
  if (analysisProvider === 'codex') {
    return await runCodexDecision(proposal);
  }

  return await runGsdDecision(proposal);
}

async function runGsdDecision(proposal) {
  const prompt = buildAnalysisPrompt(proposal);
  const gsdArgs = [
    ...gsdInvocation.args,
    '--print',
    '--no-session',
    ...(modelOverride ? ['--model', modelOverride] : []),
    prompt,
  ];

  const result = await runCommand(gsdInvocation.command, gsdArgs, {
    captureStdout: true,
    captureStderr: true,
    inheritStderr: false,
  });

  if (result.signal === 'SIGTERM' && shuttingDown) {
    return null;
  }

  if (result.exitCode !== 0) {
    const stderr = truncateForBroker(result.stderr.trim(), 1_500);
    const detail = stderr.length > 0 ? `: ${stderr}` : '';
    throw new Error(
      `[reviewer-worker] gsd invocation failed (${formatGsdInvocationForLog(gsdArgs)}) ` +
        `exit=${result.exitCode}${detail}`,
    );
  }

  return parseDecision(result.stdout);
}

async function runCodexDecision(proposal) {
  const prompt = buildAnalysisPrompt(proposal);
  const codexArgs = [
    ...codexInvocation.args,
    '--ask-for-approval',
    'never',
    'exec',
    '--ephemeral',
    '--sandbox',
    'read-only',
    ...(modelOverride ? ['--model', modelOverride] : []),
    '-',
  ];

  const result = await runCommand(codexInvocation.command, codexArgs, {
    captureStdout: true,
    captureStderr: true,
    inheritStderr: false,
    stdin: prompt,
  });

  if (result.signal === 'SIGTERM' && shuttingDown) {
    return null;
  }

  if (result.exitCode !== 0) {
    const stderr = truncateForBroker(result.stderr.trim(), 1_500);
    const detail = stderr.length > 0 ? `: ${stderr}` : '';
    throw new Error(
      `[reviewer-worker] codex invocation failed (${formatCodexInvocationForLog(codexArgs)}) ` +
        `exit=${result.exitCode}${detail}`,
    );
  }

  return parseDecision(result.stdout);
}

async function claimNextPendingReview() {
  const claim = await claimNextReview();
  return claim?.outcome === 'claimed' && claim.review?.reviewId ? claim.review.reviewId : null;
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
    decision = {
      verdict: modelFailureVerdict,
      reason: `Automated reviewer fallback (${modelFailureVerdict}): ${errorText(error)}`,
    };
  }

  if (decision === null) {
    return;
  }

  if (decision.message) {
    await addMessage(targetReviewId, truncateForBroker(decision.message)).catch((error) => {
      console.error(`[reviewer-worker] add_message failed for ${targetReviewId}: ${error.message}`);
    });
  }

  await submitVerdict(targetReviewId, decision.verdict, decision.reason);

  console.error(`[reviewer-worker] completed reviewId=${targetReviewId} verdict=${decision.verdict}`);
}

async function recoverClaimedReview(targetReviewId, error) {
  const detail = errorText(error);
  const fallbackReason = truncateForBroker(
    `Automated reviewer fallback (${modelFailureVerdict}) after worker failure: ${detail}`,
  );

  try {
    await submitVerdict(targetReviewId, modelFailureVerdict, fallbackReason);
    console.error(
      `[reviewer-worker] recovered reviewId=${targetReviewId} with fallback verdict=${modelFailureVerdict}`,
    );
    return;
  } catch (fallbackError) {
    console.error(
      `[reviewer-worker] fallback verdict failed for ${targetReviewId}: ${errorText(fallbackError)}`,
    );
  }

  const current = await getReviewStatus(targetReviewId).catch((statusError) => {
    console.error(`[reviewer-worker] status check failed for ${targetReviewId}: ${errorText(statusError)}`);
    return null;
  });

  if (current && isTerminalReviewStatus(current.status)) {
    console.error(
      `[reviewer-worker] reviewId=${targetReviewId} is already terminal status=${current.status}; no reclaim needed`,
    );
    return;
  }

  if (current?.status === 'claimed') {
    await reclaimReview(targetReviewId);
    console.error(`[reviewer-worker] reclaimed reviewId=${targetReviewId} after worker failure`);
    return;
  }

  throw new Error(
    `[reviewer-worker] could not recover ${targetReviewId}; current status=${current?.status ?? 'unknown'}; ` +
      `original error=${detail}`,
  );
}

async function handleReviewCycleFailure(targetReviewId, error) {
  console.error(`[reviewer-worker] review cycle failed for ${targetReviewId}: ${errorText(error)}`);
  await recoverClaimedReview(targetReviewId, error);
  process.exitCode = 1;
}

async function claimSpecificReview(targetReviewId) {
  const claim = await claimReview(targetReviewId);
  return claim?.outcome === 'claimed';
}

async function main() {
  console.error(
    `[reviewer-worker] starting reviewerId=${reviewerId} mode=${reviewId ? 'single-review' : 'queue-loop'} ` +
      `model=${modelOverride ?? 'provider-default'} ` +
      `provider=${analysisProvider} ` +
      `gsd=${gsdInvocation.command} codex=${codexInvocation.command} fallbackVerdict=${modelFailureVerdict}`,
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

    await reviewClaimedReview(reviewId).catch((error) => handleReviewCycleFailure(reviewId, error));
    return;
  }

  while (!shuttingDown) {
    const claimedReviewId = await claimNextPendingReview().catch((error) => {
      console.error(`[reviewer-worker] queue claim failed: ${error.message}`);
      return null;
    });

    if (claimedReviewId) {
      await reviewClaimedReview(claimedReviewId).catch((error) => {
        return handleReviewCycleFailure(claimedReviewId, error);
      });
      if (process.exitCode) {
        return;
      }
    }

    if (shuttingDown) {
      break;
    }

    await delay(pollIntervalMs);
  }
}

await main();
