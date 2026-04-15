#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { REVIEW_STATUSES, REVIEWER_STATUSES, REVIEW_VERDICTS } from 'review-broker-core';

import { inspectBrokerRuntime, startBroker, BrokerServiceError } from '../index.js';
import type { StartedBrokerRuntime } from '../index.js';
import { createDashboardRoutes } from '../http/dashboard-routes.js';
import { createDashboardServer } from '../http/dashboard-server.js';
import { readConfig, resolveProvider, setConfigValue } from './config.js';
import { formatDetail, formatJson, formatTable, formatStatusCounts } from './format.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface GlobalOptions {
  json: boolean;
  dbPath?: string;
  cwd?: string;
  help: boolean;
}

// ─── Arg Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse global flags from the raw argv, returning the parsed options and the
 * remaining positional args (subcommand + its arguments).
 *
 * Global flags: --json, --db-path <path>, --cwd <path>, --help / -h
 */
export function parseGlobalArgs(argv: string[]): { options: GlobalOptions; rest: string[] } {
  const options: GlobalOptions = {
    json: false,
    help: false,
  };
  const rest: string[] = [];
  let index = 0;

  while (index < argv.length) {
    const arg = argv[index]!;

    if (arg === '--json') {
      options.json = true;
      index += 1;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      index += 1;
      continue;
    }

    if (arg === '--db-path') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --db-path.');
      }
      options.dbPath = value;
      index += 2;
      continue;
    }

    if (arg.startsWith('--db-path=')) {
      options.dbPath = arg.slice('--db-path='.length);
      index += 1;
      continue;
    }

    if (arg === '--cwd') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --cwd.');
      }
      options.cwd = value;
      index += 2;
      continue;
    }

    if (arg.startsWith('--cwd=')) {
      options.cwd = arg.slice('--cwd='.length);
      index += 1;
      continue;
    }

    // Everything else is a positional arg (subcommand or subcommand arg)
    rest.push(arg);
    index += 1;
  }

  return { options, rest };
}

// ─── Subcommand Arg Helpers ──────────────────────────────────────────────────

/**
 * Parse a --flag <value> pair from a subcommand's remaining args.
 * Returns the value if found, undefined otherwise. Mutates the args array
 * by removing the consumed flag and value.
 */
function extractFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;

  const value = args[idx + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}.`);
  }
  args.splice(idx, 2);
  return value;
}

/**
 * Parse a --flag=value pair from a subcommand's remaining args.
 * Also handles --flag <value> form.
 */
function extractFlagWithEquals(args: string[], flag: string): string | undefined {
  // Check --flag=value form first
  const prefix = `${flag}=`;
  const eqIdx = args.findIndex((a) => a.startsWith(prefix));
  if (eqIdx !== -1) {
    const value = args[eqIdx]!.slice(prefix.length);
    args.splice(eqIdx, 1);
    return value;
  }
  // Fall back to --flag <value> form
  return extractFlag(args, flag);
}

/**
 * Parse --status flag and validate against allowed values.
 */
function extractStatusFlag(
  args: string[],
  allowedStatuses: readonly string[],
  entityName: string,
): string | undefined {
  const status = extractFlagWithEquals(args, '--status');
  if (status === undefined) return undefined;

  if (!allowedStatuses.includes(status)) {
    throw new Error(
      `Invalid ${entityName} status: "${status}". Valid values: ${allowedStatuses.join(', ')}`,
    );
  }
  return status;
}

/**
 * Parse --limit flag and validate it's a positive integer.
 */
function extractLimitFlag(args: string[]): number | undefined {
  const raw = extractFlagWithEquals(args, '--limit');
  if (raw === undefined) return undefined;

  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`Invalid --limit value: "${raw}". Must be a positive integer.`);
  }
  return limit;
}

/**
 * Extract a required --flag value from a subcommand's args.
 * Throws if the flag is missing or has no value.
 */
function requireFlag(args: string[], flag: string, commandName: string): string {
  const value = extractFlagWithEquals(args, flag);
  if (value === undefined) {
    throw new Error(`Missing required ${flag} for "${commandName}".`);
  }
  return value;
}

/**
 * Extract the first positional arg (non-flag) from the args array.
 */
function extractPositionalId(args: string[]): string | undefined {
  const idx = args.findIndex((a) => !a.startsWith('--'));
  if (idx === -1) return undefined;
  return args.splice(idx, 1)[0];
}

/**
 * Require a positional <id> argument — error if missing.
 */
function requireId(args: string[], commandName: string): string {
  const id = extractPositionalId(args);
  if (!id) {
    throw new IdRequiredError(commandName);
  }
  return id;
}

class IdRequiredError extends Error {
  constructor(commandName: string) {
    super(`Missing required <id> argument for "${commandName}".`);
    this.name = 'IdRequiredError';
  }
}

// ─── Truncation Helper ──────────────────────────────────────────────────────

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}

// ─── Command Handlers ────────────────────────────────────────────────────────

function handleStatus(runtime: StartedBrokerRuntime, options: GlobalOptions): void {
  const snapshot = inspectBrokerRuntime(runtime.context);

  if (options.json) {
    process.stdout.write(formatJson(snapshot) + '\n');
    return;
  }

  const output = formatDetail([
    ['Reviews', snapshot.reviewCount],
    ['Reviewers', snapshot.reviewerCount],
    ['Tracked Reviewers', snapshot.trackedReviewerCount],
    ['Messages', snapshot.messageCount],
    ['Audit Events', snapshot.auditEventCount],
    ['Migrations', snapshot.migrationCount],
    ['Review Statuses', formatStatusCounts(snapshot.statusCounts)],
    ['Reviewer Statuses', formatStatusCounts(snapshot.reviewerStatusCounts)],
    ['Counter-patch Statuses', formatStatusCounts(snapshot.counterPatchStatusCounts)],
  ]);

  process.stdout.write(output + '\n');
}

async function handleReviewsList(
  rest: string[],
  runtime: StartedBrokerRuntime,
  options: GlobalOptions,
): Promise<void> {
  const args = [...rest];
  const status = extractStatusFlag(args, REVIEW_STATUSES, 'review');
  const limit = extractLimitFlag(args);

  const response = await runtime.service.listReviews({
    ...(status !== undefined ? { status: status as (typeof REVIEW_STATUSES)[number] } : {}),
    ...(limit !== undefined ? { limit } : {}),
  });

  if (options.json) {
    process.stdout.write(formatJson(response) + '\n');
    return;
  }

  if (response.reviews.length === 0) {
    process.stdout.write('No reviews found.\n');
    return;
  }

  const output = formatTable(
    ['ID', 'Title', 'Status', 'Priority', 'Author', 'Created'],
    response.reviews.map((r) => [
      r.reviewId,
      truncate(r.title, 40),
      r.status,
      r.priority,
      r.authorId,
      r.createdAt,
    ]),
  );
  process.stdout.write(output + '\n');
}

async function handleReviewsShow(
  rest: string[],
  runtime: StartedBrokerRuntime,
  options: GlobalOptions,
): Promise<void> {
  const args = [...rest];
  const id = requireId(args, 'reviews show');

  const response = await runtime.service.getReviewStatus({ reviewId: id });

  if (options.json) {
    process.stdout.write(formatJson(response) + '\n');
    return;
  }

  const r = response.review;
  const output = formatDetail([
    ['Review ID', r.reviewId],
    ['Title', r.title],
    ['Status', r.status],
    ['Priority', r.priority],
    ['Author', r.authorId],
    ['Created', r.createdAt],
    ['Updated', r.updatedAt],
    ['Claimed By', r.claimedBy],
    ['Claimed At', r.claimedAt],
    ['Claim Generation', r.claimGeneration],
    ['Current Round', r.currentRound],
    ['Latest Verdict', r.latestVerdict],
    ['Verdict Reason', r.verdictReason],
    ['Counter-patch Status', r.counterPatchStatus],
    ['Last Message', r.lastMessageAt],
    ['Last Activity', r.lastActivityAt],
  ]);
  process.stdout.write(output + '\n');
}

async function handleProposalShow(
  rest: string[],
  runtime: StartedBrokerRuntime,
  options: GlobalOptions,
): Promise<void> {
  const args = [...rest];
  const id = requireId(args, 'proposal show');

  const response = await runtime.service.getProposal({ reviewId: id });

  if (options.json) {
    process.stdout.write(formatJson(response) + '\n');
    return;
  }

  const p = response.proposal;
  const output = formatDetail([
    ['Review ID', p.reviewId],
    ['Title', p.title],
    ['Description', p.description],
    ['Affected Files', p.affectedFiles.join(', ') || '—'],
    ['Priority', p.priority],
    ['Current Round', p.currentRound],
    ['Latest Verdict', p.latestVerdict],
    ['Verdict Reason', p.verdictReason],
    ['Counter-patch Status', p.counterPatchStatus],
    ['Diff', truncate(p.diff, 200)],
  ]);
  process.stdout.write(output + '\n');
}

async function handleDiscussionShow(
  rest: string[],
  runtime: StartedBrokerRuntime,
  options: GlobalOptions,
): Promise<void> {
  const args = [...rest];
  const id = requireId(args, 'discussion show');

  const response = await runtime.service.getDiscussion({ reviewId: id });

  if (options.json) {
    process.stdout.write(formatJson(response) + '\n');
    return;
  }

  if (response.messages.length === 0) {
    process.stdout.write('No discussion messages found.\n');
    return;
  }

  const output = formatTable(
    ['Message ID', 'Actor', 'Role', 'Created', 'Body'],
    response.messages.map((m) => [
      String(m.messageId),
      m.actorId,
      m.authorRole,
      m.createdAt,
      truncate(m.body, 60),
    ]),
  );
  process.stdout.write(output + '\n');
}

async function handleActivity(
  rest: string[],
  runtime: StartedBrokerRuntime,
  options: GlobalOptions,
): Promise<void> {
  const args = [...rest];
  const id = requireId(args, 'activity');
  const limit = extractLimitFlag(args);

  const response = await runtime.service.getActivityFeed({
    reviewId: id,
    ...(limit !== undefined ? { limit } : {}),
  });

  if (options.json) {
    process.stdout.write(formatJson(response) + '\n');
    return;
  }

  if (response.activity.length === 0) {
    process.stdout.write('No activity found.\n');
    return;
  }

  const output = formatTable(
    ['Event ID', 'Type', 'Status Change', 'Actor', 'Created'],
    response.activity.map((a) => [
      String(a.auditEventId),
      a.eventType,
      a.statusFrom && a.statusTo ? `${a.statusFrom} → ${a.statusTo}` : '—',
      a.actorId ?? '—',
      a.createdAt,
    ]),
  );
  process.stdout.write(output + '\n');
}

async function handleReviewersList(
  rest: string[],
  runtime: StartedBrokerRuntime,
  options: GlobalOptions,
): Promise<void> {
  const args = [...rest];
  const status = extractStatusFlag(args, REVIEWER_STATUSES, 'reviewer');
  const limit = extractLimitFlag(args);

  const response = await runtime.service.listReviewers({
    ...(status !== undefined ? { status: status as (typeof REVIEWER_STATUSES)[number] } : {}),
    ...(limit !== undefined ? { limit } : {}),
  });

  if (options.json) {
    process.stdout.write(formatJson(response) + '\n');
    return;
  }

  if (response.reviewers.length === 0) {
    process.stdout.write('No reviewers found.\n');
    return;
  }

  const output = formatTable(
    ['ID', 'Status', 'Current Review', 'Command', 'PID', 'Started', 'Updated'],
    response.reviewers.map((r) => [
      r.reviewerId,
      r.status,
      r.currentReviewId ?? '—',
      r.command,
      r.pid !== null ? String(r.pid) : '—',
      r.startedAt ?? '—',
      r.updatedAt,
    ]),
  );
  process.stdout.write(output + '\n');
}

// ─── Create / Kill Handlers ──────────────────────────────────────────────────

async function handleReviewsCreate(
  rest: string[],
  runtime: StartedBrokerRuntime,
  options: GlobalOptions,
): Promise<void> {
  const args = [...rest];
  const title = requireFlag(args, '--title', 'reviews create');
  const description = requireFlag(args, '--description', 'reviews create');
  const author = requireFlag(args, '--author', 'reviews create');
  const diffFile = requireFlag(args, '--diff-file', 'reviews create');
  const priority = extractFlagWithEquals(args, '--priority');
  const validPriorities = ['low', 'normal', 'high', 'urgent'] as const;
  if (priority && !(validPriorities as readonly string[]).includes(priority)) {
    throw new Error(`Invalid priority "${priority}" — must be one of: ${validPriorities.join(', ')}`);
  }

  const resolvedPath = path.resolve(diffFile);
  let diff: string;
  try {
    diff = readFileSync(resolvedPath, 'utf8');
  } catch {
    throw new Error(`Cannot read diff file: "${resolvedPath}" — file not found.`);
  }

  const response = await runtime.service.createReview({
    title,
    description,
    diff,
    authorId: author,
    priority: (priority as (typeof validPriorities)[number]) ?? 'normal',
  });

  if (options.json) {
    process.stdout.write(formatJson(response) + '\n');
    return;
  }

  const output = formatDetail([
    ['Review ID', response.review.reviewId],
    ['Status', response.review.status],
    ['Title', response.review.title],
    ['Proposal ID', response.proposal.reviewId],
  ]);
  process.stdout.write(output + '\n');
}

async function handleReviewersKill(
  rest: string[],
  runtime: StartedBrokerRuntime,
  options: GlobalOptions,
): Promise<void> {
  const args = [...rest];
  const id = requireId(args, 'reviewers kill');

  const response = await runtime.service.killReviewer({ reviewerId: id });

  if (options.json) {
    process.stdout.write(formatJson(response) + '\n');
    return;
  }

  const output = formatDetail([
    ['Outcome', response.outcome],
    ['Reviewer ID', response.reviewer?.reviewerId ?? '—'],
    ['Message', response.message ?? '—'],
  ]);
  process.stdout.write(output + '\n');
}

async function handleReviewersSpawn(
  rest: string[],
  runtime: StartedBrokerRuntime,
  options: GlobalOptions,
): Promise<void> {
  const args = [...rest];
  const commandFlag = extractFlagWithEquals(args, '--command');
  const providerFlag = extractFlagWithEquals(args, '--provider');
  const argsFlag = extractFlagWithEquals(args, '--args');
  const cwdFlag = extractFlagWithEquals(args, '--cwd');

  let command: string;
  let spawnArgs: string[] | undefined;

  if (commandFlag) {
    // Explicit --command mode
    command = commandFlag;
    if (argsFlag) {
      spawnArgs = argsFlag.split(',');
    }
  } else if (providerFlag) {
    // Config-based --provider mode
    const resolved = resolveProvider(runtime.context.configPath, providerFlag);
    command = resolved.command;
    spawnArgs = resolved.args;
  } else {
    throw new Error('Either --command or --provider is required for "reviewers spawn".');
  }

  const response = await runtime.service.spawnReviewer({
    command,
    args: spawnArgs ?? [],
    ...(cwdFlag !== undefined ? { cwd: cwdFlag } : {}),
  });

  if (options.json) {
    process.stdout.write(formatJson(response) + '\n');
    return;
  }

  const r = response.reviewer;
  const output = formatDetail([
    ['Reviewer ID', r.reviewerId],
    ['Status', r.status],
    ['Command', r.command],
    ['PID', r.pid !== null ? String(r.pid) : '—'],
  ]);
  process.stdout.write(output + '\n');
}

// ─── Dashboard Handler ───────────────────────────────────────────────────────

/**
 * Resolve the dashboard dist path relative to the workspace root.
 * Walks up from the broker-server package to find the sibling dashboard package.
 */
function resolveDashboardDistPath(cwd: string): string {
  const fromCwd = path.resolve(cwd, 'packages', 'review-broker-dashboard', 'dist');
  if (existsSync(fromCwd)) {
    return fromCwd;
  }

  return path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '..', '..', '..', 'review-broker-dashboard', 'dist',
  );
}

async function handleDashboard(
  rest: string[],
  runtime: StartedBrokerRuntime,
  options: GlobalOptions,
): Promise<void> {
  const args = [...rest];
  const portRaw = extractFlagWithEquals(args, '--port');
  const host = extractFlagWithEquals(args, '--host');
  const port = portRaw !== undefined ? Number(portRaw) : undefined;

  if (port !== undefined && (!Number.isInteger(port) || port < 0)) {
    throw new Error(`Invalid --port value: "${portRaw}". Must be a non-negative integer.`);
  }

  const dashboardDistPath = resolveDashboardDistPath(runtime.context.workspaceRoot);

  const routes = createDashboardRoutes({
    context: runtime.context,
    service: runtime.service,
    startupRecoverySnapshot: runtime.getStartupRecoverySnapshot(),
  });

  const server = await createDashboardServer({
    dashboardDistPath,
    routes,
    ...(host !== undefined ? { host } : {}),
    ...(port !== undefined ? { port } : {}),
  });

  if (options.json) {
    process.stdout.write(formatJson({ url: server.baseUrl, port: server.port, dashboardDistPath }) + '\n');
  } else {
    process.stdout.write(`Dashboard running at ${server.baseUrl}\n`);
  }

  // Gracefully tear down on broker stop
  const originalClose = runtime.close;
  runtime.close = () => {
    routes.dispose();
    void server.close();
    originalClose();
  };

  await runtime.waitUntilStopped();
}

// ─── Config Handlers ─────────────────────────────────────────────────────────

function handleConfigShow(runtime: StartedBrokerRuntime, options: GlobalOptions): void {
  const config = readConfig(runtime.context.configPath);

  if (options.json) {
    process.stdout.write(formatJson(config) + '\n');
    return;
  }

  const keys = Object.keys(config);
  if (keys.length === 0) {
    process.stdout.write('No configuration found.\n');
    return;
  }

  const entries: Array<[string, string | number | null]> = keys.map((key) => {
    const val = config[key];
    return [key, typeof val === 'object' ? JSON.stringify(val) : String(val)];
  });

  process.stdout.write(formatDetail(entries) + '\n');
}

function handleConfigSet(
  rest: string[],
  runtime: StartedBrokerRuntime,
  options: GlobalOptions,
): void {
  const args = [...rest];
  const key = extractPositionalId(args);
  if (!key) {
    throw new Error('Missing required <key> argument for "config set".');
  }

  const value = extractPositionalId(args);
  if (!value) {
    throw new Error('Missing required <value> argument for "config set".');
  }

  const updated = setConfigValue(runtime.context.configPath, key, value);

  if (options.json) {
    process.stdout.write(formatJson(updated) + '\n');
    return;
  }

  process.stdout.write(`Set "${key}" = "${value}"\n`);
}

// ─── Write Command Handlers ──────────────────────────────────────────────────

async function handleReviewsClaim(
  rest: string[],
  runtime: StartedBrokerRuntime,
  options: GlobalOptions,
): Promise<void> {
  const args = [...rest];
  const id = requireId(args, 'reviews claim');
  const actor = requireFlag(args, '--actor', 'reviews claim');

  const response = await runtime.service.claimReview({ reviewId: id, claimantId: actor });

  if (options.json) {
    process.stdout.write(formatJson(response) + '\n');
    return;
  }

  const output = formatDetail([
    ['Outcome', response.outcome],
    ['Review ID', response.review?.reviewId ?? '—'],
    ['Status', response.review?.status ?? '—'],
    ['Version', response.version],
  ]);
  process.stdout.write(output + '\n');
}

async function handleReviewsReclaim(
  rest: string[],
  runtime: StartedBrokerRuntime,
  options: GlobalOptions,
): Promise<void> {
  const args = [...rest];
  const id = requireId(args, 'reviews reclaim');
  const actor = requireFlag(args, '--actor', 'reviews reclaim');

  const response = await runtime.service.reclaimReview({ reviewId: id, actorId: actor });

  if (options.json) {
    process.stdout.write(formatJson(response) + '\n');
    return;
  }

  const output = formatDetail([
    ['Review ID', response.review.reviewId],
    ['Status', response.review.status],
    ['Version', response.version],
  ]);
  process.stdout.write(output + '\n');
}

async function handleReviewsVerdict(
  rest: string[],
  runtime: StartedBrokerRuntime,
  options: GlobalOptions,
): Promise<void> {
  const args = [...rest];
  const id = requireId(args, 'reviews verdict');
  const actor = requireFlag(args, '--actor', 'reviews verdict');

  // Validate --verdict against REVIEW_VERDICTS
  const verdictRaw = requireFlag(args, '--verdict', 'reviews verdict');
  if (!(REVIEW_VERDICTS as readonly string[]).includes(verdictRaw)) {
    throw new Error(
      `Invalid verdict: "${verdictRaw}". Valid values: ${REVIEW_VERDICTS.join(', ')}`,
    );
  }
  const verdict = verdictRaw as (typeof REVIEW_VERDICTS)[number];

  const reason = requireFlag(args, '--reason', 'reviews verdict');

  const response = await runtime.service.submitVerdict({
    reviewId: id,
    actorId: actor,
    verdict,
    reason,
  });

  if (options.json) {
    process.stdout.write(formatJson(response) + '\n');
    return;
  }

  const output = formatDetail([
    ['Review ID', response.review.reviewId],
    ['Status', response.review.status],
    ['Verdict', response.review.latestVerdict],
    ['Version', response.version],
  ]);
  process.stdout.write(output + '\n');
}

async function handleReviewsClose(
  rest: string[],
  runtime: StartedBrokerRuntime,
  options: GlobalOptions,
): Promise<void> {
  const args = [...rest];
  const id = requireId(args, 'reviews close');
  const actor = requireFlag(args, '--actor', 'reviews close');

  const response = await runtime.service.closeReview({ reviewId: id, actorId: actor });

  if (options.json) {
    process.stdout.write(formatJson(response) + '\n');
    return;
  }

  const output = formatDetail([
    ['Review ID', response.review.reviewId],
    ['Status', response.review.status],
    ['Version', response.version],
  ]);
  process.stdout.write(output + '\n');
}

async function handleDiscussionAdd(
  rest: string[],
  runtime: StartedBrokerRuntime,
  options: GlobalOptions,
): Promise<void> {
  const args = [...rest];
  const id = requireId(args, 'discussion add');
  const actor = requireFlag(args, '--actor', 'discussion add');
  const body = requireFlag(args, '--body', 'discussion add');

  const response = await runtime.service.addMessage({
    reviewId: id,
    actorId: actor,
    body,
  });

  if (options.json) {
    process.stdout.write(formatJson(response) + '\n');
    return;
  }

  const output = formatDetail([
    ['Message ID', response.message.messageId],
    ['Actor', response.message.actorId],
    ['Review ID', response.review.reviewId],
    ['Version', response.version],
  ]);
  process.stdout.write(output + '\n');
}

async function handleProposalAccept(
  rest: string[],
  runtime: StartedBrokerRuntime,
  options: GlobalOptions,
): Promise<void> {
  const args = [...rest];
  const id = requireId(args, 'proposal accept');
  const actor = requireFlag(args, '--actor', 'proposal accept');
  const note = extractFlagWithEquals(args, '--note');

  const response = await runtime.service.acceptCounterPatch({
    reviewId: id,
    actorId: actor,
    ...(note !== undefined ? { note } : {}),
  });

  if (options.json) {
    process.stdout.write(formatJson(response) + '\n');
    return;
  }

  const output = formatDetail([
    ['Review ID', response.review.reviewId],
    ['Status', response.review.status],
    ['Counter-patch Status', response.review.counterPatchStatus],
    ['Version', response.version],
  ]);
  process.stdout.write(output + '\n');
}

async function handleProposalReject(
  rest: string[],
  runtime: StartedBrokerRuntime,
  options: GlobalOptions,
): Promise<void> {
  const args = [...rest];
  const id = requireId(args, 'proposal reject');
  const actor = requireFlag(args, '--actor', 'proposal reject');
  const note = extractFlagWithEquals(args, '--note');

  const response = await runtime.service.rejectCounterPatch({
    reviewId: id,
    actorId: actor,
    ...(note !== undefined ? { note } : {}),
  });

  if (options.json) {
    process.stdout.write(formatJson(response) + '\n');
    return;
  }

  const output = formatDetail([
    ['Review ID', response.review.reviewId],
    ['Status', response.review.status],
    ['Counter-patch Status', response.review.counterPatchStatus],
    ['Version', response.version],
  ]);
  process.stdout.write(output + '\n');
}

// ─── Subcommand Help ─────────────────────────────────────────────────────────

const SUBCOMMAND_HELP: Record<string, string> = {
  status: `Usage: tandem status [options]

