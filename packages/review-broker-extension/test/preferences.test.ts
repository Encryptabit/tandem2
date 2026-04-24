import { describe, expect, it } from 'vitest';
import { resolveBlockedReviewPolicy, resolveReviewPreferences } from '../src/preferences.js';

describe('resolveReviewPreferences', () => {
  it('mode-default resolves to auto-loop for auto mode', () => {
    expect(resolveBlockedReviewPolicy('mode-default', 'auto')).toBe('auto-loop');
    expect(resolveReviewPreferences(undefined, 'auto').blockedPolicy).toBe('auto-loop');
  });

  it('mode-default resolves to intervene for human mode', () => {
    expect(resolveBlockedReviewPolicy('mode-default', 'human')).toBe('intervene');
    expect(resolveReviewPreferences(undefined, 'human').blockedPolicy).toBe('intervene');
  });

  it('explicit blocked policy wins over mode defaults', () => {
    expect(resolveBlockedReviewPolicy('intervene', 'auto')).toBe('intervene');
    expect(resolveReviewPreferences({ review: { blockedPolicy: 'auto-loop' } }, 'human').blockedPolicy).toBe('auto-loop');
  });
});
