/**
 * Cross-surface acceptance test suite — final-assembly proof for M004.
 *
 * Exercises all three dashboard surfaces (overview, events, reviews)
 * against one real SQLite-backed broker instance. Verifies cross-surface
 * coherence after mutations, SSE notification → re-sync, reload coherence,
 * and startup-recovery visibility.
 *
 * Observability: test failures surface via Vitest assertions with schema
 * validation errors. Each test verifies belt-and-suspenders redaction
 * (no metadata/command/args/cwd/workspaceRoot leaks) across all API surfaces.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const tempDirectories: string[] = [];
const servers: DashboardServer[] = [];

afterEach(async () => {
  // Close any servers that weren't cleaned up (test failure path)
  for (const s of servers) {
    try { await s.close(); } catch { /* already closed */ }
  }
  servers.length = 0;

  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

function createTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'acceptance-'));
  tempDirectories.push(dir);
  return dir;
}

function readFixture(fileName: string): string {
  return readFileSync(
    path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'test', 'fixtures', fileName),
    'utf8',
  );
}

function createNow(timestamps: string[]): () => string {
  const queue = [...timestamps];
  return () => queue.shift() ?? new Date().toISOString();
}

/** Redaction-safe metadata leak check across a serialized response body. */
function assertNoMetadataLeaks(body: unknown): void {
  const serialized = JSON.stringify(body);
  expect(serialized).not.toContain('"metadata"');
  expect(serialized).not.toContain('"command"');
  expect(serialized).not.toContain('"args"');
  expect(serialized).not.toContain('"cwd"');
  expect(serialized).not.toContain('"workspaceRoot"');
}

// ---------------------------------------------------------------------------
// Cross-surface acceptance tests
// ---------------------------------------------------------------------------

