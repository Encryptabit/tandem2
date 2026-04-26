import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { createAppContext } from '../src/runtime/app-context.js';
import { createBrokerService } from '../src/runtime/broker-service.js';

import { CLI_PATH, REVIEWER_FIXTURE_PATH, TSX_PATH, WORKTREE_ROOT } from './test-paths.js';
const tempDirectories: string[] = [];

afterEach(() => {
  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();

    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe('review-broker-server standalone start command', () => {
  it('starts through the real CLI entrypoint in smoke mode, proves startup recovery, and surfaces redaction-safe reviewer diagnostics', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-smoke-'));
    tempDirectories.push(directory);

    const dbPath = path.join(directory, 'smoke.sqlite');

    const firstRun = runSmokeCommand(dbPath);
    expect(firstRun.status).toBe(0);

    const firstEvents = parseJsonLines(firstRun.stdout);
    expect(firstEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'broker.started',
          mode: 'once',
          dbPath: path.resolve(dbPath),
          migrations: [
            '001_init',
            '002_review_lifecycle_parity',
            '003_reviewer_lifecycle',
            '004_pool_management',
            '005_review_project_identity',
          ],
          startupRecovery: expect.objectContaining({
            recoveredReviewerIds: [],
            reclaimedReviewIds: [],
            staleReviewIds: [],
            unrecoverableReviewIds: [],
            reviewers: [],
          }),
        }),
        expect.objectContaining({
          event: 'broker.once_complete',
          dbPath: path.resolve(dbPath),
          reviewCount: 0,
          reviewerCount: 0,
          trackedReviewerCount: 0,
          reviewerStatusCounts: {},
          messageCount: 0,
          auditEventCount: 0,
          migrationCount: 5,
          statusCounts: {},
          counterPatchStatusCounts: {},
          latestReview: null,
          latestReviewer: null,
          latestMessage: null,
          latestAuditEvent: null,
          startupRecovery: expect.objectContaining({
            recoveredReviewerIds: [],
            reclaimedReviewIds: [],
            staleReviewIds: [],
            unrecoverableReviewIds: [],
            reviewers: [],
          }),
        }),
      ]),
    );

    const seededReviewId = await seedStaleReviewerState(dbPath);
    const secondRun = runSmokeCommand(dbPath);

    expect(secondRun.status).toBe(0);

    const secondEvents = parseJsonLines(secondRun.stdout);
    expect(secondEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'broker.started',
          mode: 'once',
          dbPath: path.resolve(dbPath),
          migrations: [
            '001_init',
            '002_review_lifecycle_parity',
            '003_reviewer_lifecycle',
            '004_pool_management',
            '005_review_project_identity',
          ],
          startupRecovery: expect.objectContaining({
            recoveredReviewerIds: ['smoke-reviewer-1'],
            reclaimedReviewIds: [seededReviewId],
            staleReviewIds: [],
            unrecoverableReviewIds: [],
            reviewers: [
              {
                reviewerId: 'smoke-reviewer-1',
                reclaimedReviewIds: [seededReviewId],
                staleReviewIds: [],
                unrecoverableReviewIds: [],
              },
            ],
          }),
        }),
        expect.objectContaining({
          event: 'broker.once_complete',
          dbPath: path.resolve(dbPath),
          reviewCount: 1,
          reviewerCount: 1,
          trackedReviewerCount: 0,
          reviewerStatusCounts: {
            offline: 1,
          },
          messageCount: 0,
          auditEventCount: 5,
          migrationCount: 5,
          statusCounts: {
            pending: 1,
          },
          counterPatchStatusCounts: {
            none: 1,
          },
          latestReview: expect.objectContaining({
            reviewId: seededReviewId,
            status: 'pending',
            currentRound: 1,
            latestVerdict: null,
            verdictReason: null,
            counterPatchStatus: 'none',
          }),
          latestReviewer: expect.objectContaining({
            reviewerId: 'smoke-reviewer-1',
            status: 'offline',
            currentReviewId: null,
            command: path.basename(process.execPath),
            args: ['test/fixtures/reviewer-worker.mjs'],
            cwd: 'packages/review-broker-server',
            pid: null,
            offlineReason: 'startup_recovery',
          }),
          latestMessage: null,
          latestAuditEvent: expect.objectContaining({
            eventType: expect.stringMatching(/^(review\.reclaimed|reviewer\.offline)$/),
            metadata: expect.objectContaining({
              reviewerId: 'smoke-reviewer-1',
            }),
          }),
          startupRecovery: expect.objectContaining({
            recoveredReviewerIds: ['smoke-reviewer-1'],
            reclaimedReviewIds: [seededReviewId],
            staleReviewIds: [],
            unrecoverableReviewIds: [],
            reviewers: [
              {
                reviewerId: 'smoke-reviewer-1',
                reclaimedReviewIds: [seededReviewId],
                staleReviewIds: [],
                unrecoverableReviewIds: [],
              },
            ],
          }),
        }),
      ]),
    );

    const db = new Database(dbPath, { readonly: true, fileMustExist: true });

    try {
      const migrationCount = db.prepare<unknown[], { count: number }>('SELECT COUNT(*) as count FROM schema_migrations').get();
      const reviewRow = db
        .prepare<
          [string],
          {
            status: string;
            claimed_by: string | null;
            claim_generation: number;
            counter_patch_status: string;
          }
        >(
          `
            SELECT status, claimed_by, claim_generation, counter_patch_status
            FROM reviews
            WHERE review_id = ?
          `,
        )
        .get(seededReviewId);
      const reviewerRow = db
        .prepare<
          [string],
          {
            command: string;
            args_json: string;
            cwd: string | null;
            pid: number | null;
            offline_reason: string | null;
          }
        >(
          `
            SELECT command, args_json, cwd, pid, offline_reason
            FROM reviewers
            WHERE reviewer_id = ?
          `,
        )
        .get('smoke-reviewer-1');
      const auditRows = db
        .prepare<unknown[], { event_type: string; review_id: string | null; metadata_json: string }>(
          `
            SELECT event_type, review_id, metadata_json
            FROM audit_events
            ORDER BY audit_event_id ASC
          `,
        )
        .all();

      expect(migrationCount?.count).toBe(5);
      expect(reviewRow).toMatchObject({
        status: 'pending',
        claimed_by: null,
        claim_generation: 2,
        counter_patch_status: 'none',
      });
      expect(reviewerRow).toMatchObject({
        command: path.basename(process.execPath),
        cwd: 'packages/review-broker-server',
        pid: null,
        offline_reason: 'startup_recovery',
      });
      expect(JSON.parse(reviewerRow!.args_json)).toEqual(['test/fixtures/reviewer-worker.mjs']);
      expect(auditRows.map((row) => row.event_type)).toEqual([
        'reviewer.spawned',
        'review.created',
        'review.claimed',
        'review.reclaimed',
        'reviewer.offline',
      ]);
      expect(JSON.parse(auditRows.at(-2)!.metadata_json)).toMatchObject({
        reviewId: seededReviewId,
        reviewerId: 'smoke-reviewer-1',
        reclaimCause: 'startup_recovery',
      });
      expect(JSON.parse(auditRows.at(-1)!.metadata_json)).toMatchObject({
        reviewerId: 'smoke-reviewer-1',
        offlineReason: 'startup_recovery',
        reclaimedReviewIds: [seededReviewId],
      });
    } finally {
      db.close();
    }
  });
});

