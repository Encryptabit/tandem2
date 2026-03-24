import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBlockedReviewPolicy, resolveReviewPreferences } from '../preferences.ts';

test('mode-default resolves to auto-loop for auto mode', () => {
  assert.equal(resolveBlockedReviewPolicy('mode-default', 'auto'), 'auto-loop');
  assert.equal(resolveReviewPreferences(undefined, 'auto').blockedPolicy, 'auto-loop');
});

test('mode-default resolves to intervene for human mode', () => {
  assert.equal(resolveBlockedReviewPolicy('mode-default', 'human'), 'intervene');
  assert.equal(resolveReviewPreferences(undefined, 'human').blockedPolicy, 'intervene');
});

test('explicit blocked policy wins over mode defaults', () => {
  assert.equal(resolveBlockedReviewPolicy('intervene', 'auto'), 'intervene');
  assert.equal(resolveReviewPreferences({ review: { blockedPolicy: 'auto-loop' } }, 'human').blockedPolicy, 'auto-loop');
});