Show broker status summary (review/reviewer counts, status distributions).

Options:
  --json       Output as JSON (full BrokerRuntimeSnapshot)
  -h, --help   Show this help message
`,
  'reviews list': `Usage: tandem reviews list [options]

List reviews with optional status filtering.

Options:
  --status <status>  Filter by review status (${REVIEW_STATUSES.join(', ')})
  --limit <n>        Maximum number of results
  --json             Output as JSON
  -h, --help         Show this help message
`,
  'reviews show': `Usage: tandem reviews show <id> [options]

Show detailed information about a specific review.

Arguments:
  <id>         Review ID (required)

Options:
  --json       Output as JSON
  -h, --help   Show this help message
`,
  'proposal show': `Usage: tandem proposal show <id> [options]

Show the review proposal (diff, metadata, affected files).

Arguments:
  <id>         Review ID (required)

Options:
  --json       Output as JSON
  -h, --help   Show this help message
`,
  'discussion show': `Usage: tandem discussion show <id> [options]

Show the discussion thread for a review.

Arguments:
  <id>         Review ID (required)

Options:
  --json       Output as JSON
  -h, --help   Show this help message
`,
  activity: `Usage: tandem activity <id> [options]

Show the activity feed for a review.

Arguments:
  <id>         Review ID (required)

