import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { BrokerClient } from 'review-broker-client';
import type { ReviewStatus as BrokerReviewStatus, ReviewSummary, ReviewVerdict } from 'review-broker-core';
import type {
  ReviewStatusRecord,
  ReviewTransport,
  ReviewUnitIdentity,
  ReviewStatus,
  SubmitCounterPatchInput,
} from './types.js';

const execFileAsync = promisify(execFile);
const GIT_MAX_BUFFER = 10 * 1024 * 1024;

const TRANSIENT_GSD_PREFIXES = [
  '.gsd/audit/',
  '.gsd/activity/',
  '.gsd/runtime/',
  '.gsd/journal/',
  '.gsd/review-broker/',
  '.gsd/graphs/',
];

const TRANSIENT_GSD_FILES = new Set([
  '.gsd/CODEBASE.md',
  '.gsd/STATE.md',
  '.gsd/notifications.jsonl',
  '.gsd/event-log.jsonl',
  '.gsd/metrics.json',
  '.gsd/doctor-history.jsonl',
  '.gsd/state-manifest.json',
  '.gsd/auto.lock',
  '.gsd/gsd.db',
  '.gsd/gsd.db-shm',
  '.gsd/gsd.db-wal',
]);

const DURABLE_GSD_ROOT_FILES = new Set([
  '.gsd/PROJECT.md',
  '.gsd/REQUIREMENTS.md',
  '.gsd/DECISIONS.md',
  '.gsd/KNOWLEDGE.md',
  '.gsd/OVERRIDES.md',
  '.gsd/QUEUE.md',
  '.gsd/PREFERENCES.md',
]);

interface ChangedPathEntry {
  path: string;
  status: string;
}

interface ReviewPatchSelection {
  selectedPaths: string[];
  expectedPaths: string[];
  statusByPath: Map<string, string>;
}

export interface TransportAdapterConfig {
  client: BrokerClient;
  cwd: string;
  authorId: string;
  /**
   * Override the commit message used when committing the worktree on review approval.
   * Defaults to `tandem-review: <unit title> (<reviewId>)`.
   */
  commitMessage?: (unit: ReviewUnitIdentity, reviewId: string) => string;
}

function mapBrokerStatus(brokerStatus: BrokerReviewStatus, verdict: ReviewVerdict | null): ReviewStatus {
  switch (brokerStatus) {
    case 'pending':
      return 'pending';
    case 'claimed':
      return 'claimed';
    case 'submitted':
      return verdict === 'approved' ? 'approved'
        : verdict === 'changes_requested' ? 'changes_requested'
        : 'claimed';
    case 'changes_requested':
      return 'changes_requested';
    case 'approved':
      return 'approved';
    case 'closed':
      return verdict === 'changes_requested' ? 'changes_requested' : 'approved';
  }
}

function formatUnitTitle(unit: ReviewUnitIdentity): string {
  const parts: string[] = [];
  if (unit.milestoneId) parts.push(unit.milestoneId);
  if (unit.sliceId) parts.push(unit.sliceId);
  if (unit.taskId) parts.push(unit.taskId);
  if (parts.length === 0) parts.push(unit.unitId);
  return `Review: ${parts.join('/')}`;
}

function buildCounterPatchMessage(args: {
  reviewId: string;
  unit: ReviewUnitIdentity;
  selectedPaths: string[];
  feedback?: string;
}): string {
  const lines = [
    `Counter-patch update for ${args.unit.unitId} on ${args.reviewId}.`,
  ];

  if (args.feedback && args.feedback.trim().length > 0) {
    lines.push('', 'Addressing reviewer feedback:', args.feedback.trim());
  }

  lines.push('', 'Updated files:');
  for (const filePath of args.selectedPaths) {
    lines.push(`- ${filePath}`);
  }

  lines.push('', 'Canonical proposal diff has been replaced for this review round.');

  return lines.join('\n');
}

function parseUnitIds(unit: ReviewUnitIdentity): {
  milestoneId: string | null;
  sliceId: string | null;
  taskId: string | null;
} {
  const fromId = unit.unitId.split('/');
  const milestoneId = unit.milestoneId ?? fromId[0] ?? null;
  const sliceId = unit.sliceId ?? fromId[1] ?? null;
  const taskId = unit.taskId ?? fromId[2] ?? null;
  return {
    milestoneId,
    sliceId,
    taskId,
  };
}