describe('review-broker-server dashboard mode', () => {
  it('starts the broker with --dashboard flag, emits dashboard_ready event with URL, and serves the overview API', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-dashboard-smoke-'));
    tempDirectories.push(directory);

    const dbPath = path.join(directory, 'dashboard-smoke.sqlite');

    const { spawn } = await import('node:child_process');
    const child = spawn(TSX_PATH, [CLI_PATH, '--db-path', dbPath, '--dashboard', '--dashboard-port', '0'], {
      cwd: WORKTREE_ROOT,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    try {
      // Collect stdout lines until we get dashboard_ready
      const dashboardReadyEvent = await new Promise<Record<string, unknown>>((resolve, reject) => {
        let buffer = '';
        const timeout = setTimeout(() => {
          reject(new Error('Timed out waiting for broker.dashboard_ready event'));
        }, 15_000);

        child.stdout!.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length === 0) continue;
            try {
              const event = JSON.parse(trimmed) as Record<string, unknown>;
              if (event.event === 'broker.dashboard_ready') {
                clearTimeout(timeout);
                resolve(event);
              }
            } catch {
              // non-JSON line, skip
            }
          }
        });

        child.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });

        child.on('exit', (code) => {
          clearTimeout(timeout);
          reject(new Error(`Broker exited with code ${code} before emitting dashboard_ready`));
        });
      });

      // Verify the dashboard_ready event shape
      expect(dashboardReadyEvent).toMatchObject({
        event: 'broker.dashboard_ready',
        url: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+$/),
        port: expect.any(Number),
        dashboardDistPath: expect.stringContaining('review-broker-dashboard/dist'),
        pool: expect.objectContaining({
          enabled: false,
        }),
      });

      const baseUrl = dashboardReadyEvent.url as string;

      // Verify the overview API is accessible
      const apiRes = await fetch(`${baseUrl}/api/overview`);
      expect(apiRes.status).toBe(200);
      const snapshot = await apiRes.json();
      expect(snapshot).toMatchObject({
        snapshotVersion: expect.any(Number),
        reviews: expect.objectContaining({ total: 0 }),
        reviewers: expect.objectContaining({ total: 0 }),
        pool: expect.objectContaining({ enabled: false }),
      });

      // Verify the dashboard page is mounted
      const pageRes = await fetch(`${baseUrl}/`);
      expect(pageRes.status).toBe(200);
      const html = await pageRes.text();
      expect(html).toContain('Review Broker');
    } finally {
      child.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        child.on('exit', () => resolve());
        setTimeout(resolve, 3000);
      });
    }
  });
});

