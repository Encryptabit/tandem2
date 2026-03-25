import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  EventFeedResponseSchema,
  OperatorEventEntrySchema,
} from 'review-broker-core';

import { startBroker } from '../src/index.js';
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
  const dir = mkdtempSync(path.join(os.tmpdir(), 'event-feed-routes-'));
  tempDirectories.push(dir);
  return dir;
}

function readFixture(fileName: string): string {
  return readFileSync(
    path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'test', 'fixtures', fileName),
    'utf8',
  );
}

describe('http event feed routes', () => {
  it('GET /api/events/feed returns events in reverse chronological order', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({ cwd: WORKTREE_ROOT, dbPath, handleSignals: false });

    try {
      // Create two reviews to produce multiple audit events
      await runtime.service.createReview({
        title: 'First review',
        description: 'First review for ordering test.',
        diff: readFixture('valid-review.diff'),
        authorId: 'test-author',
        priority: 'normal',
      });

      await runtime.service.createReview({
        title: 'Second review',
        description: 'Second review for ordering test.',
        diff: readFixture('valid-review.diff'),
        authorId: 'test-author',
        priority: 'normal',
      });

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
        const response = await fetch(`${server.baseUrl}/api/events/feed`);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('application/json');

        const body = await response.json();
        const parsed = EventFeedResponseSchema.parse(body);

        expect(parsed.events.length).toBeGreaterThanOrEqual(2);

        // Verify newest-first ordering: auditEventIds should be descending
        for (let i = 1; i < parsed.events.length; i++) {
          expect(parsed.events[i - 1].auditEventId).toBeGreaterThan(parsed.events[i].auditEventId);
        }
      } finally {
        await server.close();
        routes.dispose();
      }
    } finally {
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('GET /api/events/feed respects limit param', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({ cwd: WORKTREE_ROOT, dbPath, handleSignals: false });

    try {
      // Create two reviews to ensure more than 1 event
      await runtime.service.createReview({
        title: 'Limit test review 1',
        description: 'Test limit parameter.',
        diff: readFixture('valid-review.diff'),
        authorId: 'test-author',
        priority: 'normal',
      });

      await runtime.service.createReview({
        title: 'Limit test review 2',
        description: 'Test limit parameter.',
        diff: readFixture('valid-review.diff'),
        authorId: 'test-author',
        priority: 'normal',
      });

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
        const response = await fetch(`${server.baseUrl}/api/events/feed?limit=1`);
        const body = await response.json();
        const parsed = EventFeedResponseSchema.parse(body);

        expect(parsed.events).toHaveLength(1);
        expect(parsed.hasMore).toBe(true);
      } finally {
        await server.close();
        routes.dispose();
      }
    } finally {
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('GET /api/events/feed supports cursor pagination with before param', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({ cwd: WORKTREE_ROOT, dbPath, handleSignals: false });

    try {
      // Create three reviews for enough events to paginate
      for (let i = 0; i < 3; i++) {
        await runtime.service.createReview({
          title: `Pagination test review ${i + 1}`,
          description: 'Test cursor pagination.',
          diff: readFixture('valid-review.diff'),
          authorId: 'test-author',
          priority: 'normal',
        });
      }

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
        // First page: limit=2
        const res1 = await fetch(`${server.baseUrl}/api/events/feed?limit=2`);
        const page1 = EventFeedResponseSchema.parse(await res1.json());
        expect(page1.events).toHaveLength(2);
        expect(page1.hasMore).toBe(true);

        // Second page: use the smallest auditEventId from page 1 as the cursor
        const cursor = page1.events[page1.events.length - 1].auditEventId;
        const res2 = await fetch(`${server.baseUrl}/api/events/feed?limit=2&before=${cursor}`);
        const page2 = EventFeedResponseSchema.parse(await res2.json());
        expect(page2.events.length).toBeGreaterThanOrEqual(1);

        // Event sets should be disjoint
        const page1Ids = new Set(page1.events.map((e) => e.auditEventId));
        for (const event of page2.events) {
          expect(page1Ids.has(event.auditEventId)).toBe(false);
        }

        // Page 2 events should all have smaller IDs than the cursor
        for (const event of page2.events) {
          expect(event.auditEventId).toBeLessThan(cursor);
        }
      } finally {
        await server.close();
        routes.dispose();
      }
    } finally {
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('GET /api/events/feed filters by eventType', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({ cwd: WORKTREE_ROOT, dbPath, handleSignals: false });

    try {
      // Create a review (produces review.created event)
      await runtime.service.createReview({
        title: 'Filter test review',
        description: 'Test eventType filter.',
        diff: readFixture('valid-review.diff'),
        authorId: 'test-author',
        priority: 'normal',
      });

      // Spawn a reviewer (produces reviewer.spawned event)
      await runtime.service.spawnReviewer({
        reviewerId: 'filter-test-reviewer',
        command: process.execPath,
        args: [FIXTURE_PATH],
        cwd: 'packages/review-broker-server',
      });

      // Brief wait for reviewer registration
      await new Promise((resolve) => setTimeout(resolve, 200));

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
        const response = await fetch(`${server.baseUrl}/api/events/feed?eventType=review.created`);
        const body = await response.json();
        const parsed = EventFeedResponseSchema.parse(body);

        expect(parsed.events.length).toBeGreaterThanOrEqual(1);
        for (const event of parsed.events) {
          expect(event.eventType).toBe('review.created');
        }
      } finally {
        await server.close();
        routes.dispose();
      }
    } finally {
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('GET /api/events/feed returns empty array for unknown eventType', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({ cwd: WORKTREE_ROOT, dbPath, handleSignals: false });

    try {
      await runtime.service.createReview({
        title: 'Empty filter test',
        description: 'Verify empty result for unknown type.',
        diff: readFixture('valid-review.diff'),
        authorId: 'test-author',
        priority: 'normal',
      });

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
        const response = await fetch(`${server.baseUrl}/api/events/feed?eventType=nonexistent.type`);
        expect(response.status).toBe(200);
        const body = await response.json();
        const parsed = EventFeedResponseSchema.parse(body);

        expect(parsed.events).toHaveLength(0);
        expect(parsed.hasMore).toBe(false);
      } finally {
        await server.close();
        routes.dispose();
      }
    } finally {
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('GET /api/events/feed redacts metadata — no command, args, cwd, workspaceRoot', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({ cwd: WORKTREE_ROOT, dbPath, handleSignals: false });

    try {
      // Spawn a reviewer — this produces a reviewer.spawned event whose metadata
      // contains command, args, and cwd
      await runtime.service.spawnReviewer({
        reviewerId: 'redaction-test-reviewer',
        command: process.execPath,
        args: [FIXTURE_PATH],
        cwd: 'packages/review-broker-server',
      });

      // Brief wait for reviewer registration
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Also create a review to get a mix of event types
      await runtime.service.createReview({
        title: 'Redaction test review',
        description: 'Verify metadata is stripped from the response.',
        diff: readFixture('valid-review.diff'),
        authorId: 'test-author',
        priority: 'normal',
      });

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
        const response = await fetch(`${server.baseUrl}/api/events/feed`);
        const body = await response.json();
        const parsed = EventFeedResponseSchema.parse(body);

        // Verify we got events
        expect(parsed.events.length).toBeGreaterThanOrEqual(2);

        // Stringify the entire response and check that sensitive values are absent
        const serialized = JSON.stringify(body);

        // The raw command path (e.g., /usr/local/bin/node) should not appear
        expect(serialized).not.toContain(process.execPath);

        // The fixture path used as args should not appear
        expect(serialized).not.toContain(FIXTURE_PATH);

        // The cwd should not appear
        expect(serialized).not.toContain('packages/review-broker-server');

        // None of the metadata field names should appear as JSON keys
        expect(serialized).not.toContain('"command"');
        expect(serialized).not.toContain('"args"');
        expect(serialized).not.toContain('"cwd"');
        expect(serialized).not.toContain('"workspaceRoot"');

        // The "metadata" key itself must not appear in any event entry
        expect(serialized).not.toContain('"metadata"');

        // Each event should individually conform to OperatorEventEntrySchema
        for (const event of parsed.events) {
          OperatorEventEntrySchema.parse(event);
        }

        // Verify that summary IS present when the source event had one
        // review.created events always get a summary from the broker
        const reviewCreatedEvents = parsed.events.filter((e) => e.eventType === 'review.created');
        expect(reviewCreatedEvents.length).toBeGreaterThanOrEqual(1);
        for (const event of reviewCreatedEvents) {
          expect(event.summary).not.toBeNull();
          expect(typeof event.summary).toBe('string');
        }
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
