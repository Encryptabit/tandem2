import { describe, expect, it } from 'vitest';

import {
  AcceptCounterPatchRequestSchema,
  AcceptCounterPatchResponseSchema,
  AddMessageRequestSchema,
  AddMessageResponseSchema,
  ClaimNextPendingReviewRequestSchema,
  ClaimReviewRequestSchema,
  ClaimReviewResponseSchema,
  CloseReviewRequestSchema,
  CloseReviewResponseSchema,
  CreateReviewRequestSchema,
  CreateReviewResponseSchema,
  GetActivityFeedRequestSchema,
  GetActivityFeedResponseSchema,
  GetDiscussionRequestSchema,
  GetDiscussionResponseSchema,
  GetProposalRequestSchema,
  GetProposalResponseSchema,
  GetReviewStatusRequestSchema,
  GetReviewStatusResponseSchema,
  ListReviewsRequestSchema,
  ListReviewsResponseSchema,
  RejectCounterPatchRequestSchema,
  RejectCounterPatchResponseSchema,
  ReclaimReviewRequestSchema,
  ReclaimReviewResponseSchema,
  ReviewActivityEntrySchema,
  ReviewDiscussionMessageSchema,
  ReviewProposalSchema,
  ReviewStatusSchema,
  ReviewSummarySchema,
  SubmitVerdictRequestSchema,
  SubmitVerdictResponseSchema,
} from '../src/contracts.js';
import {
  BROKER_OPERATION_METHOD_NAMES,
  BROKER_OPERATION_MCP_TOOL_NAMES,
  getBrokerOperationByMcpToolName,
  getBrokerOperationByMethodName,
  parseBrokerOperationRequest,
  parseBrokerOperationResponse,
} from '../src/operations.js';

