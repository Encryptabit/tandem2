import { basename } from 'node:path';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';

import type { ReviewerOfflineReason, ReviewerRecord } from 'review-broker-core';
import { ReviewerRecordSchema } from 'review-broker-core';

import type { AuditRepository } from '../db/audit-repository.js';
import type { ReviewersRepository } from '../db/reviewers-repository.js';

export interface ReviewerOfflineHookResult {
  reclaimedReviewIds: string[];
  staleReviewIds: string[];
  unrecoverableReviewIds: string[];
}

export interface ReviewerOfflineEvent {
  reviewer: ReviewerRecord;
  reviewerId: string;
  offlineAt: string;
  offlineReason: Exclude<ReviewerOfflineReason, 'spawn_failed' | 'startup_recovery'>;
  exitCode: number | null;
  exitSignal: NodeJS.Signals | null;
}

interface ReviewerManagerDependencies {
  reviewers: ReviewersRepository;
  audit: AuditRepository;
  workspaceRoot: string;
  notifications?: { notify: (topic: string) => number };
}

export interface CreateReviewerManagerOptions extends ReviewerManagerDependencies {
  now?: () => string;
  reviewerIdFactory?: () => string;
}

export interface SpawnReviewerInput {
  reviewerId?: string;
  command: string;
  args?: string[];
  cwd?: string;
}

export interface StopReviewerResult {
  outcome: 'killed' | 'already_offline' | 'not_found';
  reviewer: ReviewerRecord | null;
}

export interface ReviewerManagerSnapshot {
  trackedReviewerIds: string[];
  trackedPids: number[];
  listenerCounts: Record<string, { exit: number; error: number }>;
}

export interface ReviewerShutdownSummary {
  requestedReviewerIds: string[];
  outcomes: Record<StopReviewerResult['outcome'], number>;
}

export interface ReviewerManager {
  spawnReviewer: (input: SpawnReviewerInput) => Promise<ReviewerRecord>;
  stopReviewer: (reviewerId: string) => Promise<StopReviewerResult>;
  shutdown: () => Promise<ReviewerShutdownSummary>;
  inspect: () => ReviewerManagerSnapshot;
  setOfflineHandler: (handler: ((event: ReviewerOfflineEvent) => Promise<ReviewerOfflineHookResult> | ReviewerOfflineHookResult) | null) => void;
  close: () => void;
}

interface TrackedReviewerProcess {
  reviewerId: string;
  child: ChildProcess;
  cleanup: () => void;
  stopped: Promise<ReviewerRecord>;
  resolveStopped: (reviewer: ReviewerRecord) => void;
  rejectStopped: (error: unknown) => void;
  requestedOfflineReason: Exclude<ReviewerOfflineReason, 'spawn_failed' | 'startup_recovery'> | null;
}

