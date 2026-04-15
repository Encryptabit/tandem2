import { describe, expect, it } from 'vitest';

import {
  KillReviewerRequestSchema,
  KillReviewerResponseSchema,
  ListReviewersRequestSchema,
  ListReviewersResponseSchema,
  ReviewReclaimCauseSchema,
  ReviewerOfflineReasonSchema,
  ReviewerRecordSchema,
  ReviewerStatusSchema,
  SpawnReviewerRequestSchema,
  SpawnReviewerResponseSchema,
} from '../src/contracts.js';
import { NOTIFICATION_TOPICS, REVIEWER_AUDIT_EVENT_TYPES } from '../src/domain.js';
import {
  getBrokerOperationByMcpToolName,
  getBrokerOperationByMethodName,
  parseBrokerOperationRequestByMcpToolName,
  parseBrokerOperationResponseByMcpToolName,
} from '../src/operations.js';

describe('review-broker-core reviewer contracts', () => {
  it('locks reviewer lifecycle vocabulary and diagnostic topics', () => {
    expect(ReviewerStatusSchema.options).toEqual(['idle', 'assigned', 'draining', 'offline']);
    expect(ReviewerOfflineReasonSchema.options).toEqual([
      'spawn_failed',
      'reviewer_exit',
      'operator_kill',
      'startup_recovery',
      'idle_timeout',
      'ttl_expired',
      'pool_drain',
    ]);
    expect(ReviewReclaimCauseSchema.options).toEqual([
      'reviewer_exit',
      'operator_kill',
      'startup_recovery',
      'idle_timeout',
      'ttl_expired',
      'pool_drain',
    ]);
    expect(REVIEWER_AUDIT_EVENT_TYPES).toEqual([
      'reviewer.spawned',
      'reviewer.spawn_failed',
      'reviewer.killed',
      'reviewer.offline',
    ]);
    expect(NOTIFICATION_TOPICS).toContain('reviewer-state');
  });

  it('freezes the shared reviewer record shape with derived currentReviewId and no duplicate assignment field', () => {
    const reviewer = ReviewerRecordSchema.parse({
      reviewerId: 'reviewer-1',
      status: 'assigned',
      currentReviewId: 'rvw_123',
      command: 'node',
      args: ['test/fixtures/reviewer-worker.mjs'],
      cwd: 'packages/review-broker-server',
      pid: 4321,
      startedAt: '2026-03-21T17:00:00.000Z',
      lastSeenAt: '2026-03-21T17:00:05.000Z',
      offlineAt: null,
      offlineReason: null,
      exitCode: null,
      exitSignal: null,
      sessionToken: null,
      drainingAt: null,
      createdAt: '2026-03-21T17:00:00.000Z',
      updatedAt: '2026-03-21T17:00:05.000Z',
    });

    expect(reviewer.currentReviewId).toBe('rvw_123');
    expect(reviewer.status).toBe('assigned');

    expect(() =>
      ReviewerRecordSchema.parse({
        ...reviewer,
        assignedReviewId: 'rvw_123',
      }),
    ).toThrow();

    expect(
      ReviewerRecordSchema.parse({
        ...reviewer,
        status: 'offline',
        currentReviewId: null,
        pid: null,
        offlineAt: '2026-03-21T17:02:00.000Z',
        offlineReason: 'reviewer_exit',
        exitCode: 1,
        exitSignal: null,
        updatedAt: '2026-03-21T17:02:00.000Z',
      }),
    ).toMatchObject({
      status: 'offline',
      currentReviewId: null,
      offlineReason: 'reviewer_exit',
      exitCode: 1,
    });
  });

  it('parses spawn requests and responses without leaking reviewer lifecycle shape decisions into the server package', () => {
    const request = SpawnReviewerRequestSchema.parse({
      reviewerId: 'reviewer-1',
      command: 'node',
      cwd: 'packages/review-broker-server',
    });

    expect(request.args).toEqual([]);

    const response = SpawnReviewerResponseSchema.parse({
      reviewer: {
        reviewerId: 'reviewer-1',
        status: 'idle',
        currentReviewId: null,
        command: 'node',
        args: ['test/fixtures/reviewer-worker.mjs'],
        cwd: 'packages/review-broker-server',
        pid: 4321,
        startedAt: '2026-03-21T17:00:00.000Z',
        lastSeenAt: '2026-03-21T17:00:01.000Z',
        offlineAt: null,
        offlineReason: null,
        exitCode: null,
        exitSignal: null,
        sessionToken: null,
        drainingAt: null,
        createdAt: '2026-03-21T17:00:00.000Z',
        updatedAt: '2026-03-21T17:00:01.000Z',
      },
      version: 3,
    });

    expect(response.version).toBe(3);
    expect(response.reviewer.pid).toBe(4321);
  });

  it('reuses versioned wait semantics for reviewer listing and kill responses', () => {
    const request = ListReviewersRequestSchema.parse({
      wait: true,
      sinceVersion: 2,
      timeoutMs: 1_500,
      status: 'offline',
      limit: 10,
    });

    expect(request).toMatchObject({
      wait: true,
      sinceVersion: 2,
      timeoutMs: 1_500,
      status: 'offline',
      limit: 10,
    });

    const listResponse = ListReviewersResponseSchema.parse({
      reviewers: [
        {
          reviewerId: 'reviewer-1',
          status: 'offline',
          currentReviewId: null,
          command: 'node',
          args: ['test/fixtures/reviewer-worker.mjs'],
          cwd: 'packages/review-broker-server',
          pid: null,
          startedAt: '2026-03-21T17:00:00.000Z',
          lastSeenAt: '2026-03-21T17:01:00.000Z',
          offlineAt: '2026-03-21T17:01:00.000Z',
          offlineReason: 'operator_kill',
          exitCode: null,
          exitSignal: 'SIGTERM',
          sessionToken: null,
          drainingAt: null,
          createdAt: '2026-03-21T17:00:00.000Z',
          updatedAt: '2026-03-21T17:01:00.000Z',
        },
      ],
      version: 4,
    });

    expect(listResponse.version).toBe(4);
    expect(listResponse.reviewers[0]?.offlineReason).toBe('operator_kill');

    expect(
      KillReviewerResponseSchema.parse({
        outcome: 'already_offline',
        reviewer: listResponse.reviewers[0],
        version: 5,
        message: 'Reviewer reviewer-1 had already exited before the operator kill request.',
      }),
    ).toMatchObject({
      outcome: 'already_offline',
      version: 5,
    });

    expect(
      KillReviewerResponseSchema.parse({
        outcome: 'not_found',
        reviewer: null,
        version: 5,
        message: 'Reviewer reviewer-404 was not found.',
      }),
    ).toMatchObject({
      outcome: 'not_found',
      reviewer: null,
    });
  });

  it('freezes reviewer operation schema pairings and reverse MCP lookups', () => {
    expect(getBrokerOperationByMethodName('spawnReviewer')).toMatchObject({
      methodName: 'spawnReviewer',
      mcpToolName: 'spawn_reviewer',
    });
    expect(getBrokerOperationByMethodName('spawnReviewer').requestSchema).toBe(SpawnReviewerRequestSchema);
    expect(getBrokerOperationByMethodName('spawnReviewer').responseSchema).toBe(SpawnReviewerResponseSchema);
    expect(getBrokerOperationByMcpToolName('spawn_reviewer')).toBe(getBrokerOperationByMethodName('spawnReviewer'));

    expect(getBrokerOperationByMethodName('listReviewers')).toMatchObject({
      methodName: 'listReviewers',
      mcpToolName: 'list_reviewers',
    });
    expect(getBrokerOperationByMethodName('listReviewers').requestSchema).toBe(ListReviewersRequestSchema);
    expect(getBrokerOperationByMethodName('listReviewers').responseSchema).toBe(ListReviewersResponseSchema);
    expect(getBrokerOperationByMcpToolName('list_reviewers')).toBe(getBrokerOperationByMethodName('listReviewers'));

    expect(getBrokerOperationByMethodName('killReviewer')).toMatchObject({
      methodName: 'killReviewer',
      mcpToolName: 'kill_reviewer',
    });
    expect(getBrokerOperationByMethodName('killReviewer').requestSchema).toBe(KillReviewerRequestSchema);
    expect(getBrokerOperationByMethodName('killReviewer').responseSchema).toBe(KillReviewerResponseSchema);
    expect(getBrokerOperationByMcpToolName('kill_reviewer')).toBe(getBrokerOperationByMethodName('killReviewer'));
  });

  it('parses reviewer payloads through MCP-name helpers from the shared registry', () => {
    expect(
      parseBrokerOperationRequestByMcpToolName('spawn_reviewer', {
        command: 'node',
        args: ['reviewer-worker.mjs'],
      }).args,
    ).toEqual(['reviewer-worker.mjs']);

    expect(
      parseBrokerOperationResponseByMcpToolName('list_reviewers', {
        reviewers: [
          {
            reviewerId: 'reviewer-1',
            status: 'idle',
            currentReviewId: null,
            command: 'node',
            args: [],
            cwd: null,
            pid: 4321,
            startedAt: '2026-03-21T17:00:00.000Z',
            lastSeenAt: '2026-03-21T17:00:01.000Z',
            offlineAt: null,
            offlineReason: null,
            exitCode: null,
            exitSignal: null,
            sessionToken: null,
            drainingAt: null,
            createdAt: '2026-03-21T17:00:00.000Z',
            updatedAt: '2026-03-21T17:00:01.000Z',
          },
        ],
        version: 6,
      }).version,
    ).toBe(6);
  });
});