function runSmokeCommand(dbPath: string): ReturnType<typeof spawnSync> {
  return spawnSync(TSX_PATH, [CLI_PATH, '--db-path', dbPath, '--once'], {
    cwd: WORKTREE_ROOT,
    encoding: 'utf8',
    env: process.env,
  });
}

async function seedStaleReviewerState(dbPath: string): Promise<string> {
  const context = createAppContext({
    cwd: WORKTREE_ROOT,
    dbPath,
  });
  const service = createBrokerService(context, {
    now: createNow([
      '2026-03-20T19:00:00.000Z',
      '2026-03-20T19:01:00.000Z',
      '2026-03-20T19:02:00.000Z',
      '2026-03-20T19:03:00.000Z',
      '2026-03-20T19:04:00.000Z',
    ]),
  });

  try {
    await service.spawnReviewer({
      reviewerId: 'smoke-reviewer-1',
      command: process.execPath,
      args: [REVIEWER_FIXTURE_PATH],
      cwd: 'packages/review-broker-server',
    });

    const created = await service.createReview({
      title: 'CLI smoke startup recovery review',
      description: 'Persist a stale reviewer claim so once-mode can prove startup recovery.',
      diff: readFixture('valid-review.diff'),
      authorId: 'agent-author',
      priority: 'high',
    });

    await service.claimReview({
      reviewId: created.review.reviewId,
      claimantId: 'smoke-reviewer-1',
    });

    context.close();
    return created.review.reviewId;
  } catch (error) {
    context.close();
    throw error;
  }
}

function createNow(timestamps: string[]): () => string {
  const queue = [...timestamps];
  return () => queue.shift() ?? new Date().toISOString();
}

function parseJsonLines(output: string): Array<Record<string, unknown>> {
  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function readFixture(fileName: string): string {
  return readFileSync(path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'test', 'fixtures', fileName), 'utf8');
}