Options:
  --limit <n>  Maximum number of entries
  --json       Output as JSON
  -h, --help   Show this help message
`,
  'reviewers list': `Usage: tandem reviewers list [options]

List reviewers with optional status filtering.

Options:
  --status <status>  Filter by reviewer status (${REVIEWER_STATUSES.join(', ')})
  --limit <n>        Maximum number of results
  --json             Output as JSON
  -h, --help         Show this help message
`,
  'reviewers kill': `Usage: tandem reviewers kill <id> [options]

Stop a reviewer process.

Arguments:
  <id>         Reviewer ID (required)

Options:
  --json       Output as JSON
  -h, --help   Show this help message
`,
  'reviewers spawn': `Usage: tandem reviewers spawn [options]

Spawn a new reviewer process.

Two modes:
  1. Explicit: --command <cmd> [--args <a,b,c>] [--cwd <dir>]
  2. Config:   --provider <name> (resolves command from config)

Options:
  --command <cmd>     Command to run (mode 1)
  --args <a,b,c>      Comma-separated arguments (mode 1)
  --cwd <dir>         Working directory for the reviewer process
  --provider <name>   Named provider from config (mode 2)
  --json              Output as JSON
  -h, --help          Show this help message
`,
  'reviews create': `Usage: tandem reviews create --title <text> --description <text> --author <id> --diff-file <path> [options]