function resolveExpectedArtifactPaths(unit: ReviewUnitIdentity): string[] {
  if (!unit.unitType) {
    return [];
  }

  const { milestoneId, sliceId, taskId } = parseUnitIds(unit);

  if (!milestoneId) {
    return [];
  }

  const milestoneDir = `.gsd/milestones/${milestoneId}`;
  const sliceDir = sliceId ? `${milestoneDir}/slices/${sliceId}` : null;

  switch (unit.unitType) {
    case 'discuss-milestone':
      return [`${milestoneDir}/${milestoneId}-CONTEXT.md`];
    case 'research-milestone':
      return [`${milestoneDir}/${milestoneId}-RESEARCH.md`];
    case 'plan-milestone':
      return [`${milestoneDir}/${milestoneId}-ROADMAP.md`];
    case 'validate-milestone':
      return [`${milestoneDir}/${milestoneId}-VALIDATION.md`];
    case 'complete-milestone':
      return [`${milestoneDir}/${milestoneId}-SUMMARY.md`];
    case 'discuss-slice':
      return sliceDir ? [`${sliceDir}/${sliceId}-CONTEXT.md`] : [];
    case 'research-slice':
      if (sliceId === 'parallel-research') {
        return [`${milestoneDir}/${milestoneId}-PARALLEL-BLOCKER.md`];
      }
      return sliceDir ? [`${sliceDir}/${sliceId}-RESEARCH.md`] : [];
    case 'plan-slice':
    case 'refine-slice':
      return sliceDir ? [`${sliceDir}/${sliceId}-PLAN.md`] : [];
    case 'reassess-roadmap':
    case 'run-uat':
      return sliceDir ? [`${sliceDir}/${sliceId}-ASSESSMENT.md`] : [];
    case 'replan-slice':
      return sliceDir ? [`${sliceDir}/${sliceId}-REPLAN.md`, `${sliceDir}/${sliceId}-PLAN.md`] : [];
    case 'execute-task':
      return sliceDir && taskId ? [`${sliceDir}/tasks/${taskId}-SUMMARY.md`] : [];
    case 'complete-slice':
      return sliceDir ? [`${sliceDir}/${sliceId}-SUMMARY.md`, `${sliceDir}/${sliceId}-UAT.md`] : [];
    default:
      return [];
  }
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function isTransientGsdPath(path: string): boolean {
  if (!path.startsWith('.gsd/')) {
    return false;
  }

  if (TRANSIENT_GSD_FILES.has(path)) {
    return true;
  }

  if (path.startsWith('.gsd/milestones/') && path.includes('/anchors/')) {
    return true;
  }

  return TRANSIENT_GSD_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function isDurableGsdPath(path: string): boolean {
  if (!path.startsWith('.gsd/')) {
    return false;
  }

  if (DURABLE_GSD_ROOT_FILES.has(path)) {
    return true;
  }

  if (path.startsWith('.gsd/extensions/')) {
    return true;
  }

  if (path.startsWith('.gsd/milestones/')) {
    return !path.includes('/anchors/');
  }

  return false;
}

async function listChangedPathEntries(cwd: string): Promise<ChangedPathEntry[]> {
  const { stdout } = await execFileAsync(
    'git',
    ['-c', 'core.quotepath=false', 'status', '--porcelain', '--untracked-files=all'],
    { cwd, maxBuffer: GIT_MAX_BUFFER },
  );

  const entries: ChangedPathEntry[] = [];
  const lines = stdout.split('\n').filter((line) => line.length >= 4);

  for (const line of lines) {
    const status = line.slice(0, 2);
    const rest = line.slice(3).trim();
    const path = normalizePath(rest.includes(' -> ') ? rest.split(' -> ').pop() ?? rest : rest);

    if (!path) {
      continue;
    }

    entries.push({
      path,
      status,
    });
  }

  return entries;
}

function ensureExpectedArtifactsOnDisk(cwd: string, expectedPaths: string[]): void {
  for (const artifactPath of expectedPaths) {
    const absolutePath = join(cwd, artifactPath);
    if (!existsSync(absolutePath)) {
      throw new Error(`review_patch_missing_expected_artifact:${artifactPath}`);
    }
  }
}

function ensureExpectedArtifactsChanged(expectedPaths: string[], changedPathSet: Set<string>): void {
  for (const artifactPath of expectedPaths) {
    if (!changedPathSet.has(artifactPath)) {
      throw new Error(`review_patch_expected_artifact_not_changed:${artifactPath}`);
    }
  }
}

async function selectReviewPatchPaths(cwd: string, unit: ReviewUnitIdentity): Promise<ReviewPatchSelection> {
  const changedEntries = await listChangedPathEntries(cwd);
  const statusByPath = new Map<string, string>();

  for (const entry of changedEntries) {
    statusByPath.set(entry.path, entry.status);
  }

  const changedPathSet = new Set(statusByPath.keys());
  const expectedPaths = resolveExpectedArtifactPaths(unit);

  ensureExpectedArtifactsOnDisk(cwd, expectedPaths);
  ensureExpectedArtifactsChanged(expectedPaths, changedPathSet);

  const selected = new Set<string>(expectedPaths);

  for (const changedPath of changedPathSet) {
    if (isTransientGsdPath(changedPath)) {
      continue;
    }

    if (changedPath.startsWith('.gsd/')) {
      if (isDurableGsdPath(changedPath)) {
        selected.add(changedPath);
      }
      continue;
    }

    selected.add(changedPath);
  }

  if (selected.size === 0) {
    throw new Error('review_patch_no_reviewable_changes');
  }

  return {
    selectedPaths: [...selected].sort((left, right) => left.localeCompare(right)),
    expectedPaths,
    statusByPath,
  };
}

async function generateTrackedDiff(cwd: string, trackedPaths: string[]): Promise<string> {
  if (trackedPaths.length === 0) {
    return '';
  }

  const { stdout } = await execFileAsync(
    'git',
    ['diff', '--binary', 'HEAD', '--', ...trackedPaths],
    { cwd, maxBuffer: GIT_MAX_BUFFER },
  );

  return stdout;
}

async function generateUntrackedDiff(cwd: string, untrackedPath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['diff', '--no-index', '--binary', '--', '/dev/null', untrackedPath],
      { cwd, maxBuffer: GIT_MAX_BUFFER },
    );

    return stdout;
  } catch (error) {
    const candidate = error as { code?: number; stdout?: string };
    if (candidate.code === 1 && typeof candidate.stdout === 'string') {
      return candidate.stdout;
    }

    throw error;
  }
}

