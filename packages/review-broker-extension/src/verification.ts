import type { ReviewGateResult } from './types.js';
import type { VerificationRetryContext } from './session.js';

export function createVerificationRetry(summary: string): VerificationRetryContext {
  return {
    source: 'verification',
    summary,
  };
}

export function createReviewRetry(result: Extract<ReviewGateResult, { kind: 'block' | 'wait' }>): VerificationRetryContext {
  const ctx: VerificationRetryContext = {
    source: 'review',
    summary: result.summary,
    reviewId: result.reviewId,
    blockedPolicy: result.blockedPolicy,
  };
  if (result.kind === 'block' && result.feedback !== undefined) ctx.feedback = result.feedback;
  return ctx;
}

export function formatPendingRetryPrompt(context: VerificationRetryContext): string {
  if (context.source === 'review') {
    const reviewRef = context.reviewId ? ` (${context.reviewId})` : '';
    const guidance =
      context.feedback && context.feedback !== context.summary
        ? `Summary: ${context.summary}\nReviewer feedback: ${context.feedback}`
        : context.feedback ?? context.summary;

    if (context.blockedPolicy === 'intervene') {
      return [
        `Broker review feedback${reviewRef} blocked the previous attempt.`,
        '',
        'Present this feedback to the user, propose 2-3 concrete remediation options, and get explicit direction before editing code.',
        'Use ask_user_questions for the direction check, then implement the selected option in the same unit retry.',
        '',
        'Reviewer guidance:',
        guidance,
      ].join('\n');
    }

    return `Broker review feedback${reviewRef} blocked the previous attempt. Update the same unit using this reviewer guidance before retrying:\n${guidance}`;
  }

  return `Verification failed on the previous attempt. Fix the reported issues before retrying:\n${context.summary}`;
}
