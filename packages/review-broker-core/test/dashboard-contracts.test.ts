import { describe, expect, it } from 'vitest';

import {
  OverviewSnapshotSchema,
  OverviewReviewCountsSchema,
  OverviewReviewerCountsSchema,
  OverviewLatestReviewSchema,
  OverviewLatestReviewerSchema,
  OverviewLatestAuditSchema,
  StartupRecoveryOverviewSchema,
  SSEChangePayloadSchema,
  SSEHeartbeatPayloadSchema,
  SSEEventPayloadSchema,
  DASHBOARD_NOTIFICATION_TOPICS,
  SSE_EVENT_TYPES,
  OperatorEventEntrySchema,
  EventFeedResponseSchema,
  DashboardReviewListItemSchema,
  ReviewListResponseSchema,
  DashboardReviewActivityEntrySchema,
  ReviewDetailResponseSchema,
} from '../src/dashboard.js';

import { NOTIFICATION_TOPICS } from '../src/domain.js';

describe('dashboard transport contracts', () => {
  // -----------------------------------------------------------------------
  // Overview snapshot schemas
  // -----------------------------------------------------------------------

  it('parses a complete overview snapshot', () => {
    const snapshot = OverviewSnapshotSchema.parse({
      snapshotVersion: 42,
      generatedAt: '2026-03-20T19:00:00.000Z',
      reviews: {
        total: 5,
        pending: 2,
        claimed: 1,
        submitted: 1,
        changesRequested: 0,
        approved: 1,
        closed: 0,
      },
      reviewers: {
        total: 3,
        idle: 1,
        assigned: 1,
        offline: 1,
        tracked: 2,
      },
      latestReview: {
        reviewId: 'rev-001',
        status: 'claimed',
        currentRound: 1,
        lastActivityAt: '2026-03-20T19:00:00.000Z',
      },
      latestReviewer: {
        reviewerId: 'rvw-001',
        status: 'assigned',
        currentReviewId: 'rev-001',
        commandBasename: 'node',
        offlineReason: null,
        updatedAt: '2026-03-20T19:00:00.000Z',
      },
      latestAudit: {
        eventType: 'review.claimed',
        summary: 'Review claimed by rvw-001',
        createdAt: '2026-03-20T19:00:00.000Z',
      },
      startupRecovery: {
        completedAt: '2026-03-20T18:59:00.000Z',
        recoveredReviewerCount: 0,
        reclaimedReviewCount: 0,
        staleReviewCount: 0,
        unrecoverableReviewCount: 0,
      },
    });

    expect(snapshot.snapshotVersion).toBe(42);
    expect(snapshot.reviews.total).toBe(5);
    expect(snapshot.reviewers.tracked).toBe(2);
    expect(snapshot.latestReview?.reviewId).toBe('rev-001');
    expect(snapshot.latestReviewer?.commandBasename).toBe('node');
  });

  it('accepts null for optional latest projections', () => {
    const snapshot = OverviewSnapshotSchema.parse({
      snapshotVersion: 0,
      generatedAt: '2026-03-20T19:00:00.000Z',
      reviews: { total: 0, pending: 0, claimed: 0, submitted: 0, changesRequested: 0, approved: 0, closed: 0 },
      reviewers: { total: 0, idle: 0, assigned: 0, offline: 0, tracked: 0 },
      latestReview: null,
      latestReviewer: null,
      latestAudit: null,
      startupRecovery: {
        completedAt: '2026-03-20T18:59:00.000Z',
        recoveredReviewerCount: 0,
        reclaimedReviewCount: 0,
        staleReviewCount: 0,
        unrecoverableReviewCount: 0,
      },
    });

    expect(snapshot.latestReview).toBeNull();
    expect(snapshot.latestReviewer).toBeNull();
    expect(snapshot.latestAudit).toBeNull();
  });

  it('rejects extra fields on the overview snapshot (strict)', () => {
    expect(() =>
      OverviewSnapshotSchema.parse({
        snapshotVersion: 0,
        generatedAt: '2026-03-20T19:00:00.000Z',
        reviews: { total: 0, pending: 0, claimed: 0, submitted: 0, changesRequested: 0, approved: 0, closed: 0 },
        reviewers: { total: 0, idle: 0, assigned: 0, offline: 0, tracked: 0 },
        latestReview: null,
        latestReviewer: null,
        latestAudit: null,
        startupRecovery: {
          completedAt: '2026-03-20T18:59:00.000Z',
          recoveredReviewerCount: 0,
          reclaimedReviewCount: 0,
          staleReviewCount: 0,
          unrecoverableReviewCount: 0,
        },
        secretField: 'should-not-be-here',
      }),
    ).toThrow();
  });

  it('rejects negative counts in review counts', () => {
    expect(() =>
      OverviewReviewCountsSchema.parse({
        total: -1,
        pending: 0,
        claimed: 0,
        submitted: 0,
        changesRequested: 0,
        approved: 0,
        closed: 0,
      }),
    ).toThrow();
  });

  it('rejects negative counts in reviewer counts', () => {
    expect(() =>
      OverviewReviewerCountsSchema.parse({
        total: 0,
        idle: 0,
        assigned: -1,
        offline: 0,
        tracked: 0,
      }),
    ).toThrow();
  });

  // -----------------------------------------------------------------------
  // SSE payload schemas
  // -----------------------------------------------------------------------

  it('parses a change SSE payload', () => {
    const payload = SSEChangePayloadSchema.parse({
      type: 'change',
      topic: 'reviews',
      version: 7,
    });

    expect(payload.type).toBe('change');
    expect(payload.topic).toBe('reviews');
    expect(payload.version).toBe(7);
  });

  it('parses a heartbeat SSE payload', () => {
    const payload = SSEHeartbeatPayloadSchema.parse({
      type: 'heartbeat',
      serverTime: '2026-03-20T19:00:00.000Z',
    });

    expect(payload.type).toBe('heartbeat');
  });

  it('discriminates SSE event types via the union', () => {
    const change = SSEEventPayloadSchema.parse({ type: 'change', topic: 'reviewer-state', version: 3 });
    const heartbeat = SSEEventPayloadSchema.parse({ type: 'heartbeat', serverTime: '2026-03-20T19:00:00.000Z' });

    expect(change.type).toBe('change');
    expect(heartbeat.type).toBe('heartbeat');
  });

  it('rejects an SSE payload with an unknown type', () => {
    expect(() =>
      SSEEventPayloadSchema.parse({ type: 'unknown', topic: 'reviews', version: 1 }),
    ).toThrow();
  });

  it('rejects extra fields on SSE change payload (strict)', () => {
    expect(() =>
      SSEChangePayloadSchema.parse({
        type: 'change',
        topic: 'reviews',
        version: 1,
        diff: 'leaked-data',
      }),
    ).toThrow();
  });

  // -----------------------------------------------------------------------
  // Dashboard notification topics
  // -----------------------------------------------------------------------

  it('exposes all broker notification topics for dashboard SSE forwarding', () => {
    expect(DASHBOARD_NOTIFICATION_TOPICS).toEqual(NOTIFICATION_TOPICS);
  });

  it('locks the SSE event type vocabulary', () => {
    expect(SSE_EVENT_TYPES).toEqual(['change', 'heartbeat']);
  });

  // -----------------------------------------------------------------------
  // LatestReviewer redaction: commandBasename instead of full argv
  // -----------------------------------------------------------------------

  it('requires commandBasename, not raw command, in the latest reviewer projection', () => {
    expect(() =>
      OverviewLatestReviewerSchema.parse({
        reviewerId: 'rvw-001',
        status: 'idle',
        currentReviewId: null,
        command: '/usr/local/bin/node',
        offlineReason: null,
        updatedAt: '2026-03-20T19:00:00.000Z',
      }),
    ).toThrow();

    const valid = OverviewLatestReviewerSchema.parse({
      reviewerId: 'rvw-001',
      status: 'idle',
      currentReviewId: null,
      commandBasename: 'node',
      offlineReason: null,
      updatedAt: '2026-03-20T19:00:00.000Z',
    });

    expect(valid.commandBasename).toBe('node');
  });

  // -----------------------------------------------------------------------
  // Startup recovery overview
  // -----------------------------------------------------------------------

  it('parses a startup recovery overview with real counts', () => {
    const recovery = StartupRecoveryOverviewSchema.parse({
      completedAt: '2026-03-20T18:59:00.000Z',
      recoveredReviewerCount: 2,
      reclaimedReviewCount: 3,
      staleReviewCount: 1,
      unrecoverableReviewCount: 0,
    });

    expect(recovery.recoveredReviewerCount).toBe(2);
    expect(recovery.reclaimedReviewCount).toBe(3);
  });

  // -----------------------------------------------------------------------
  // Operator event feed schemas
  // -----------------------------------------------------------------------

  describe('OperatorEventEntrySchema', () => {
    it('parses a valid operator event entry with all fields populated', () => {
      const entry = OperatorEventEntrySchema.parse({
        auditEventId: 1,
        reviewId: 'rev-001',
        eventType: 'review.created',
        actorId: 'author-1',
        statusFrom: null,
        statusTo: 'pending',
        errorCode: null,
        summary: 'Review created by author-1',
        createdAt: '2026-03-20T19:00:00.000Z',
      });

      expect(entry.auditEventId).toBe(1);
      expect(entry.reviewId).toBe('rev-001');
      expect(entry.eventType).toBe('review.created');
      expect(entry.actorId).toBe('author-1');
      expect(entry.statusTo).toBe('pending');
      expect(entry.summary).toBe('Review created by author-1');
    });

    it('parses with nullable fields set to null', () => {
      const entry = OperatorEventEntrySchema.parse({
        auditEventId: 2,
        reviewId: null,
        eventType: 'reviewer.spawned',
        actorId: null,
        statusFrom: null,
        statusTo: null,
        errorCode: null,
        summary: null,
        createdAt: '2026-03-20T19:01:00.000Z',
      });

      expect(entry.reviewId).toBeNull();
      expect(entry.actorId).toBeNull();
      expect(entry.statusFrom).toBeNull();
      expect(entry.statusTo).toBeNull();
      expect(entry.errorCode).toBeNull();
      expect(entry.summary).toBeNull();
    });

    it('rejects extra fields (strict mode)', () => {
      expect(() =>
        OperatorEventEntrySchema.parse({
          auditEventId: 3,
          reviewId: null,
          eventType: 'review.created',
          actorId: null,
          statusFrom: null,
          statusTo: 'pending',
          errorCode: null,
          summary: null,
          createdAt: '2026-03-20T19:00:00.000Z',
          metadata: { command: '/usr/bin/node' },
        }),
      ).toThrow();
    });

    it('rejects missing required fields', () => {
      // Missing auditEventId
      expect(() =>
        OperatorEventEntrySchema.parse({
          reviewId: null,
          eventType: 'review.created',
          actorId: null,
          statusFrom: null,
          statusTo: null,
          errorCode: null,
          summary: null,
          createdAt: '2026-03-20T19:00:00.000Z',
        }),
      ).toThrow();

      // Missing eventType
      expect(() =>
        OperatorEventEntrySchema.parse({
          auditEventId: 1,
          reviewId: null,
          actorId: null,
          statusFrom: null,
          statusTo: null,
          errorCode: null,
          summary: null,
          createdAt: '2026-03-20T19:00:00.000Z',
        }),
      ).toThrow();

      // Missing createdAt
      expect(() =>
        OperatorEventEntrySchema.parse({
          auditEventId: 1,
          reviewId: null,
          eventType: 'review.created',
          actorId: null,
          statusFrom: null,
          statusTo: null,
          errorCode: null,
          summary: null,
        }),
      ).toThrow();
    });
  });

  describe('EventFeedResponseSchema', () => {
    it('parses a valid response with events and hasMore', () => {
      const response = EventFeedResponseSchema.parse({
        events: [
          {
            auditEventId: 1,
            reviewId: 'rev-001',
            eventType: 'review.created',
            actorId: 'author-1',
            statusFrom: null,
            statusTo: 'pending',
            errorCode: null,
            summary: 'Review created',
            createdAt: '2026-03-20T19:00:00.000Z',
          },
        ],
        hasMore: true,
      });

      expect(response.events).toHaveLength(1);
      expect(response.hasMore).toBe(true);
    });

    it('parses an empty events array with hasMore false', () => {
      const response = EventFeedResponseSchema.parse({
        events: [],
        hasMore: false,
      });

      expect(response.events).toHaveLength(0);
      expect(response.hasMore).toBe(false);
    });

    it('rejects extra fields (strict mode)', () => {
      expect(() =>
        EventFeedResponseSchema.parse({
          events: [],
          hasMore: false,
          totalCount: 42,
        }),
      ).toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Review list/detail schemas
  // -----------------------------------------------------------------------

  const VALID_REVIEW_LIST_ITEM = {
    reviewId: 'rev-001',
    title: 'Fix broken tests',
    status: 'pending',
    priority: 'normal',
    authorId: 'author-1',
    createdAt: '2026-03-20T19:00:00.000Z',
    updatedAt: '2026-03-20T19:00:00.000Z',
    claimedBy: null,
    claimedAt: null,
    claimGeneration: 0,
    currentRound: 1,
    latestVerdict: null,
    verdictReason: null,
    counterPatchStatus: 'none',
    lastMessageAt: null,
    lastActivityAt: '2026-03-20T19:00:00.000Z',
  };

  describe('DashboardReviewListItemSchema', () => {
    it('parses a valid review list item with all fields', () => {
      const item = DashboardReviewListItemSchema.parse(VALID_REVIEW_LIST_ITEM);
      expect(item.reviewId).toBe('rev-001');
      expect(item.title).toBe('Fix broken tests');
      expect(item.status).toBe('pending');
      expect(item.claimedBy).toBeNull();
      expect(item.currentRound).toBe(1);
      expect(item.counterPatchStatus).toBe('none');
    });

    it('rejects extra fields (strict mode)', () => {
      expect(() =>
        DashboardReviewListItemSchema.parse({
          ...VALID_REVIEW_LIST_ITEM,
          metadata: { command: '/usr/bin/node' },
        }),
      ).toThrow();
    });
  });

  describe('ReviewListResponseSchema', () => {
    it('parses valid response with reviews and hasMore', () => {
      const response = ReviewListResponseSchema.parse({
        reviews: [VALID_REVIEW_LIST_ITEM],
        hasMore: false,
      });

      expect(response.reviews).toHaveLength(1);
      expect(response.hasMore).toBe(false);
    });
  });

  describe('DashboardReviewActivityEntrySchema', () => {
    it('parses valid activity entry without metadata', () => {
      const entry = DashboardReviewActivityEntrySchema.parse({
        auditEventId: 1,
        reviewId: 'rev-001',
        eventType: 'review.created',
        actorId: 'author-1',
        statusFrom: null,
        statusTo: 'pending',
        errorCode: null,
        summary: 'Review created',
        createdAt: '2026-03-20T19:00:00.000Z',
      });

      expect(entry.auditEventId).toBe(1);
      expect(entry.eventType).toBe('review.created');
      expect(entry.summary).toBe('Review created');
    });

    it('rejects an entry that has a metadata field', () => {
      expect(() =>
        DashboardReviewActivityEntrySchema.parse({
          auditEventId: 2,
          reviewId: 'rev-001',
          eventType: 'review.created',
          actorId: 'author-1',
          statusFrom: null,
          statusTo: 'pending',
          errorCode: null,
          summary: null,
          metadata: { command: '/usr/bin/node' },
          createdAt: '2026-03-20T19:00:00.000Z',
        }),
      ).toThrow();
    });
  });

  describe('ReviewDetailResponseSchema', () => {
    it('parses a valid composite response', () => {
      const response = ReviewDetailResponseSchema.parse({
        review: VALID_REVIEW_LIST_ITEM,
        proposal: {
          title: 'Fix broken tests',
          description: 'Fixing the broken test suite',
          diff: '--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new',
          affectedFiles: ['file.ts'],
          priority: 'normal',
        },
        discussion: [
          {
            messageId: 1,
            reviewId: 'rev-001',
            actorId: 'author-1',
            authorRole: 'proposer',
            body: 'Please review this fix',
            createdAt: '2026-03-20T19:01:00.000Z',
          },
        ],
        activity: [
          {
            auditEventId: 1,
            reviewId: 'rev-001',
            eventType: 'review.created',
            actorId: 'author-1',
            statusFrom: null,
            statusTo: 'pending',
            errorCode: null,
            summary: 'Review created',
            createdAt: '2026-03-20T19:00:00.000Z',
          },
        ],
      });

      expect(response.review.reviewId).toBe('rev-001');
      expect(response.proposal.title).toBe('Fix broken tests');
      expect(response.discussion).toHaveLength(1);
      expect(response.activity).toHaveLength(1);
      // Verify no metadata in activity entries
      expect('metadata' in response.activity[0]).toBe(false);
    });
  });
});
