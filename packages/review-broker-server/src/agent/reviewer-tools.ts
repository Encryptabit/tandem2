import { Type, StringEnum } from '@gsd/pi-ai';
import type { AgentTool, AgentToolResult } from '@gsd/pi-agent-core';

import type { BrokerService } from '../runtime/broker-service.js';

/**
 * Creates the 6 AgentTools that wrap BrokerService methods for the reviewer agent.
 *
 * The `reviewerId` is captured in the closure and injected as `claimantId` / `actorId`
 * where the BrokerService expects it — the LLM never sees or provides these fields.
 */
export function createReviewerAgentTools(
  brokerService: BrokerService,
  reviewerId: string,
): AgentTool<any>[] {
  function textResult<T>(result: T): AgentToolResult<T> {
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      details: result,
    };
  }

  const listReviews: AgentTool<any> = {
    name: 'list_reviews',
    description:
      'List reviews in the broker, optionally filtered by status. Returns an array of review summaries with reviewId, title, status, priority, and lifecycle metadata.',
    parameters: Type.Object({
      status: Type.Optional(
        Type.String({ description: 'Filter by review status (e.g. "pending", "claimed", "submitted", "changes_requested", "approved", "closed")' }),
      ),
      limit: Type.Optional(
        Type.Number({ description: 'Maximum number of reviews to return (1–100)', minimum: 1, maximum: 100 }),
      ),
    }),
    label: 'List Reviews',
    async execute(_toolCallId, params) {
      const result = await brokerService.listReviews(params);
      return textResult(result);
    },
  };

  const claimReview: AgentTool<any> = {
    name: 'claim_review',
    description:
      'Claim a pending review for yourself. You must claim a review before you can read its proposal or submit a verdict. Returns the claim outcome and updated review summary.',
    parameters: Type.Object({
      reviewId: Type.String({ description: 'The ID of the review to claim' }),
    }),
    label: 'Claim Review',
    async execute(_toolCallId, params) {
      const result = await brokerService.claimReview({
        reviewId: params.reviewId,
        claimantId: reviewerId,
      });
      return textResult(result);
    },
  };

  const getProposal: AgentTool<any> = {
    name: 'get_proposal',
    description:
      'Get the full proposal for a review, including the diff, title, description, affected files, and lifecycle state. Use this to read the code changes before making a verdict.',
    parameters: Type.Object({
      reviewId: Type.String({ description: 'The ID of the review to get the proposal for' }),
    }),
    label: 'Get Proposal',
    async execute(_toolCallId, params) {
      const result = await brokerService.getProposal({ reviewId: params.reviewId });
      return textResult(result);
    },
  };

  const getReviewStatus: AgentTool<any> = {
    name: 'get_review_status',
    description:
      'Get the current status and metadata for a review. Returns the review summary including status, claimant, verdict, and round information.',
    parameters: Type.Object({
      reviewId: Type.String({ description: 'The ID of the review to check' }),
    }),
    label: 'Get Review Status',
    async execute(_toolCallId, params) {
      const result = await brokerService.getReviewStatus({ reviewId: params.reviewId });
      return textResult(result);
    },
  };

  const submitVerdict: AgentTool<any> = {
    name: 'submit_verdict',
    description:
      'Submit your final verdict on a claimed review. You must provide a detailed reason explaining your decision. Use "approved" when the changes are correct and complete, or "changes_requested" when issues need to be addressed.',
    parameters: Type.Object({
      reviewId: Type.String({ description: 'The ID of the review to submit a verdict for' }),
      verdict: StringEnum(['changes_requested', 'approved'], {
        description: 'Your verdict: "approved" if the changes are correct, "changes_requested" if issues need fixing',
      }),
      reason: Type.String({ description: 'Detailed explanation of your verdict — what you found, why you made this decision, and any specific issues or strengths' }),
    }),
    label: 'Submit Verdict',
    async execute(_toolCallId, params) {
      const result = await brokerService.submitVerdict({
        reviewId: params.reviewId,
        actorId: reviewerId,
        verdict: params.verdict,
        reason: params.reason,
      });
      return textResult(result);
    },
  };

  const addMessage: AgentTool<any> = {
    name: 'add_message',
    description:
      'Add a discussion message to a review. Use this for inline feedback, questions, or specific comments on particular parts of the code before submitting your final verdict.',
    parameters: Type.Object({
      reviewId: Type.String({ description: 'The ID of the review to add a message to' }),
      body: Type.String({ description: 'The message content — specific feedback, questions, or comments about the code changes' }),
    }),
    label: 'Add Message',
    async execute(_toolCallId, params) {
      const result = await brokerService.addMessage({
        reviewId: params.reviewId,
        actorId: reviewerId,
        body: params.body,
      });
      return textResult(result);
    },
  };

  return [listReviews, claimReview, getProposal, getReviewStatus, submitVerdict, addMessage];
}
