import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));

export const WORKTREE_ROOT = path.resolve(TEST_DIRECTORY, '../../..');
export const REVIEWER_FIXTURE_RELATIVE_PATH = 'packages/review-broker-server/test/fixtures/reviewer-worker.mjs';
export const FIXTURE_PATH = REVIEWER_FIXTURE_RELATIVE_PATH;
export const REVIEWER_FIXTURE_PATH = REVIEWER_FIXTURE_RELATIVE_PATH;
export const ABSOLUTE_REVIEWER_FIXTURE_PATH = path.join(
  WORKTREE_ROOT,
  'packages',
  'review-broker-server',
  'test',
  'fixtures',
  'reviewer-worker.mjs',
);
