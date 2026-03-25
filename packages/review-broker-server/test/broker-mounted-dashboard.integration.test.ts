import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  OverviewSnapshotSchema,
  SSEChangePayloadSchema,
  EventFeedResponseSchema,
  ReviewListResponseSchema,
  ReviewDetailResponseSchema,
} from 'review-broker-core';

import { createAppContext } from '../src/runtime/app-context.js';
import { createBrokerService } from '../src/runtime/broker-service.js';
import { startBroker } from '../src/index.js';
import { createDashboardRoutes } from '../src/http/dashboard-routes.js';
import { createDashboardServer, type DashboardServer } from '../src/http/dashboard-server.js';

import { WORKTREE_ROOT, FIXTURE_PATH, DASHBOARD_DIST_PATH } from './test-paths.js';

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
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mounted-dashboard-'));
  tempDirectories.push(dir);
  return dir;
}

function readFixture(fileName: string): string {
  return readFileSync(
    path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'test', 'fixtures', fileName),
    'utf8',
  );
}

/** Dashboard dist path — uses the real Astro build output (imported from test-paths). */

describe('broker-mounted dashboard integration', { sequential: true }, () => {
  it('serves the overview page and API from a single broker HTTP server', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({
      cwd: WORKTREE_ROOT,
      dbPath,
      handleSignals: false,
    });

    const routes = createDashboardRoutes({
      context: runtime.context,
      service: runtime.service,
      startupRecoverySnapshot: runtime.getStartupRecoverySnapshot(),
    });

    const server = await createDashboardServer({
      dashboardDistPath: DASHBOARD_DIST_PATH,
      routes,
    });

    try {
      // 1. Verify the mounted page is served
      const pageRes = await fetch(`${server.baseUrl}/`);
      expect(pageRes.status).toBe(200);
      const html = await pageRes.text();
      expect(html).toContain('Review Broker');
      expect(html).toContain('overview-root');

      // 2. Verify the overview API returns schema-valid data
      const apiRes = await fetch(`${server.baseUrl}/api/overview`);
      expect(apiRes.status).toBe(200);
      const snapshot = await apiRes.json();
      const parsed = OverviewSnapshotSchema.parse(snapshot);
      expect(parsed.reviews.total).toBe(0);
      expect(parsed.reviewers.total).toBe(0);
    } finally {
      await server.close();
      routes.dispose();
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('overview reflects broker state after creating a review', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({
      cwd: WORKTREE_ROOT,
      dbPath,
      handleSignals: false,
    });

    const routes = createDashboardRoutes({
      context: runtime.context,
      service: runtime.service,
      startupRecoverySnapshot: runtime.getStartupRecoverySnapshot(),
    });

    const server = await createDashboardServer({
      dashboardDistPath: DASHBOARD_DIST_PATH,
      routes,
    });

    try {
      // Create a review
      await runtime.service.createReview({
        title: 'Integration test review',
        description: 'Verify overview updates after mutation.',
        diff: readFixture('valid-review.diff'),
        authorId: 'test-author',
        priority: 'normal',
      });

      // Fetch overview — should reflect the new review
      const apiRes = await fetch(`${server.baseUrl}/api/overview`);
      const snapshot = OverviewSnapshotSchema.parse(await apiRes.json());

      expect(snapshot.reviews.total).toBe(1);
      expect(snapshot.reviews.pending).toBe(1);
      expect(snapshot.latestReview).not.toBeNull();
      expect(snapshot.latestReview!.status).toBe('pending');
      expect(snapshot.latestAudit).not.toBeNull();
      expect(snapshot.latestAudit!.eventType).toBe('review.created');
    } finally {
      await server.close();
      routes.dispose();
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('SSE notifies after a broker mutation so the client can re-fetch', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({
      cwd: WORKTREE_ROOT,
      dbPath,
      handleSignals: false,
    });

    const routes = createDashboardRoutes({
      context: runtime.context,
      service: runtime.service,
      startupRecoverySnapshot: runtime.getStartupRecoverySnapshot(),
    });

    const server = await createDashboardServer({
      dashboardDistPath: DASHBOARD_DIST_PATH,
      routes,
    });

    try {
      // Connect to SSE stream
      const sseRes = await fetch(`${server.baseUrl}/api/events`);
      const reader = sseRes.body!.getReader();
      const decoder = new TextDecoder();

      // Read initial heartbeat
      const heartbeatChunk = await reader.read();
      const heartbeatText = decoder.decode(heartbeatChunk.value);
      expect(heartbeatText).toContain('event: heartbeat');

      // Mutate broker state
      await runtime.service.createReview({
        title: 'SSE notification test',
        description: 'Should trigger a change event on the SSE stream.',
        diff: readFixture('valid-review.diff'),
        authorId: 'test-author',
        priority: 'normal',
      });

      // Wait for the notification polling interval to fire
      await new Promise((resolve) => setTimeout(resolve, 400));

      // Read change events
      const changeChunk = await reader.read();
      if (!changeChunk.done && changeChunk.value) {
        const text = decoder.decode(changeChunk.value);
        expect(text).toContain('event: change');

        const dataLines = text.split('\n').filter((l) => l.startsWith('data: '));
        for (const line of dataLines) {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'change') {
            const parsed = SSEChangePayloadSchema.parse(data);
            // SSE carries only topic + version, never state data
            expect(Object.keys(parsed).sort()).toEqual(['topic', 'type', 'version']);
          }
        }
      }

      // Re-fetch overview after SSE notification — should show the new review
      const apiRes = await fetch(`${server.baseUrl}/api/overview`);
      const snapshot = OverviewSnapshotSchema.parse(await apiRes.json());
      expect(snapshot.reviews.total).toBe(1);
      expect(snapshot.reviews.pending).toBe(1);

      reader.cancel();
    } finally {
      await server.close();
      routes.dispose();
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('overview projection includes startup recovery state', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    // Seed stale reviewer state
    const seedContext = createAppContext({ cwd: WORKTREE_ROOT, dbPath });
    const seedService = createBrokerService(seedContext, {
      now: createNow([
        '2026-03-20T10:00:00.000Z',
        '2026-03-20T10:01:00.000Z',
        '2026-03-20T10:02:00.000Z',
        '2026-03-20T10:03:00.000Z',
      ]),
    });

    await seedService.spawnReviewer({
      reviewerId: 'stale-reviewer-int',
      command: process.execPath,
      args: [FIXTURE_PATH],
      cwd: 'packages/review-broker-server',
    });

    const created = await seedService.createReview({
      title: 'Recovery integration review',
      description: 'Will be claimed by a reviewer that becomes stale.',
      diff: readFixture('valid-review.diff'),
      authorId: 'test-author',
      priority: 'high',
    });

    await seedService.claimReview({
      reviewId: created.review.reviewId,
      claimantId: 'stale-reviewer-int',
    });

    seedContext.close();

    // Restart broker — it should recover stale state
    const runtime = startBroker({
      cwd: WORKTREE_ROOT,
      dbPath,
      handleSignals: false,
    });

    const routes = createDashboardRoutes({
      context: runtime.context,
      service: runtime.service,
      startupRecoverySnapshot: runtime.getStartupRecoverySnapshot(),
    });

    const server = await createDashboardServer({
      dashboardDistPath: DASHBOARD_DIST_PATH,
      routes,
    });

    try {
      const apiRes = await fetch(`${server.baseUrl}/api/overview`);
      const snapshot = OverviewSnapshotSchema.parse(await apiRes.json());

      expect(snapshot.startupRecovery.recoveredReviewerCount).toBe(1);
      expect(snapshot.startupRecovery.reclaimedReviewCount).toBe(1);
      expect(snapshot.startupRecovery.staleReviewCount).toBe(0);
      expect(snapshot.startupRecovery.unrecoverableReviewCount).toBe(0);
    } finally {
      await server.close();
      routes.dispose();
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('returns 404 for unknown static paths on the mounted server', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({
      cwd: WORKTREE_ROOT,
      dbPath,
      handleSignals: false,
    });

    const routes = createDashboardRoutes({
      context: runtime.context,
      service: runtime.service,
      startupRecoverySnapshot: runtime.getStartupRecoverySnapshot(),
    });

    const server = await createDashboardServer({
      dashboardDistPath: DASHBOARD_DIST_PATH,
      routes,
    });

    try {
      const res = await fetch(`${server.baseUrl}/nonexistent-path`);
      expect(res.status).toBe(404);
    } finally {
      await server.close();
      routes.dispose();
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('overview snapshot version increments after broker mutations', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({
      cwd: WORKTREE_ROOT,
      dbPath,
      handleSignals: false,
    });

    const routes = createDashboardRoutes({
      context: runtime.context,
      service: runtime.service,
      startupRecoverySnapshot: runtime.getStartupRecoverySnapshot(),
    });

    const server = await createDashboardServer({
      dashboardDistPath: DASHBOARD_DIST_PATH,
      routes,
    });

    try {
      // Get initial snapshot version
      const res1 = await fetch(`${server.baseUrl}/api/overview`);
      const snap1 = OverviewSnapshotSchema.parse(await res1.json());
      const v1 = snap1.snapshotVersion;

      // Mutate broker
      await runtime.service.createReview({
        title: 'Version increment test',
        description: 'Verify snapshot version advances.',
        diff: readFixture('valid-review.diff'),
        authorId: 'test-author',
        priority: 'normal',
      });

      // Wait for notification polling
      await new Promise((resolve) => setTimeout(resolve, 400));

      // Fetch again — version must be higher
      const res2 = await fetch(`${server.baseUrl}/api/overview`);
      const snap2 = OverviewSnapshotSchema.parse(await res2.json());

      expect(snap2.snapshotVersion).toBeGreaterThan(v1);
      expect(snap2.reviews.total).toBe(1);
    } finally {
      await server.close();
      routes.dispose();
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });
});

describe('event feed integration', { sequential: true }, () => {
  it('event feed returns events after real broker mutations', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({ cwd: WORKTREE_ROOT, dbPath, handleSignals: false });

    const routes = createDashboardRoutes({
      context: runtime.context,
      service: runtime.service,
      startupRecoverySnapshot: runtime.getStartupRecoverySnapshot(),
    });

    const server = await createDashboardServer({
      dashboardDistPath: DASHBOARD_DIST_PATH,
      routes,
    });

    try {
      // Create a review
      await runtime.service.createReview({
        title: 'Event feed integration review',
        description: 'Verify event feed returns events after mutations.',
        diff: readFixture('valid-review.diff'),
        authorId: 'test-author',
        priority: 'normal',
      });

      const response = await fetch(`${server.baseUrl}/api/events/feed`);
      expect(response.status).toBe(200);

      const body = await response.json();
      const parsed = EventFeedResponseSchema.parse(body);

      // Should have at least one event
      expect(parsed.events.length).toBeGreaterThanOrEqual(1);

      // Should contain a review.created event
      const createdEvents = parsed.events.filter((e) => e.eventType === 'review.created');
      expect(createdEvents.length).toBeGreaterThanOrEqual(1);
      expect(createdEvents[0].reviewId).toBeTruthy();
    } finally {
      await server.close();
      routes.dispose();
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('event feed pagination works across real broker activity', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({ cwd: WORKTREE_ROOT, dbPath, handleSignals: false });

    const routes = createDashboardRoutes({
      context: runtime.context,
      service: runtime.service,
      startupRecoverySnapshot: runtime.getStartupRecoverySnapshot(),
    });

    const server = await createDashboardServer({
      dashboardDistPath: DASHBOARD_DIST_PATH,
      routes,
    });

    try {
      // Create multiple reviews to produce several audit events
      for (let i = 0; i < 3; i++) {
        await runtime.service.createReview({
          title: `Pagination integration review ${i + 1}`,
          description: 'Test event feed pagination via HTTP.',
          diff: readFixture('valid-review.diff'),
          authorId: 'test-author',
          priority: 'normal',
        });
      }

      // First page
      const res1 = await fetch(`${server.baseUrl}/api/events/feed?limit=2`);
      const page1 = EventFeedResponseSchema.parse(await res1.json());
      expect(page1.events).toHaveLength(2);
      expect(page1.hasMore).toBe(true);

      // Second page via cursor
      const cursor = page1.events[page1.events.length - 1].auditEventId;
      const res2 = await fetch(`${server.baseUrl}/api/events/feed?limit=2&before=${cursor}`);
      const page2 = EventFeedResponseSchema.parse(await res2.json());
      expect(page2.events.length).toBeGreaterThanOrEqual(1);

      // Verify continuity: page 2 IDs are all smaller than the cursor
      for (const event of page2.events) {
        expect(event.auditEventId).toBeLessThan(cursor);
      }

      // Verify no overlap
      const page1Ids = new Set(page1.events.map((e) => e.auditEventId));
      for (const event of page2.events) {
        expect(page1Ids.has(event.auditEventId)).toBe(false);
      }
    } finally {
      await server.close();
      routes.dispose();
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });
});

describe('review list/detail integration', { sequential: true }, () => {
  it('review list returns reviews after creating reviews via broker service', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({ cwd: WORKTREE_ROOT, dbPath, handleSignals: false });

    const routes = createDashboardRoutes({
      context: runtime.context,
      service: runtime.service,
      startupRecoverySnapshot: runtime.getStartupRecoverySnapshot(),
    });

    const server = await createDashboardServer({
      dashboardDistPath: DASHBOARD_DIST_PATH,
      routes,
    });

    try {
      // Create two reviews
      const r1 = await runtime.service.createReview({
        title: 'Review list integration A',
        description: 'First review for list test.',
        diff: readFixture('valid-review.diff'),
        authorId: 'test-author-a',
        priority: 'normal',
      });

      const r2 = await runtime.service.createReview({
        title: 'Review list integration B',
        description: 'Second review for list test.',
        diff: readFixture('valid-review.diff'),
        authorId: 'test-author-b',
        priority: 'high',
      });

      // Fetch review list
      const res = await fetch(`${server.baseUrl}/api/reviews`);
      expect(res.status).toBe(200);

      const body = await res.json();
      const parsed = ReviewListResponseSchema.parse(body);

      expect(parsed.reviews).toHaveLength(2);
      expect(parsed.hasMore).toBe(false);

      // Verify both reviews are present with expected fields
      const ids = parsed.reviews.map((r) => r.reviewId);
      expect(ids).toContain(r1.review.reviewId);
      expect(ids).toContain(r2.review.reviewId);

      for (const review of parsed.reviews) {
        expect(review.status).toBe('pending');
        expect(review.title).toBeTruthy();
      }
    } finally {
      await server.close();
      routes.dispose();
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('review detail returns composite data with proposal, discussion, and redacted activity', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({ cwd: WORKTREE_ROOT, dbPath, handleSignals: false });

    const routes = createDashboardRoutes({
      context: runtime.context,
      service: runtime.service,
      startupRecoverySnapshot: runtime.getStartupRecoverySnapshot(),
    });

    const server = await createDashboardServer({
      dashboardDistPath: DASHBOARD_DIST_PATH,
      routes,
    });

    try {
      // Create a review
      const created = await runtime.service.createReview({
        title: 'Detail integration review',
        description: 'Verify composite detail response.',
        diff: readFixture('valid-review.diff'),
        authorId: 'test-author',
        priority: 'normal',
      });

      const reviewId = created.review.reviewId;

      // Add a discussion message
      await runtime.service.addMessage({
        reviewId,
        actorId: 'test-author',
        body: 'This is a test discussion message.',
      });

      // Fetch review detail
      const res = await fetch(`${server.baseUrl}/api/reviews/${reviewId}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      const parsed = ReviewDetailResponseSchema.parse(body);

      // Review fields
      expect(parsed.review.reviewId).toBe(reviewId);
      expect(parsed.review.title).toBe('Detail integration review');
      expect(parsed.review.status).toBe('pending');

      // Proposal fields
      expect(parsed.proposal.title).toBeTruthy();
      expect(parsed.proposal.diff).toBeTruthy();

      // Discussion
      expect(parsed.discussion).toHaveLength(1);
      expect(parsed.discussion[0].body).toBe('This is a test discussion message.');

      // Activity — should have at least creation + message events
      expect(parsed.activity.length).toBeGreaterThanOrEqual(1);

      // Redaction: no activity entry should have a metadata field
      for (const entry of parsed.activity) {
        expect(entry).not.toHaveProperty('metadata');
      }

      // Belt-and-suspenders: stringify entire response and check for leaked keys
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain('"command"');
      expect(serialized).not.toContain('"args"');
      expect(serialized).not.toContain('"cwd"');
      expect(serialized).not.toContain('"workspaceRoot"');
      expect(serialized).not.toContain('"metadata"');
    } finally {
      await server.close();
      routes.dispose();
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('review detail returns 404 for unknown review ID', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({ cwd: WORKTREE_ROOT, dbPath, handleSignals: false });

    const routes = createDashboardRoutes({
      context: runtime.context,
      service: runtime.service,
      startupRecoverySnapshot: runtime.getStartupRecoverySnapshot(),
    });

    const server = await createDashboardServer({
      dashboardDistPath: DASHBOARD_DIST_PATH,
      routes,
    });

    try {
      const res = await fetch(`${server.baseUrl}/api/reviews/nonexistent-id`);
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBeTruthy();
    } finally {
      await server.close();
      routes.dispose();
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('reviews page is served from mounted dashboard', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({ cwd: WORKTREE_ROOT, dbPath, handleSignals: false });

    const routes = createDashboardRoutes({
      context: runtime.context,
      service: runtime.service,
      startupRecoverySnapshot: runtime.getStartupRecoverySnapshot(),
    });

    const server = await createDashboardServer({
      dashboardDistPath: DASHBOARD_DIST_PATH,
      routes,
    });

    try {
      const res = await fetch(`${server.baseUrl}/reviews/`);
      expect(res.status).toBe(200);

      const html = await res.text();
      // Should contain the reviews page marker
      expect(html).toContain('reviews-root');
    } finally {
      await server.close();
      routes.dispose();
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });
});

function createNow(timestamps: string[]): () => string {
  const queue = [...timestamps];
  return () => queue.shift() ?? new Date().toISOString();
}