describe('cross-surface acceptance', () => {
  it('all three pages serve from one broker', async () => {
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
    servers.push(server);

    try {
      // Overview page (/)
      const overviewRes = await fetch(`${server.baseUrl}/`);
      expect(overviewRes.status).toBe(200);
      const overviewHtml = await overviewRes.text();
      expect(overviewHtml).toContain('overview-root');

      // Events page (/events/)
      const eventsRes = await fetch(`${server.baseUrl}/events/`);
      expect(eventsRes.status).toBe(200);
      const eventsHtml = await eventsRes.text();
      expect(eventsHtml).toContain('events-list');

      // Reviews page (/reviews/)
      const reviewsRes = await fetch(`${server.baseUrl}/reviews/`);
      expect(reviewsRes.status).toBe(200);
      const reviewsHtml = await reviewsRes.text();
      expect(reviewsHtml).toContain('reviews-root');
    } finally {
      await server.close();
      routes.dispose();
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('cross-surface coherence after mutations', async () => {
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
    servers.push(server);

    try {
      // Mutate: create a review and add a discussion message
      const created = await runtime.service.createReview({
        title: 'Acceptance coherence review',
        description: 'Cross-surface coherence proof.',
        diff: readFixture('valid-review.diff'),
        authorId: 'acceptance-author',
        priority: 'normal',
      });
      const reviewId = created.review.reviewId;

      await runtime.service.addMessage({
        reviewId,
        actorId: 'acceptance-author',
        body: 'Acceptance discussion message.',
      });

      // --- Overview API ---
      const overviewRes = await fetch(`${server.baseUrl}/api/overview`);
      expect(overviewRes.status).toBe(200);
      const overviewBody = await overviewRes.json();
      const overview = OverviewSnapshotSchema.parse(overviewBody);
      expect(overview.reviews.total).toBe(1);
      expect(overview.reviews.pending).toBe(1);

      // --- Event Feed API ---
      const feedRes = await fetch(`${server.baseUrl}/api/events/feed`);
      expect(feedRes.status).toBe(200);
      const feedBody = await feedRes.json();
      const feed = EventFeedResponseSchema.parse(feedBody);
      const createdEvents = feed.events.filter((e) => e.eventType === 'review.created');
      expect(createdEvents.length).toBeGreaterThanOrEqual(1);
      expect(createdEvents[0].reviewId).toBe(reviewId);
      // Belt-and-suspenders: no metadata leaks in feed
      assertNoMetadataLeaks(feedBody);

      // --- Review List API ---
      const listRes = await fetch(`${server.baseUrl}/api/reviews`);
      expect(listRes.status).toBe(200);
      const listBody = await listRes.json();
      const list = ReviewListResponseSchema.parse(listBody);
      expect(list.reviews).toHaveLength(1);
      expect(list.reviews[0].reviewId).toBe(reviewId);
      expect(list.reviews[0].status).toBe('pending');

      // --- Review Detail API ---
      const detailRes = await fetch(`${server.baseUrl}/api/reviews/${reviewId}`);
      expect(detailRes.status).toBe(200);
      const detailBody = await detailRes.json();
      const detail = ReviewDetailResponseSchema.parse(detailBody);
      expect(detail.review.reviewId).toBe(reviewId);
      expect(detail.proposal.title).toBe('Acceptance coherence review');
      expect(detail.discussion).toHaveLength(1);
      expect(detail.discussion[0].body).toBe('Acceptance discussion message.');
      expect(detail.activity.length).toBeGreaterThanOrEqual(1);

      // Belt-and-suspenders: no metadata leaks in detail
      assertNoMetadataLeaks(detailBody);
      for (const entry of detail.activity) {
        expect(entry).not.toHaveProperty('metadata');
      }
    } finally {
      await server.close();
      routes.dispose();
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('SSE notification triggers re-sync of overview', async () => {
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
    servers.push(server);

    try {
      // Connect SSE
      const sseRes = await fetch(`${server.baseUrl}/api/events`);
      const reader = sseRes.body!.getReader();
      const decoder = new TextDecoder();

      // Consume initial heartbeat
      const heartbeatChunk = await reader.read();
      const heartbeatText = decoder.decode(heartbeatChunk.value);
      expect(heartbeatText).toContain('event: heartbeat');

      // Mutate broker state
      await runtime.service.createReview({
        title: 'SSE acceptance test',
        description: 'Should trigger SSE change event.',
        diff: readFixture('valid-review.diff'),
        authorId: 'sse-author',
        priority: 'normal',
      });

      // Wait for notification polling interval (250ms interval + margin)
      await new Promise((resolve) => setTimeout(resolve, 400));

      // Read change event
      const changeChunk = await reader.read();
      if (!changeChunk.done && changeChunk.value) {
        const text = decoder.decode(changeChunk.value);
        expect(text).toContain('event: change');

        // Verify SSE payload shape: only type/topic/version
        const dataLines = text.split('\n').filter((l) => l.startsWith('data: '));
        for (const line of dataLines) {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'change') {
            const parsed = SSEChangePayloadSchema.parse(data);
            expect(Object.keys(parsed).sort()).toEqual(['topic', 'type', 'version']);
          }
        }
      }

      // Re-fetch overview — "re-sync" after SSE notification
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

  it('reload coherence — all snapshot routes agree after re-fetch', async () => {
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
    servers.push(server);

    try {
      // Create 2 reviews to produce richer state
      const r1 = await runtime.service.createReview({
        title: 'Reload coherence A',
        description: 'First review for reload test.',
        diff: readFixture('valid-review.diff'),
        authorId: 'reload-author',
        priority: 'normal',
      });

      const r2 = await runtime.service.createReview({
        title: 'Reload coherence B',
        description: 'Second review for reload test.',
        diff: readFixture('valid-review.diff'),
        authorId: 'reload-author',
        priority: 'high',
      });

      // Simulate reload: fetch all snapshot routes fresh
      const [overviewRes, feedRes, listRes] = await Promise.all([
        fetch(`${server.baseUrl}/api/overview`),
        fetch(`${server.baseUrl}/api/events/feed`),
        fetch(`${server.baseUrl}/api/reviews`),
      ]);

      // Overview
      expect(overviewRes.status).toBe(200);
      const overview = OverviewSnapshotSchema.parse(await overviewRes.json());
      expect(overview.reviews.total).toBe(2);
      expect(overview.reviews.pending).toBe(2);

      // Event feed
      expect(feedRes.status).toBe(200);
      const feedBody = await feedRes.json();
      const feed = EventFeedResponseSchema.parse(feedBody);
      const creationEvents = feed.events.filter((e) => e.eventType === 'review.created');
      expect(creationEvents).toHaveLength(2);
      assertNoMetadataLeaks(feedBody);

      // Review list
      expect(listRes.status).toBe(200);
      const list = ReviewListResponseSchema.parse(await listRes.json());
      expect(list.reviews).toHaveLength(2);

      const ids = list.reviews.map((r) => r.reviewId).sort();
      expect(ids).toContain(r1.review.reviewId);
      expect(ids).toContain(r2.review.reviewId);
    } finally {
      await server.close();
      routes.dispose();
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('startup recovery visible in overview and event feed', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    // Phase 1: Seed stale reviewer state via a separate context
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
      reviewerId: 'stale-reviewer-accept',
      command: process.execPath,
      args: [FIXTURE_PATH],
      cwd: 'packages/review-broker-server',
    });

    const created = await seedService.createReview({
      title: 'Recovery acceptance review',
      description: 'Will be claimed by a reviewer that becomes stale.',
      diff: readFixture('valid-review.diff'),
      authorId: 'recovery-author',
      priority: 'high',
    });

    await seedService.claimReview({
      reviewId: created.review.reviewId,
      claimantId: 'stale-reviewer-accept',
    });

    seedContext.close();

    // Phase 2: Restart broker — startup recovery should reclaim
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
    servers.push(server);

    try {
      // Verify overview shows recovery state
      const overviewRes = await fetch(`${server.baseUrl}/api/overview`);
      expect(overviewRes.status).toBe(200);
      const overview = OverviewSnapshotSchema.parse(await overviewRes.json());
      expect(overview.startupRecovery.recoveredReviewerCount).toBe(1);
      expect(overview.startupRecovery.reclaimedReviewCount).toBe(1);
      expect(overview.startupRecovery.staleReviewCount).toBe(0);
      expect(overview.startupRecovery.unrecoverableReviewCount).toBe(0);

      // Verify event feed includes recovery audit events
      const feedRes = await fetch(`${server.baseUrl}/api/events/feed`);
      expect(feedRes.status).toBe(200);
      const feedBody = await feedRes.json();
      const feed = EventFeedResponseSchema.parse(feedBody);

      const eventTypes = feed.events.map((e) => e.eventType);
      expect(eventTypes).toContain('review.reclaimed');
      expect(eventTypes).toContain('reviewer.offline');

      // Belt-and-suspenders: no metadata leaks
      assertNoMetadataLeaks(feedBody);
    } finally {
      await server.close();
      routes.dispose();
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('error responses have proper HTTP status codes', async () => {
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
    servers.push(server);

    try {
      // 404 for nonexistent review
      const detailRes = await fetch(`${server.baseUrl}/api/reviews/nonexistent-id`);
      expect(detailRes.status).toBe(404);
      const detailBody = await detailRes.json();
      expect(detailBody.error).toBeTruthy();

      // 404 for unknown static path
      const staticRes = await fetch(`${server.baseUrl}/no-such-page`);
      expect(staticRes.status).toBe(404);
    } finally {
      await server.close();
      routes.dispose();
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });
});