Create a new review from a diff file.

Options:
  --title <text>        Review title (required)
  --description <text>  Review description (required)
  --author <id>         Author ID (required)
  --diff-file <path>    Path to the diff file (required, resolved relative to cwd)
  --priority <level>    Review priority (optional)
  --json                Output as JSON
  -h, --help            Show this help message
`,
  'config show': `Usage: tandem config show [options]

Show the current broker configuration.

Options:
  --json       Output as JSON
  -h, --help   Show this help message
`,
  'config set': `Usage: tandem config set <key> <value> [options]

Set a configuration value. Supports dot-path keys for nested values.

Arguments:
  <key>        Configuration key (e.g. "reviewer.provider")
  <value>      Value to set

Options:
  --json       Output updated config as JSON
  -h, --help   Show this help message
`,
  'reviews claim': `Usage: tandem reviews claim <id> --actor <actorId> [options]

Claim a review for yourself (transitions pending → in_review).

Arguments:
  <id>             Review ID (required)

Options:
  --actor <id>     Actor performing the claim (required)
  --json           Output as JSON
  -h, --help       Show this help message
`,
  'reviews reclaim': `Usage: tandem reviews reclaim <id> --actor <actorId> [options]

Reclaim a review (force-reassign an in_review review).

Arguments:
  <id>             Review ID (required)

