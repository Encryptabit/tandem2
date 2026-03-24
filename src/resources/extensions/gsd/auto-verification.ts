import type { ReviewGateResult } from './review/types.ts';
import type { VerificationRetryContext } from './auto/session.ts';

export function createVerificationRetry(summary: string): VerificationRetryContext {
  return {
    source: 'verification',
    summary,
  };
}

export function createReviewRetry(result: Extract<ReviewGateResult, { kind: 'block' | 'wait' }>): VerificationRetryContext {
  return {
    source: 'review',
    summary: result.summary,
    feedback: result.kind === 'block' ? result.feedback : undefined,
    reviewId: result.reviewId,
    blockedPolicy: result.blockedPolicy,
  };
}

export function formatPendingRetryPrompt(context: VerificationRetryContext): string {
  if (context.source === 'review') {
    const reviewRef = context.reviewId ? ` (${context.reviewId})` : '';
    const guidance =
      context.feedback && context.feedback !== context.summary
        ? `Summary: ${context.summary}\nReviewer feedback: ${context.feedback}`
        : context.feedback ?? context.summary;

    return `Broker review feedback${reviewRef} blocked the previous attempt. Update the same unit using this reviewer guidance before retrying:\n${guidance}`;
  }

  return `Verification failed on the previous attempt. Fix the reported issues before retrying:\n${context.summary}`;
}
