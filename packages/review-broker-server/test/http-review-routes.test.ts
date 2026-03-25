import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ReviewListResponseSchema,
  ReviewDetailResponseSchema,
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
  const dir = mkdtempSync(path.join(os.tmpdir(), 'review-routes-'));
  tempDirectories.push(dir);
  return dir;
}

function readFixture(fileName: string): string {
  return readFileSync(
    path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'test', 'fixtures', fileName),
    'utf8',
  );
}

describe('http review routes', () => {
  it('GET /api/reviews returns empty list initially', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({ cwd: WORKTREE_ROOT, dbPath, handleSignals: false });

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
        const response = await fetch(`${server.baseUrl}/api/reviews`);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('application/json');

        const body = await response.json();
        const parsed = ReviewListResponseSchema.parse(body);

        expect(parsed.reviews).toHaveLength(0);
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

  it('GET /api/reviews returns reviews after creating them', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({ cwd: WORKTREE_ROOT, dbPath, handleSignals: false });

    try {
      await runtime.service.createReview({
        title: 'First review',
        description: 'First review body.',
        diff: readFixture('valid-review.diff'),
        authorId: 'test-author',
        priority: 'normal',
      });

      await runtime.service.createReview({
        title: 'Second review',
        description: 'Second review body.',
        diff: readFixture('valid-review.diff'),
        authorId: 'test-author',
        priority: 'high',
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
        const response = await fetch(`${server.baseUrl}/api/reviews`);
        const body = await response.json();
        const parsed = ReviewListResponseSchema.parse(body);

        expect(parsed.reviews).toHaveLength(2);
        expect(parsed.hasMore).toBe(false);

        // All reviews should have required fields
        for (const review of parsed.reviews) {
          expect(review.reviewId).toBeTruthy();
          expect(review.title).toBeTruthy();
          expect(review.status).toBe('pending');
          expect(review.authorId).toBe('test-author');
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

  it('GET /api/reviews?status=pending filters correctly', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({ cwd: WORKTREE_ROOT, dbPath, handleSignals: false });

    try {
      await runtime.service.createReview({
        title: 'Pending review',
        description: 'Stays pending.',
        diff: readFixture('valid-review.diff'),
        authorId: 'test-author',
        priority: 'normal',
      });

      await runtime.service.createReview({
        title: 'Another review',
        description: 'Also pending.',
        diff: readFixture('valid-review.diff'),
        authorId: 'test-author',
        priority: 'high',
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
        // Both reviews are pending, so pending filter should return both
        const pendingRes = await fetch(`${server.baseUrl}/api/reviews?status=pending`);
        const pendingBody = await pendingRes.json();
        const pendingParsed = ReviewListResponseSchema.parse(pendingBody);

        expect(pendingParsed.reviews).toHaveLength(2);
        for (const review of pendingParsed.reviews) {
          expect(review.status).toBe('pending');
        }

        // Closed filter should return empty — no reviews are closed
        const closedRes = await fetch(`${server.baseUrl}/api/reviews?status=closed`);
        const closedBody = await closedRes.json();
        const closedParsed = ReviewListResponseSchema.parse(closedBody);

        expect(closedParsed.reviews).toHaveLength(0);
      } finally {
        await server.close();
        routes.dispose();
      }
    } finally {
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('GET /api/reviews/:id returns composite detail', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({ cwd: WORKTREE_ROOT, dbPath, handleSignals: false });

    try {
      const { review } = await runtime.service.createReview({
        title: 'Detail test review',
        description: 'Review for detail testing.',
        diff: readFixture('valid-review.diff'),
        authorId: 'test-author',
        priority: 'normal',
      });

      // Add a message to generate discussion
      await runtime.service.addMessage({
        reviewId: review.reviewId,
        actorId: 'test-author',
        body: 'Please review this change.',
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
        const response = await fetch(`${server.baseUrl}/api/reviews/${review.reviewId}`);
        expect(response.status).toBe(200);

        const body = await response.json();
        const parsed = ReviewDetailResponseSchema.parse(body);

        // Review status
        expect(parsed.review.reviewId).toBe(review.reviewId);
        expect(parsed.review.title).toBe('Detail test review');
        expect(parsed.review.status).toBe('pending');

        // Proposal
        expect(parsed.proposal.title).toBe('Detail test review');
        expect(parsed.proposal.description).toBe('Review for detail testing.');
        expect(parsed.proposal.diff).toBeTruthy();
        expect(parsed.proposal.priority).toBe('normal');

        // Discussion
        expect(parsed.discussion).toHaveLength(1);
        expect(parsed.discussion[0].body).toBe('Please review this change.');

        // Activity — at minimum a review.created event
        expect(parsed.activity.length).toBeGreaterThanOrEqual(1);
      } finally {
        await server.close();
        routes.dispose();
      }
    } finally {
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('GET /api/reviews/:id returns 404 for unknown review ID', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({ cwd: WORKTREE_ROOT, dbPath, handleSignals: false });

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
        const response = await fetch(`${server.baseUrl}/api/reviews/nonexistent-review-id`);
        expect(response.status).toBe(404);

        const body = await response.json();
        expect(body.error).toBe('Review not found');
      } finally {
        await server.close();
        routes.dispose();
      }
    } finally {
      runtime.close();
      await runtime.waitUntilStopped();
    }
  });

  it('GET /api/reviews/:id redacts metadata — belt-and-suspenders', async () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test.sqlite');

    const runtime = startBroker({ cwd: WORKTREE_ROOT, dbPath, handleSignals: false });

    try {
      const { review } = await runtime.service.createReview({
        title: 'Redaction test review',
        description: 'Testing metadata redaction in detail view.',
        diff: readFixture('valid-review.diff'),
        authorId: 'test-author',
        priority: 'normal',
      });

      // Add a message to generate more activity
      await runtime.service.addMessage({
        reviewId: review.reviewId,
        actorId: 'test-author',
        body: 'Adding a message for activity.',
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
        const response = await fetch(`${server.baseUrl}/api/reviews/${review.reviewId}`);
        expect(response.status).toBe(200);

        const body = await response.json();
        const parsed = ReviewDetailResponseSchema.parse(body);

        // Verify we got activity entries
        expect(parsed.activity.length).toBeGreaterThanOrEqual(1);

        // Belt-and-suspenders: stringify the ENTIRE response and check
        // that sensitive metadata keys never appear
        const serialized = JSON.stringify(body);

        // No "metadata" key should appear anywhere in the response
        expect(serialized).not.toContain('"metadata"');

        // No raw command/args/cwd/workspaceRoot keys
        expect(serialized).not.toContain('"command"');
        expect(serialized).not.toContain('"args"');
        expect(serialized).not.toContain('"cwd"');
        expect(serialized).not.toContain('"workspaceRoot"');

        // Each activity entry individually validates against the redacted schema
        for (const entry of parsed.activity) {
          expect(Object.keys(entry)).not.toContain('metadata');
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