Options:
  --actor <id>     Actor performing the reclaim (required)
  --json           Output as JSON
  -h, --help       Show this help message
`,
  'reviews verdict': `Usage: tandem reviews verdict <id> --actor <actorId> --verdict <verdict> --reason <text> [options]

Submit a verdict on a review.

Arguments:
  <id>                Review ID (required)

Options:
  --actor <id>        Actor submitting the verdict (required)
  --verdict <value>   Verdict: ${REVIEW_VERDICTS.join(', ')} (required)
  --reason <text>     Reason for the verdict (required)
  --json              Output as JSON
  -h, --help          Show this help message
`,
  'reviews close': `Usage: tandem reviews close <id> --actor <actorId> [options]

Close a review.

Arguments:
  <id>             Review ID (required)

Options:
  --actor <id>     Actor closing the review (required)
  --json           Output as JSON
  -h, --help       Show this help message
`,
  'discussion add': `Usage: tandem discussion add <id> --actor <actorId> --body <text> [options]

Add a message to a review's discussion thread.

Arguments:
  <id>             Review ID (required)

Options:
  --actor <id>     Actor posting the message (required)
  --body <text>    Message body (required)
  --json           Output as JSON
  -h, --help       Show this help message
`,
  'proposal accept': `Usage: tandem proposal accept <id> --actor <actorId> [--note <text>] [options]