async function buildReviewDiff(cwd: string, selection: ReviewPatchSelection): Promise<string> {
  const trackedPaths = selection.selectedPaths.filter(
    (path) => selection.statusByPath.get(path) !== '??',
  );
  const untrackedPaths = selection.selectedPaths.filter(
    (path) => selection.statusByPath.get(path) === '??',
  );

  const diffParts: string[] = [];

  const trackedDiff = await generateTrackedDiff(cwd, trackedPaths);
  if (trackedDiff.trim().length > 0) {
    // Keep raw diff text intact. Trimming patch payloads can strip terminal
    // newlines required by `git apply --check`, causing false INVALID_DIFF
    // rejections (e.g. "corrupt patch at line N").
    diffParts.push(trackedDiff);
  }

  for (const untrackedPath of untrackedPaths) {
    const untrackedDiff = await generateUntrackedDiff(cwd, untrackedPath);
    if (untrackedDiff.trim().length > 0) {
      diffParts.push(untrackedDiff);
    }
  }

  const combined = diffParts.join('\n');
  if (combined.trim().length === 0) {
    throw new Error('review_patch_empty');
  }

  return combined.endsWith('\n') ? combined : `${combined}\n`;
}

async function stagePaths(cwd: string, paths: string[]): Promise<void> {
  if (paths.length === 0) {
    return;
  }

  await execFileAsync('git', ['add', '--', ...paths], { cwd, maxBuffer: GIT_MAX_BUFFER });
}

async function hasStagedChanges(cwd: string, paths: string[]): Promise<boolean> {
  if (paths.length === 0) {
    return false;
  }

  const { stdout } = await execFileAsync(
    'git',
    ['diff', '--cached', '--name-only', '--', ...paths],
    { cwd, maxBuffer: GIT_MAX_BUFFER },
  );

  return stdout.trim().length > 0;
}

