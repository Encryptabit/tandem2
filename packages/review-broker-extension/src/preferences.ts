import type {
  ResolvedBlockedReviewPolicy,
  ReviewMode,
  ReviewPreferences,
} from './types.js';

export interface GsdPreferences {
  review?: ReviewPreferences;
}

export interface ResolvedReviewPreferences {
  enabled: boolean;
  blockedPolicy: ResolvedBlockedReviewPolicy;
  mode: ReviewMode;
}

function extractReviewPreferences(input?: GsdPreferences | ReviewPreferences): ReviewPreferences | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  if ('review' in input) {
    return (input as GsdPreferences).review;
  }

  return input as ReviewPreferences;
}

export function resolveBlockedReviewPolicy(
  policy: ReviewPreferences['blockedPolicy'] = 'mode-default',
  mode: ReviewMode = 'auto',
): ResolvedBlockedReviewPolicy {
  if (policy === 'auto-loop' || policy === 'intervene') {
    return policy;
  }

  return mode === 'auto' ? 'auto-loop' : 'intervene';
}

export function resolveReviewPreferences(
  input?: GsdPreferences | ReviewPreferences,
  mode: ReviewMode = 'auto',
): ResolvedReviewPreferences {
  const review = extractReviewPreferences(input);

  return {
    enabled: review?.enabled ?? true,
    blockedPolicy: resolveBlockedReviewPolicy(review?.blockedPolicy, mode),
    mode,
  };
}