Accept a counter-patch proposal.

Arguments:
  <id>             Review ID (required)

Options:
  --actor <id>     Actor accepting the proposal (required)
  --note <text>    Optional decision note
  --json           Output as JSON
  -h, --help       Show this help message
`,
  'proposal reject': `Usage: tandem proposal reject <id> --actor <actorId> [--note <text>] [options]

Reject a counter-patch proposal.

Arguments:
  <id>             Review ID (required)

Options:
  --actor <id>     Actor rejecting the proposal (required)
  --note <text>    Optional decision note
  --json           Output as JSON
  -h, --help       Show this help message
`,
  dashboard: `Usage: tandem dashboard [options]

Start the broker dashboard HTTP server.

Options:
  --port <port>    HTTP port (default: 0 = OS-assigned)
  --host <host>    HTTP host (default: 127.0.0.1)
  --json           Output as JSON (prints { url, port, dashboardDistPath })
  -h, --help       Show this help message
`,
};

function printSubcommandHelp(noun: string, verb?: string): boolean {
  const key = verb ? `${noun} ${verb}` : noun;
  const help = SUBCOMMAND_HELP[key];
  if (help) {
    process.stdout.write(help);
    return true;
  }
  return false;
}

// ─── Router ──────────────────────────────────────────────────────────────────

async function dispatch(
  noun: string,
  verb: string | undefined,
  rest: string[],
  runtime: StartedBrokerRuntime,
  options: GlobalOptions,
): Promise<void> {
  switch (noun) {
    case 'status':
      handleStatus(runtime, options);
      return;

    case 'reviews':
      switch (verb) {
        case 'list':
          await handleReviewsList(rest, runtime, options);
          return;
        case 'show':
          await handleReviewsShow(rest, runtime, options);
          return;
        case 'create':
          await handleReviewsCreate(rest, runtime, options);
          return;
        case 'claim':
          await handleReviewsClaim(rest, runtime, options);
          return;
        case 'reclaim':
          await handleReviewsReclaim(rest, runtime, options);
          return;
        case 'verdict':
          await handleReviewsVerdict(rest, runtime, options);
          return;
        case 'close':
          await handleReviewsClose(rest, runtime, options);
          return;
        default:
          process.stderr.write(
            `Unknown reviews subcommand: ${verb ?? '(none)'}\n\nAvailable: list, show, create, claim, reclaim, verdict, close\n`,
          );
          process.exitCode = 1;
          return;
      }

    case 'proposal':
      switch (verb) {
        case 'show':
          await handleProposalShow(rest, runtime, options);
          return;
        case 'accept':
          await handleProposalAccept(rest, runtime, options);
          return;
        case 'reject':
          await handleProposalReject(rest, runtime, options);
          return;
        default:
          process.stderr.write(
            `Unknown proposal subcommand: ${verb ?? '(none)'}\n\nAvailable: show, accept, reject\n`,
          );
          process.exitCode = 1;
          return;
      }

    case 'discussion':
      switch (verb) {
        case 'show':
          await handleDiscussionShow(rest, runtime, options);
          return;
        case 'add':
          await handleDiscussionAdd(rest, runtime, options);
          return;
        default:
          process.stderr.write(
            `Unknown discussion subcommand: ${verb ?? '(none)'}\n\nAvailable: show, add\n`,
          );
          process.exitCode = 1;
          return;
      }

    case 'activity':
      // activity takes <id> as the verb position, so push verb back into rest
      if (verb) {
        rest = [verb, ...rest];
      }
      await handleActivity(rest, runtime, options);
      return;

    case 'reviewers':
      switch (verb) {
        case 'list':
          await handleReviewersList(rest, runtime, options);
          return;
        case 'spawn':
          await handleReviewersSpawn(rest, runtime, options);
          return;
        case 'kill':
          await handleReviewersKill(rest, runtime, options);
          return;
        default:
          process.stderr.write(
            `Unknown reviewers subcommand: ${verb ?? '(none)'}\n\nAvailable: list, spawn, kill\n`,
          );
          process.exitCode = 1;
          return;
      }

    case 'config':
      switch (verb) {
        case 'show':
          handleConfigShow(runtime, options);
          return;
        case 'set':
          handleConfigSet(rest, runtime, options);
          return;
        default:
          process.stderr.write(
            `Unknown config subcommand: ${verb ?? '(none)'}\n\nRun "tandem config show --help" or "tandem config set --help" for usage.\n`,
          );
          process.exitCode = 1;
          return;
      }

    case 'dashboard':
      // dashboard is a top-level command with no verb
      if (verb) {
        rest = [verb, ...rest];
      }
      await handleDashboard(rest, runtime, options);
      return;

    default:
      process.stderr.write(
        `Unknown command: ${noun}\n\nRun "tandem --help" to see available commands.\n`,
      );
      process.exitCode = 1;
  }
}

// ─── Usage ───────────────────────────────────────────────────────────────────

function printUsage(): void {
  process.stdout.write(
    `Usage: tandem <command> [options]