async function commitPaths(cwd: string, paths: string[], message: string): Promise<void> {
  if (paths.length === 0) {
    return;
  }

  await stagePaths(cwd, paths);

  if (!(await hasStagedChanges(cwd, paths))) {
    return;
  }

  await execFileAsync(
    'git',
    ['commit', '-m', message, '--', ...paths],
    { cwd, maxBuffer: GIT_MAX_BUFFER },
  );
}

function toStatusRecord(review: ReviewSummary): ReviewStatusRecord {
  const record: ReviewStatusRecord = {
    reviewId: review.reviewId,
    status: mapBrokerStatus(review.status, review.latestVerdict),
    updatedAt: review.updatedAt,
  };
  if (review.verdictReason != null) {
    record.summary = review.verdictReason;
    record.feedback = review.verdictReason;
  }
  return record;
}

function findLatestReviewerFeedback(messages: Array<{ authorRole: string; body: string }>): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }

    if (message.authorRole === 'reviewer' && message.body.trim().length > 0) {
      return message.body;
    }
  }

  return null;
}

export function createBrokerTransportAdapter(config: TransportAdapterConfig): ReviewTransport {
  const buildCommitMessage =
    config.commitMessage ?? ((unit, reviewId) => `tandem-review: ${formatUnitTitle(unit)} (${reviewId})`);

  const reviewPatchPaths = new Map<string, string[]>();

  return {
    async submitReview(unit: ReviewUnitIdentity): Promise<ReviewStatusRecord> {
      const selectedPaths = await selectReviewPatchPaths(config.cwd, unit);
      const diff = await buildReviewDiff(config.cwd, selectedPaths);
      const title = formatUnitTitle(unit);
      const description = [
        `Auto-review for unit ${unit.unitId}`,
        '',
        'Included files:',
        ...selectedPaths.selectedPaths.map((filePath) => `- ${filePath}`),
      ].join('\n');

      const response = await config.client.createReview({
        title,
        description,
        diff,
        authorId: config.authorId,
        priority: 'normal',
      });

      reviewPatchPaths.set(response.review.reviewId, selectedPaths.selectedPaths);

      return toStatusRecord(response.review);
    },

    async submitCounterPatch(input: SubmitCounterPatchInput): Promise<ReviewStatusRecord> {
      const selection = await selectReviewPatchPaths(config.cwd, input.unit);
      const diff = await buildReviewDiff(config.cwd, selection);
      const body = buildCounterPatchMessage({
        reviewId: input.reviewId,
        unit: input.unit,
        selectedPaths: selection.selectedPaths,
        ...(input.feedback !== undefined ? { feedback: input.feedback } : {}),
      });

      const response = await config.client.addMessage({
        reviewId: input.reviewId,
        actorId: config.authorId,
        body,
        diff,
      });

      reviewPatchPaths.set(input.reviewId, selection.selectedPaths);

      const record = toStatusRecord(response.review);
      if (!record.summary) {
        record.summary = 'Counter-patch submitted.';
      }
      return record;
    },

    async getStatus(reviewId: string): Promise<ReviewStatusRecord> {
      const response = await config.client.getReviewStatus({ reviewId });
      const record = toStatusRecord(response.review);

      if (record.status === 'changes_requested') {
        try {
          const discussion = await config.client.getDiscussion({ reviewId });
          const latestFeedback = findLatestReviewerFeedback(discussion.messages);
          if (latestFeedback !== null) {
            record.feedback = latestFeedback;
            if (record.summary == null || record.summary.length === 0) {
              record.summary = latestFeedback;
            }
          }
        } catch {
          // Best-effort: missing discussion data should not fail review status polling.
        }
      }

      return record;
    },

    async onReviewAllowed(unit: ReviewUnitIdentity, reviewId: string): Promise<void> {
      let selectedPaths = reviewPatchPaths.get(reviewId);

      if (!selectedPaths) {
        try {
          selectedPaths = (await selectReviewPatchPaths(config.cwd, unit)).selectedPaths;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message === 'review_patch_no_reviewable_changes') {
            return;
          }
          throw error;
        }
      }

      if (selectedPaths.length === 0) {
        return;
      }

      await commitPaths(config.cwd, selectedPaths, buildCommitMessage(unit, reviewId));
      reviewPatchPaths.delete(reviewId);
    },
  };
}
