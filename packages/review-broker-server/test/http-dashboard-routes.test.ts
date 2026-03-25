import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

import {
  OverviewSnapshotSchema,
  SSEChangePayloadSchema,
  SSEHeartbeatPayloadSchema,
} from 'review-broker-core';

import { createAppContext } from '../src/runtime/app-context.js';
import { createBrokerService } from '../src/runtime/broker-service.js';
import { inspectBrokerRuntime, startBroker } from '../src/index.js';
import { createDashboardRoutes } from '../src/http/dashboard-routes.js';
import { createDashboardServer } from '../src/http/dashboard-server.js';

import { WORKTREE_ROOT, FIXTURE_PATH } from './test-paths.js';

const tempDirectories: string[] = [];

afterEach(() => {
  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

function createTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dashboard-routes-'));
  tempDirectories.push(dir);
  return dir;
}

function readFixture(fileName: string): string {
  return readFileSync(
    path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'test', 'fixtures', fileName),
    'utf8',
  );
}

describe('http dashboard routes', () => {
  it('serves a valid overview snapshot from a fresh broker', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({
      cwd: WORKTREE_ROOT,
      dbPath,
      handleSignals: false,
    });

    try {
      const routes = createDashboardRoutes({
        context: runtime.context,
        service: runtime.service,
        startupRecoverySnapshot: runtime.getStartupRecoverySnapshot(),
      });

      try {
        const snapshot = routes.getOverviewSnapshot();
        const parsed = OverviewSnapshotSchema.parse(snapshot);

        expect(parsed.reviews.total).toBe(0);
        expect(parsed.reviewers.total).toBe(0);
        expect(parsed.latestReview).toBeNull();
        expect(parsed.latestReviewer).toBeNull();
        expect(parsed.latestAudit).toBeNull();
        expect(parsed.startupRecovery.recoveredReviewerCount).toBe(0);
        expect(parsed.startupRecovery.reclaimedReviewCount).toBe(0);
      } finally {
        routes.dispose();
      }
    } finally {
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('reflects broker state after creating a review', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({
      cwd: WORKTREE_ROOT,
      dbPath,
      handleSignals: false,
    });

    try {
      const routes = createDashboardRoutes({
        context: runtime.context,
        service: runtime.service,
        startupRecoverySnapshot: runtime.getStartupRecoverySnapshot(),
      });

      try {
        await runtime.service.createReview({
          title: 'Dashboard route test review',
          description: 'Verify overview reflects new reviews.',
          diff: readFixture('valid-review.diff'),
          authorId: 'test-author',
          priority: 'normal',
        });

        const snapshot = routes.getOverviewSnapshot();
        const parsed = OverviewSnapshotSchema.parse(snapshot);

        expect(parsed.reviews.total).toBe(1);
        expect(parsed.reviews.pending).toBe(1);
        expect(parsed.latestReview).not.toBeNull();
        expect(parsed.latestReview?.status).toBe('pending');
        expect(parsed.latestAudit).not.toBeNull();
        expect(parsed.latestAudit?.eventType).toBe('review.created');
      } finally {
        routes.dispose();
      }
    } finally {
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('projects startup recovery from a broker with stale reviewer state', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    // First: seed stale reviewer state
    const seedContext = createAppContext({ cwd: WORKTREE_ROOT, dbPath });
    const seedService = createBrokerService(seedContext, {
      now: createNow([
        '2026-03-20T19:00:00.000Z',
        '2026-03-20T19:01:00.000Z',
        '2026-03-20T19:02:00.000Z',
        '2026-03-20T19:03:00.000Z',
      ]),
    });

    await seedService.spawnReviewer({
      reviewerId: 'stale-reviewer-1',
      command: process.execPath,
      args: [FIXTURE_PATH],
      cwd: 'packages/review-broker-server',
    });

    const created = await seedService.createReview({
      title: 'Recovery test review',
      description: 'Will be claimed by a reviewer that becomes stale.',
      diff: readFixture('valid-review.diff'),
      authorId: 'test-author',
      priority: 'high',
    });

    await seedService.claimReview({
      reviewId: created.review.reviewId,
      claimantId: 'stale-reviewer-1',
    });

    seedContext.close();

    // Second: restart broker — it should recover the stale reviewer
    const runtime = startBroker({
      cwd: WORKTREE_ROOT,
      dbPath,
      handleSignals: false,
    });

    try {
      const routes = createDashboardRoutes({
        context: runtime.context,
        service: runtime.service,
        startupRecoverySnapshot: runtime.getStartupRecoverySnapshot(),
      });

      try {
        const snapshot = routes.getOverviewSnapshot();
        const parsed = OverviewSnapshotSchema.parse(snapshot);

        expect(parsed.startupRecovery.recoveredReviewerCount).toBe(1);
        expect(parsed.startupRecovery.reclaimedReviewCount).toBe(1);
        expect(parsed.startupRecovery.staleReviewCount).toBe(0);
        expect(parsed.startupRecovery.unrecoverableReviewCount).toBe(0);
      } finally {
        routes.dispose();
      }
    } finally {
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('redacts full reviewer command path, exposing only basename', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({
      cwd: WORKTREE_ROOT,
      dbPath,
      handleSignals: false,
    });

    try {
      await runtime.service.spawnReviewer({
        reviewerId: 'redact-test-reviewer',
        command: process.execPath,
        args: [FIXTURE_PATH],
        cwd: 'packages/review-broker-server',
      });

      // Wait for the reviewer to register
      await new Promise((resolve) => setTimeout(resolve, 200));

      const routes = createDashboardRoutes({
        context: runtime.context,
        service: runtime.service,
        startupRecoverySnapshot: runtime.getStartupRecoverySnapshot(),
      });

      try {
        const snapshot = routes.getOverviewSnapshot();
        const parsed = OverviewSnapshotSchema.parse(snapshot);

        expect(parsed.latestReviewer).not.toBeNull();
        // Must expose basename only, not the full path
        expect(parsed.latestReviewer?.commandBasename).toBe(path.basename(process.execPath));
        // Must not contain any path separator
        expect(parsed.latestReviewer?.commandBasename).not.toContain('/');
      } finally {
        routes.dispose();
      }
    } finally {
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('serves the overview as JSON over HTTP', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({
      cwd: WORKTREE_ROOT,
      dbPath,
      handleSignals: false,
    });

    try {
      const routes = createDashboardRoutes({
        context: runtime.context,
        service: runtime.service,
        startupRecoverySnapshot: runtime.getStartupRecoverySnapshot(),
      });

      // Use a stub dist path — we're testing routes, not static files
      const stubDistPath = dir;

      const server = await createDashboardServer({
        dashboardDistPath: stubDistPath,
        routes,
      });

      try {
        const response = await fetch(`${server.baseUrl}/api/overview`);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('application/json');

        const body = await response.json();
        const parsed = OverviewSnapshotSchema.parse(body);
        expect(parsed.reviews.total).toBe(0);
      } finally {
        await server.close();
        routes.dispose();
      }
    } finally {
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('serves SSE events with initial heartbeat', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({
      cwd: WORKTREE_ROOT,
      dbPath,
      handleSignals: false,
    });

    try {
      const routes = createDashboardRoutes({
        context: runtime.context,
        service: runtime.service,
        startupRecoverySnapshot: runtime.getStartupRecoverySnapshot(),
      });

      const server = await createDashboardServer({
        dashboardDistPath: dir,
        routes,
      });

      try {
        const response = await fetch(`${server.baseUrl}/api/events`);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('text/event-stream');

        // Read the initial heartbeat
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();

        const { value } = await reader.read();
        const text = decoder.decode(value);

        // Should contain a heartbeat event
        expect(text).toContain('event: heartbeat');
        expect(text).toContain('"type":"heartbeat"');

        // Parse the data line
        const dataMatch = text.match(/data: (.+)\n/);
        expect(dataMatch).not.toBeNull();
        const heartbeat = SSEHeartbeatPayloadSchema.parse(JSON.parse(dataMatch![1]));
        expect(heartbeat.type).toBe('heartbeat');

        reader.cancel();
      } finally {
        await server.close();
        routes.dispose();
      }
    } finally {
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('returns 404 for unknown static paths', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({
      cwd: WORKTREE_ROOT,
      dbPath,
      handleSignals: false,
    });

    try {
      const routes = createDashboardRoutes({
        context: runtime.context,
        service: runtime.service,
        startupRecoverySnapshot: runtime.getStartupRecoverySnapshot(),
      });

      const server = await createDashboardServer({
        dashboardDistPath: dir,
        routes,
      });

      try {
        const response = await fetch(`${server.baseUrl}/nonexistent-path`);
        expect(response.status).toBe(404);
      } finally {
        await server.close();
        routes.dispose();
      }
    } finally {
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('SSE is a re-sync signal, not a second source of truth', async () => {
    // This test verifies the design contract: SSE payloads contain only
    // topic + version, not the actual state data. The browser must always
    // re-fetch the overview route to get authoritative state.
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({
      cwd: WORKTREE_ROOT,
      dbPath,
      handleSignals: false,
    });

    try {
      const routes = createDashboardRoutes({
        context: runtime.context,
        service: runtime.service,
        startupRecoverySnapshot: runtime.getStartupRecoverySnapshot(),
      });

      const server = await createDashboardServer({
        dashboardDistPath: dir,
        routes,
      });

      try {
        const response = await fetch(`${server.baseUrl}/api/events`);
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();

        // Read initial heartbeat
        await reader.read();

        // Trigger a broker mutation
        await runtime.service.createReview({
          title: 'SSE signal test',
          description: 'Verify SSE sends signal, not state.',
          diff: readFixture('valid-review.diff'),
          authorId: 'test-author',
          priority: 'normal',
        });

        // Wait for the notification interval to fire
        await new Promise((resolve) => setTimeout(resolve, 400));

        // Read whatever SSE data arrived
        const { value, done } = await reader.read();

        if (!done && value) {
          const text = decoder.decode(value);
          // Any change events should only contain topic + version, no state data
          const lines = text.split('\n').filter((l) => l.startsWith('data: '));

          for (const line of lines) {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'change') {
              const parsed = SSEChangePayloadSchema.parse(data);
              // The change payload must only contain type, topic, version — no review data
              expect(Object.keys(parsed).sort()).toEqual(['topic', 'type', 'version']);
            }
          }
        }

        reader.cancel();
      } finally {
        await server.close();
        routes.dispose();
      }
    } finally {
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });
});

function createNow(timestamps: string[]): () => string {
  const queue = [...timestamps];
  return () => queue.shift() ?? new Date().toISOString();
}
