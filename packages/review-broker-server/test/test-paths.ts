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

/** Absolute path to the broker CLI entrypoint (TypeScript source). */
export const CLI_PATH = path.join(
  WORKTREE_ROOT,
  'packages',
  'review-broker-server',
  'src',
  'cli',
  'start-broker.ts',
);

/** Absolute path to the tsx binary in the workspace. */
export const TSX_PATH = path.join(WORKTREE_ROOT, 'node_modules', '.bin', 'tsx');

/** Absolute path to the built Astro dashboard dist directory. */
export const DASHBOARD_DIST_PATH = path.join(
  WORKTREE_ROOT,
  'packages',
  'review-broker-dashboard',
  'dist',
);

/** Absolute path to the test fixtures directory. */
export const FIXTURES_DIR = path.join(
  WORKTREE_ROOT,
  'packages',
  'review-broker-server',
  'test',
  'fixtures',
);