Commands:
  status                   Show broker status summary
  reviews list [--status]  List reviews
  reviews show <id>        Show review details
  reviews create           Create a review from a diff file
  reviews claim <id>       Claim a review (--actor required)
  reviews reclaim <id>     Reclaim a review (--actor required)
  reviews verdict <id>     Submit verdict (--actor, --verdict, --reason required)
  reviews close <id>       Close a review (--actor required)
  proposal show <id>       Show review proposal (diff + metadata)
  proposal accept <id>     Accept counter-patch (--actor required)
  proposal reject <id>     Reject counter-patch (--actor required)
  discussion show <id>     Show review discussion thread
  discussion add <id>      Add discussion message (--actor, --body required)
  activity <id>            Show activity feed for a review
  reviewers list [--status] List reviewers
  reviewers spawn          Spawn a reviewer (--command or --provider)
  reviewers kill <id>      Stop a reviewer process
  dashboard                Start the broker dashboard HTTP server
  config show              Show broker configuration
  config set <key> <value> Set a configuration value

Global Options:
  --json                   Output as JSON
  --db-path <path>         Override the SQLite database path
  --cwd <path>             Resolve workspace-relative paths from this directory
  -h, --help               Show this help message
`,
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { options, rest } = parseGlobalArgs(process.argv.slice(2));

  // Root --help with no subcommand
  if (options.help && rest.length === 0) {
    printUsage();
    return;
  }

  // No subcommand at all
  if (rest.length === 0) {
    printUsage();
    return;
  }

  const noun = rest[0]!;
  const verb = rest[1];
  const subcommandRest = rest.slice(2);

  // Subcommand-level --help (e.g. `tandem status --help`, `tandem reviews list --help`)
  if (options.help) {
    if (printSubcommandHelp(noun, verb)) {
      return;
    }
    // Fall back to root usage if no subcommand help found
    printUsage();
    return;
  }

  let runtime: StartedBrokerRuntime | undefined;

  try {
    runtime = startBroker({
      handleSignals: false,
      ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
      ...(options.dbPath !== undefined ? { dbPath: options.dbPath } : {}),
    });

    await dispatch(noun, verb, subcommandRest, runtime, options);
  } catch (error) {
    if (error instanceof BrokerServiceError) {
      process.stderr.write(`Error: ${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    if (error instanceof IdRequiredError) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    process.exitCode = 1;
  } finally {
    if (runtime) {
      runtime.close();
      await runtime.waitUntilStopped();
    }
  }
}

await main();