export function createReviewerManager(options: CreateReviewerManagerOptions): ReviewerManager {
  const now = options.now ?? (() => new Date().toISOString());
  const reviewerIdFactory = options.reviewerIdFactory ?? (() => `reviewer_${randomUUID().replace(/-/g, '')}`);
  const tracked = new Map<string, TrackedReviewerProcess>();
  let offlineHandler:
    | ((event: ReviewerOfflineEvent) => Promise<ReviewerOfflineHookResult> | ReviewerOfflineHookResult)
    | null = null;

  async function spawnReviewer(input: SpawnReviewerInput): Promise<ReviewerRecord> {
    const reviewerId = input.reviewerId ?? reviewerIdFactory();
    const args = input.args ?? [];

    if (tracked.has(reviewerId)) {
      throw new Error(`Reviewer ${reviewerId} is already running.`);
    }

    const rawCommand = input.command;
    const rawArgs = [...args];
    const persistedCommand = sanitizeCommand(rawCommand);
    const persistedArgs = rawArgs.map((arg) => sanitizeArg(arg, options.workspaceRoot));
    const persistedCwd = input.cwd ?? null;
    const resolvedCwd = input.cwd ? path.resolve(options.workspaceRoot, input.cwd) : options.workspaceRoot;
    const createdAt = now();

    let child: ChildProcess;

    try {
      child = spawn(rawCommand, rawArgs, {
        cwd: resolvedCwd,
        stdio: 'ignore',
      });
    } catch (error) {
      const reviewer = options.reviewers.recordSpawnFailure({
        reviewerId,
        command: persistedCommand,
        args: persistedArgs,
        cwd: persistedCwd,
        offlineAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      });

      options.audit.append({
        eventType: 'reviewer.spawn_failed',
        createdAt,
        errorCode: 'SPAWN_FAILED',
        metadata: {
          reviewerId,
          command: persistedCommand,
          args: persistedArgs,
          cwd: persistedCwd,
          summary: `Reviewer ${reviewerId} failed to spawn.`,
        },
      });
      notifyReviewerState(options.notifications);

      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to spawn reviewer ${reviewerId}: ${message}`);
    }

    try {
      await awaitSpawn(child);
    } catch (error) {
      const failedAt = now();
      const reviewer = options.reviewers.recordSpawnFailure({
        reviewerId,
        command: persistedCommand,
        args: persistedArgs,
        cwd: persistedCwd,
        offlineAt: failedAt,
        createdAt,
        updatedAt: failedAt,
      });

      options.audit.append({
        eventType: 'reviewer.spawn_failed',
        createdAt: failedAt,
        errorCode: 'SPAWN_FAILED',
        metadata: {
          reviewerId,
          command: persistedCommand,
          args: persistedArgs,
          cwd: persistedCwd,
          summary: `Reviewer ${reviewerId} failed to spawn.`,
        },
      });
      notifyReviewerState(options.notifications);

      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to spawn reviewer ${reviewerId}: ${message}`);
    }

    const pid = child.pid;

    if (pid === undefined) {
      child.kill('SIGTERM');
      throw new Error(`Reviewer ${reviewerId} did not expose a pid after spawn.`);
    }

    const startedAt = now();
    let resolveStopped!: (reviewer: ReviewerRecord) => void;
    let rejectStopped!: (error: unknown) => void;
    const stopped = new Promise<ReviewerRecord>((resolve, reject) => {
      resolveStopped = resolve;
      rejectStopped = reject;
    });

    const trackedEntry: TrackedReviewerProcess = {
      reviewerId,
      child,
      cleanup: () => {
        child.off('exit', handleExit);
        child.off('error', handleError);
        tracked.delete(reviewerId);
      },
      stopped,
      resolveStopped,
      rejectStopped,
      requestedOfflineReason: null,
    };

    const handleExit = (exitCode: number | null, exitSignal: NodeJS.Signals | null): void => {
      void (async () => {
        try {
          const offlineAt = now();
          const offlineReason = trackedEntry.requestedOfflineReason ?? 'reviewer_exit';
          const reviewer = options.reviewers.markOffline({
            reviewerId,
            offlineAt,
            offlineReason,
            exitCode,
            exitSignal,
            lastSeenAt: offlineAt,
            updatedAt: offlineAt,
          });

          if (!reviewer) {
            throw new Error(`Reviewer ${reviewerId} disappeared before exit state could be recorded.`);
          }

          const recovery =
            offlineHandler?.({
              reviewer,
              reviewerId,
              offlineAt,
              offlineReason,
              exitCode,
              exitSignal,
            }) ?? {
              reclaimedReviewIds: [],
              staleReviewIds: [],
              unrecoverableReviewIds: [],
            };
          const recoveryResult = await recovery;

          options.audit.append({
            eventType: 'reviewer.offline',
            createdAt: offlineAt,
            metadata: {
              reviewerId,
              offlineReason,
              exitCode,
              exitSignal,
              reclaimedReviewIds: recoveryResult.reclaimedReviewIds,
              staleReviewIds: recoveryResult.staleReviewIds,
              unrecoverableReviewIds: recoveryResult.unrecoverableReviewIds,
              summary: `Reviewer ${reviewerId} went offline (${offlineReason}).`,
            },
          });
          notifyReviewerState(options.notifications);
          trackedEntry.cleanup();
          trackedEntry.resolveStopped(options.reviewers.getById(reviewerId) ?? reviewer);
        } catch (error) {
          trackedEntry.cleanup();
          trackedEntry.rejectStopped(error);
        }
      })();
    };

    const handleError = (error: Error): void => {
      trackedEntry.rejectStopped(error);
    };

    child.on('exit', handleExit);
    child.on('error', handleError);
    tracked.set(reviewerId, trackedEntry);

    try {
      const reviewer = options.reviewers.recordSpawned({
        reviewerId,
        command: persistedCommand,
        args: persistedArgs,
        cwd: persistedCwd,
        pid,
        startedAt,
        lastSeenAt: startedAt,
        createdAt,
        updatedAt: startedAt,
      });

      options.audit.append({
        eventType: 'reviewer.spawned',
        createdAt: startedAt,
        metadata: {
          reviewerId,
          command: persistedCommand,
          args: persistedArgs,
          cwd: persistedCwd,
          pid,
          summary: `Reviewer ${reviewerId} spawned with pid ${pid}.`,
        },
      });
      notifyReviewerState(options.notifications);

      return reviewer;
    } catch (error) {
      trackedEntry.cleanup();
      child.kill('SIGTERM');
      throw error;
    }
  }

  async function stopReviewer(reviewerId: string): Promise<StopReviewerResult> {
    const trackedEntry = tracked.get(reviewerId);

    if (!trackedEntry) {
      const reviewer = options.reviewers.getById(reviewerId);
      return {
        outcome: reviewer ? 'already_offline' : 'not_found',
        reviewer,
      };
    }

    if (trackedEntry.child.exitCode !== null || trackedEntry.child.signalCode !== null) {
      return {
        outcome: 'already_offline',
        reviewer: await trackedEntry.stopped,
      };
    }

    trackedEntry.requestedOfflineReason = 'operator_kill';
    const killedAt = now();
    options.audit.append({
      eventType: 'reviewer.killed',
      createdAt: killedAt,
      metadata: {
        reviewerId,
        signal: 'SIGTERM',
        summary: `Operator requested shutdown for reviewer ${reviewerId}.`,
      },
    });
    notifyReviewerState(options.notifications);

    trackedEntry.child.kill('SIGTERM');

    return {
      outcome: 'killed',
      reviewer: await trackedEntry.stopped,
    };
  }

  async function shutdown(): Promise<ReviewerShutdownSummary> {
    const requestedReviewerIds = [...tracked.keys()].sort((left, right) => left.localeCompare(right));
    const results = await Promise.all(requestedReviewerIds.map((reviewerId) => stopReviewer(reviewerId)));

    return {
      requestedReviewerIds,
      outcomes: results.reduce<Record<StopReviewerResult['outcome'], number>>(
        (counts, result) => ({
          ...counts,
          [result.outcome]: counts[result.outcome] + 1,
        }),
        {
          killed: 0,
          already_offline: 0,
          not_found: 0,
        },
      ),
    };
  }

  function inspect(): ReviewerManagerSnapshot {
    return {
      trackedReviewerIds: [...tracked.keys()].sort((left, right) => left.localeCompare(right)),
      trackedPids: [...tracked.values()]
        .map((entry) => entry.child.pid)
        .filter((pid): pid is number => typeof pid === 'number')
        .sort((left, right) => left - right),
      listenerCounts: Object.fromEntries(
        [...tracked.entries()].map(([reviewerId, entry]) => [
          reviewerId,
          {
            exit: entry.child.listenerCount('exit'),
            error: entry.child.listenerCount('error'),
          },
        ]),
      ),
    };
  }

  function setOfflineHandler(
    handler: ((event: ReviewerOfflineEvent) => Promise<ReviewerOfflineHookResult> | ReviewerOfflineHookResult) | null,
  ): void {
    offlineHandler = handler;
  }

  function close(): void {
    for (const entry of [...tracked.values()]) {
      entry.cleanup();

      if (entry.child.exitCode === null && entry.child.signalCode === null) {
        entry.child.kill('SIGTERM');
      }
    }
  }

  return {
    spawnReviewer,
    stopReviewer,
    shutdown,
    inspect,
    setOfflineHandler,
    close,
  };
}

async function awaitSpawn(child: ChildProcess): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onSpawn = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      child.off('spawn', onSpawn);
      child.off('error', onError);
    };

    child.once('spawn', onSpawn);
    child.once('error', onError);
  });
}

function sanitizeCommand(command: string): string {
  return basename(command);
}

function sanitizeArg(argument: string, workspaceRoot: string): string {
  if (!path.isAbsolute(argument)) {
    return argument;
  }

  const relative = path.relative(workspaceRoot, argument);
  return relative.startsWith('..') ? argument : normalizePath(relative);
}

function normalizePath(value: string): string {
  return value.split(path.sep).join('/');
}

function notifyReviewerState(notifications: { notify: (topic: string) => number } | undefined): void {
  notifications?.notify('reviewer-state');
}

export function ensureReviewerRecord(input: ReviewerRecord): ReviewerRecord {
  return ReviewerRecordSchema.parse(input);
}