describe('review-broker-core contracts', () => {
  it('locks the shared review status vocabulary', () => {
    expect(ReviewStatusSchema.options).toEqual([
      'pending',
      'claimed',
      'submitted',
      'changes_requested',
      'approved',
      'closed',
    ]);
  });

  it('parses create review requests with the shared defaults', () => {
    const parsed = CreateReviewRequestSchema.parse({
      title: 'Broker parity review',
      description: 'Port the shared review contract first.',
      diff: 'diff --git a/file.ts b/file.ts',
      authorId: 'agent-cari',
    });

    expect(parsed.priority).toBe('normal');
  });

  it('keeps the future wait semantics shape in the status request contract', () => {
    const parsed = GetReviewStatusRequestSchema.parse({
      reviewId: 'rvw_123',
      wait: true,
      sinceVersion: 4,
      timeoutMs: 1_500,
    });

    expect(parsed).toMatchObject({
      reviewId: 'rvw_123',
      wait: true,
      sinceVersion: 4,
      timeoutMs: 1_500,
    });
  });

  it('freezes the lifecycle metadata carried by shared review summary and proposal payloads', () => {
    const review = ReviewSummarySchema.parse({
      reviewId: 'rvw_123',
      title: 'Broker parity review',
      workspaceRoot: '/work/broker-parity',
      projectName: 'broker-parity',
      status: 'changes_requested',
      priority: 'high',
      authorId: 'agent-cari',
      createdAt: '2026-03-21T00:00:00.000Z',
      updatedAt: '2026-03-21T00:10:00.000Z',
      claimedBy: 'reviewer-1',
      claimedAt: '2026-03-21T00:01:00.000Z',
      claimGeneration: 2,
      currentRound: 2,
      latestVerdict: 'changes_requested',
      verdictReason: 'Please add persistence coverage.',
      counterPatchStatus: 'pending',
      lastMessageAt: '2026-03-21T00:09:00.000Z',
      lastActivityAt: '2026-03-21T00:10:00.000Z',
    });

    const proposal = ReviewProposalSchema.parse({
      reviewId: 'rvw_123',
      title: 'Broker parity review',
      workspaceRoot: '/work/broker-parity',
      projectName: 'broker-parity',
      description: 'Port the shared review contract first.',
      diff: 'diff --git a/file.ts b/file.ts',
      affectedFiles: ['packages/review-broker-core/src/contracts.ts'],
      priority: 'high',
      currentRound: 2,
      latestVerdict: 'changes_requested',
      verdictReason: 'Please add persistence coverage.',
      counterPatchStatus: 'pending',
      lastMessageAt: '2026-03-21T00:09:00.000Z',
      lastActivityAt: '2026-03-21T00:10:00.000Z',
    });

    expect(review.currentRound).toBe(2);
    expect(review.projectName).toBe('broker-parity');
    expect(review.verdictReason).toBe('Please add persistence coverage.');
    expect(proposal.counterPatchStatus).toBe('pending');
  });

  it('locks the discussion and activity payload shapes', () => {
    const message = ReviewDiscussionMessageSchema.parse({
      messageId: 11,
      reviewId: 'rvw_123',
      actorId: 'reviewer-1',
      authorRole: 'reviewer',
      body: 'Please add restart persistence coverage before closing this review.',
      createdAt: '2026-03-21T00:11:00.000Z',
    });

    const activity = ReviewActivityEntrySchema.parse({
      auditEventId: 7,
      reviewId: 'rvw_123',
      eventType: 'review.message_added',
      actorId: 'reviewer-1',
      statusFrom: 'submitted',
      statusTo: 'submitted',
      errorCode: null,
      summary: 'Reviewer requested follow-up coverage.',
      metadata: {
        reviewId: 'rvw_123',
        messageId: 11,
      },
      createdAt: '2026-03-21T00:11:00.000Z',
    });

    expect(message.authorRole).toBe('reviewer');
    expect(activity.metadata).toMatchObject({ messageId: 11 });
  });

  it('exports concrete lifecycle request and response schemas for verdict, close, discussion, activity, and counter-patch decisions', () => {
    expect(
      SubmitVerdictRequestSchema.parse({
        reviewId: 'rvw_123',
        actorId: 'reviewer-1',
        verdict: 'approved',
        reason: 'The requested changes are complete.',
      }),
    ).toMatchObject({ verdict: 'approved' });

    expect(
      CloseReviewRequestSchema.parse({
        reviewId: 'rvw_123',
        actorId: 'agent-cari',
      }),
    ).toMatchObject({ reviewId: 'rvw_123' });

    expect(
      AddMessageRequestSchema.parse({
        reviewId: 'rvw_123',
        actorId: 'reviewer-1',
        body: 'Can you confirm the migration path?',
      }),
    ).toMatchObject({ actorId: 'reviewer-1' });

    expect(
      GetDiscussionRequestSchema.parse({
        reviewId: 'rvw_123',
      }),
    ).toMatchObject({ reviewId: 'rvw_123' });

    expect(
      GetActivityFeedRequestSchema.parse({
        reviewId: 'rvw_123',
        limit: 25,
      }),
    ).toMatchObject({ limit: 25 });

    expect(
      AcceptCounterPatchRequestSchema.parse({
        reviewId: 'rvw_123',
        actorId: 'reviewer-1',
        note: 'Counter patch resolves the last blocker.',
      }),
    ).toMatchObject({ note: 'Counter patch resolves the last blocker.' });

    expect(
      RejectCounterPatchRequestSchema.parse({
        reviewId: 'rvw_123',
        actorId: 'reviewer-1',
      }),
    ).toMatchObject({ actorId: 'reviewer-1' });
  });

  it('keeps claim outcomes and notification versions explicit in responses', () => {
    const response = ClaimReviewResponseSchema.parse({
      outcome: 'stale',
      review: null,
      version: 7,
      message: 'Review was already claimed by another worker.',
    });

    expect(response.outcome).toBe('stale');
    expect(response.version).toBe(7);
  });

  it('requires versioned list responses to carry review summaries with lifecycle metadata', () => {
    const response = ListReviewsResponseSchema.parse({
      reviews: [
        {
          reviewId: 'rvw_123',
          title: 'Broker parity review',
          workspaceRoot: '/work/broker-parity',
          projectName: 'broker-parity',
          status: 'pending',
          priority: 'normal',
          authorId: 'agent-cari',
          createdAt: '2026-03-21T00:00:00.000Z',
          updatedAt: '2026-03-21T00:00:00.000Z',
          claimedBy: null,
          claimedAt: null,
          claimGeneration: 0,
          currentRound: 1,
          latestVerdict: null,
          verdictReason: null,
          counterPatchStatus: 'none',
          lastMessageAt: null,
          lastActivityAt: '2026-03-21T00:00:00.000Z',
        },
      ],
      version: 3,
    });

    expect(response.reviews).toHaveLength(1);
    expect(response.reviews[0]?.currentRound).toBe(1);
    expect(response.version).toBe(3);
  });

  it('parses versioned lifecycle responses for verdict, close, discussion, activity, and counter-patch operations', () => {
    const review = {
      reviewId: 'rvw_123',
      title: 'Broker parity review',
      workspaceRoot: '/work/broker-parity',
      projectName: 'broker-parity',
      status: 'approved',
      priority: 'normal',
      authorId: 'agent-cari',
      createdAt: '2026-03-21T00:00:00.000Z',
      updatedAt: '2026-03-21T00:12:00.000Z',
      claimedBy: 'reviewer-1',
      claimedAt: '2026-03-21T00:01:00.000Z',
      claimGeneration: 2,
      currentRound: 2,
      latestVerdict: 'approved',
      verdictReason: 'Looks good.',
      counterPatchStatus: 'accepted',
      lastMessageAt: '2026-03-21T00:11:00.000Z',
      lastActivityAt: '2026-03-21T00:12:00.000Z',
    };

    const proposal = {
      reviewId: 'rvw_123',
      title: 'Broker parity review',
      workspaceRoot: '/work/broker-parity',
      projectName: 'broker-parity',
      description: 'Port the shared review contract first.',
      diff: 'diff --git a/file.ts b/file.ts',
      affectedFiles: ['packages/review-broker-core/src/contracts.ts'],
      priority: 'normal',
      currentRound: 2,
      latestVerdict: 'approved',
      verdictReason: 'Looks good.',
      counterPatchStatus: 'accepted',
      lastMessageAt: '2026-03-21T00:11:00.000Z',
      lastActivityAt: '2026-03-21T00:12:00.000Z',
    };

    expect(
      SubmitVerdictResponseSchema.parse({
        review,
        proposal,
        version: 8,
      }).review.latestVerdict,
    ).toBe('approved');

    expect(
      CloseReviewResponseSchema.parse({
        review: {
          ...review,
          status: 'closed',
        },
        version: 9,
      }).review.status,
    ).toBe('closed');

    expect(
      AddMessageResponseSchema.parse({
        review,
        message: {
          messageId: 12,
          reviewId: 'rvw_123',
          actorId: 'agent-cari',
          authorRole: 'proposer',
          body: 'I have pushed the follow-up patch.',
          createdAt: '2026-03-21T00:13:00.000Z',
        },
        version: 10,
      }).message.authorRole,
    ).toBe('proposer');

    expect(
      GetDiscussionResponseSchema.parse({
        review,
        messages: [
          {
            messageId: 12,
            reviewId: 'rvw_123',
            actorId: 'agent-cari',
            authorRole: 'proposer',
            body: 'I have pushed the follow-up patch.',
            createdAt: '2026-03-21T00:13:00.000Z',
          },
        ],
        version: 10,
      }).messages,
    ).toHaveLength(1);

    expect(
      GetActivityFeedResponseSchema.parse({
        review,
        activity: [
          {
            auditEventId: 9,
            reviewId: 'rvw_123',
            eventType: 'review.counter_patch_accepted',
            actorId: 'reviewer-1',
            statusFrom: 'changes_requested',
            statusTo: 'submitted',
            errorCode: null,
            summary: 'Reviewer accepted the counter patch.',
            metadata: { reviewId: 'rvw_123' },
            createdAt: '2026-03-21T00:14:00.000Z',
          },
        ],
        version: 11,
      }).activity[0]?.eventType,
    ).toBe('review.counter_patch_accepted');

    expect(
      AcceptCounterPatchResponseSchema.parse({
        review,
        proposal,
        version: 12,
      }).proposal.counterPatchStatus,
    ).toBe('accepted');
  });

  it('freezes operation names, MCP tool names, and review schema pairings in the shared registry', () => {
    expect(BROKER_OPERATION_METHOD_NAMES).toEqual([
      'createReview',
      'listReviews',
      'spawnReviewer',
      'listReviewers',
      'killReviewer',
      'claimReview',
      'claimNextPendingReview',
      'getReviewStatus',
      'getProposal',
      'reclaimReview',
      'submitVerdict',
      'closeReview',
      'addMessage',
      'getDiscussion',
      'getActivityFeed',
      'acceptCounterPatch',
      'rejectCounterPatch',
    ]);

    expect(BROKER_OPERATION_MCP_TOOL_NAMES).toEqual([
      'create_review',
      'list_reviews',
      'spawn_reviewer',
      'list_reviewers',
      'kill_reviewer',
      'claim_review',
      'claim_next_pending_review',
      'get_review_status',
      'get_proposal',
      'reclaim_review',
      'submit_verdict',
      'close_review',
      'add_message',
      'get_discussion',
      'get_activity_feed',
      'accept_counter_patch',
      'reject_counter_patch',
    ]);

    expect(getBrokerOperationByMethodName('createReview')).toMatchObject({
      methodName: 'createReview',
      mcpToolName: 'create_review',
    });
    expect(getBrokerOperationByMethodName('createReview').requestSchema).toBe(CreateReviewRequestSchema);
    expect(getBrokerOperationByMethodName('createReview').responseSchema).toBe(CreateReviewResponseSchema);
    expect(getBrokerOperationByMcpToolName('create_review')).toBe(getBrokerOperationByMethodName('createReview'));

    expect(getBrokerOperationByMethodName('listReviews').requestSchema).toBe(ListReviewsRequestSchema);
    expect(getBrokerOperationByMethodName('listReviews').responseSchema).toBe(ListReviewsResponseSchema);
    expect(getBrokerOperationByMcpToolName('list_reviews')).toBe(getBrokerOperationByMethodName('listReviews'));

    expect(getBrokerOperationByMethodName('claimReview').requestSchema).toBe(ClaimReviewRequestSchema);
    expect(getBrokerOperationByMethodName('claimReview').responseSchema).toBe(ClaimReviewResponseSchema);
    expect(getBrokerOperationByMethodName('claimNextPendingReview').requestSchema).toBe(
      ClaimNextPendingReviewRequestSchema,
    );
    expect(getBrokerOperationByMethodName('claimNextPendingReview').responseSchema).toBe(ClaimReviewResponseSchema);
    expect(getBrokerOperationByMcpToolName('claim_next_pending_review')).toBe(
      getBrokerOperationByMethodName('claimNextPendingReview'),
    );
    expect(getBrokerOperationByMethodName('getReviewStatus').requestSchema).toBe(GetReviewStatusRequestSchema);
    expect(getBrokerOperationByMethodName('getReviewStatus').responseSchema).toBe(GetReviewStatusResponseSchema);
    expect(getBrokerOperationByMethodName('getProposal').requestSchema).toBe(GetProposalRequestSchema);
    expect(getBrokerOperationByMethodName('getProposal').responseSchema).toBe(GetProposalResponseSchema);
    expect(getBrokerOperationByMethodName('reclaimReview').requestSchema).toBe(ReclaimReviewRequestSchema);
    expect(getBrokerOperationByMethodName('reclaimReview').responseSchema).toBe(ReclaimReviewResponseSchema);
    expect(getBrokerOperationByMethodName('submitVerdict').requestSchema).toBe(SubmitVerdictRequestSchema);
    expect(getBrokerOperationByMethodName('submitVerdict').responseSchema).toBe(SubmitVerdictResponseSchema);
    expect(getBrokerOperationByMethodName('closeReview').requestSchema).toBe(CloseReviewRequestSchema);
    expect(getBrokerOperationByMethodName('closeReview').responseSchema).toBe(CloseReviewResponseSchema);
    expect(getBrokerOperationByMethodName('addMessage').requestSchema).toBe(AddMessageRequestSchema);
    expect(getBrokerOperationByMethodName('addMessage').responseSchema).toBe(AddMessageResponseSchema);
    expect(getBrokerOperationByMethodName('getDiscussion').requestSchema).toBe(GetDiscussionRequestSchema);
    expect(getBrokerOperationByMethodName('getDiscussion').responseSchema).toBe(GetDiscussionResponseSchema);
    expect(getBrokerOperationByMethodName('getActivityFeed').requestSchema).toBe(GetActivityFeedRequestSchema);
    expect(getBrokerOperationByMethodName('getActivityFeed').responseSchema).toBe(GetActivityFeedResponseSchema);
    expect(getBrokerOperationByMethodName('acceptCounterPatch').requestSchema).toBe(AcceptCounterPatchRequestSchema);
    expect(getBrokerOperationByMethodName('acceptCounterPatch').responseSchema).toBe(AcceptCounterPatchResponseSchema);
    expect(getBrokerOperationByMethodName('rejectCounterPatch').requestSchema).toBe(RejectCounterPatchRequestSchema);
    expect(getBrokerOperationByMethodName('rejectCounterPatch').responseSchema).toBe(RejectCounterPatchResponseSchema);
  });

  it('parses shared review payloads through registry helpers without re-describing schemas per caller', () => {
    expect(
      parseBrokerOperationRequest('createReview', {
        title: 'Registry-backed create review',
        description: 'Validate inputs through the canonical operation registry.',
        diff: 'diff --git a/file.ts b/file.ts',
        authorId: 'agent-cari',
      }).priority,
    ).toBe('normal');

    expect(
      parseBrokerOperationResponse('getReviewStatus', {
        review: {
          reviewId: 'rvw_123',
          title: 'Registry-backed status',
          workspaceRoot: '/work/registry-backed',
          projectName: 'registry-backed',
          status: 'pending',
          priority: 'normal',
          authorId: 'agent-cari',
          createdAt: '2026-03-21T00:00:00.000Z',
          updatedAt: '2026-03-21T00:00:00.000Z',
          claimedBy: null,
          claimedAt: null,
          claimGeneration: 0,
          currentRound: 1,
          latestVerdict: null,
          verdictReason: null,
          counterPatchStatus: 'none',
          lastMessageAt: null,
          lastActivityAt: '2026-03-21T00:00:00.000Z',
        },
        version: 1,
      }).version,
    ).toBe(1);
  });
});
