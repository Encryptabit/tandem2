import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAppContext } from '../src/runtime/app-context.js';
import { createBrokerService } from '../src/runtime/broker-service.js';
import { setConfigValue } from '../src/cli/config.js';

import { BROKER_OPERATIONS, BROKER_OPERATION_MCP_TOOL_NAMES } from 'review-broker-core';

import { TANDEM_CLI_PATH, TSX_PATH, WORKTREE_ROOT } from './test-paths.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Run the tandem CLI with the given args via spawnSync.
 */
function runTandem(args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(TSX_PATH, [TANDEM_CLI_PATH, ...args], {
    cwd: WORKTREE_ROOT,
    encoding: 'utf8',
    env: process.env,
  });
}

function runTandemWithEnv(args: string[], env: NodeJS.ProcessEnv): ReturnType<typeof spawnSync> {
  return spawnSync(TSX_PATH, [TANDEM_CLI_PATH, ...args], {
    cwd: WORKTREE_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

/**
 * Parse the JSON output from a tandem --json command.
 * The CLI writes a single pretty-printed JSON object to stdout.
 */
function parseJsonOutput(stdout: string): unknown {
  return JSON.parse(stdout.trim());
}

function buildReplacementDiff(fileName: string, exportedName: string): string {
  return [
    `diff --git a/packages/review-broker-server/src/runtime/${fileName} b/packages/review-broker-server/src/runtime/${fileName}`,
    'new file mode 100644',
    'index 0000000..6c55ed8',
    '--- /dev/null',
    `+++ b/packages/review-broker-server/src/runtime/${fileName}`,
    '@@ -0,0 +1,3 @@',
    `+export const ${exportedName} = 'round2';`,
    '+',
    `+console.log(${exportedName});`,
    '',
  ].join('\n');
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('tandem CLI smoke tests', () => {
  let tempDir: string;
  let dbPath: string;
  let reviewId: string;
  let reviewId2: string;
  let reviewId3: string;
  let reviewId4: string;
  let reviewerId: string;

  beforeAll(async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'tandem-cli-smoke-'));
    dbPath = path.join(tempDir, 'test.sqlite');

    const context = createAppContext({
      cwd: WORKTREE_ROOT,
      dbPath,
    });
    const service = createBrokerService(context);

    try {
      // Spawn a reviewer (creates the reviewer row + a real child process)
      const reviewer = await service.spawnReviewer({
        reviewerId: 'test-reviewer-1',
        command: process.execPath,
        args: [path.join('packages', 'review-broker-server', 'test', 'fixtures', 'reviewer-worker.mjs')],
        cwd: 'packages/review-broker-server',
      });
      reviewerId = reviewer.reviewer.reviewerId;

      // Create a review with a diff
      const diff = readFileSync(
        path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'test', 'fixtures', 'valid-review.diff'),
        'utf8',
      );
      const created = await service.createReview({
        title: 'Test review for CLI smoke tests',
        description: 'A review seeded by the tandem-cli test suite to verify CLI output.',
        diff,
        authorId: 'test-author',
        priority: 'high',
      });
      reviewId = created.review.reviewId;

      // Add a discussion message
      await service.addMessage({
        reviewId: created.review.reviewId,
        actorId: 'test-author',
        body: 'Initial comment on the review for testing discussion output.',
      });

      // Claim the first review so verdict/close tests can run on it
      await service.claimReview({
        reviewId: created.review.reviewId,
        claimantId: 'cli-tester',
      });

      // Create a second review for claim/reclaim tests (stays in pending state)
      const created2 = await service.createReview({
        title: 'Second test review for write commands',
        description: 'A second review for claim/reclaim testing.',
        diff,
        authorId: 'test-author',
        priority: 'normal',
      });
      reviewId2 = created2.review.reviewId;

      // Create two reviews through the full counter-patch lifecycle
      // (create → claim → verdict(changes_requested) → addMessage(actorId=authorId))
      // so that proposal accept/reject happy paths can be tested.
      // Each needs its own review because accept/reject are terminal operations.
      for (const [idx, setter] of [
        [3, (id: string) => { reviewId3 = id; }],
        [4, (id: string) => { reviewId4 = id; }],
      ] as [number, (id: string) => void][]) {
        const cpReview = await service.createReview({
          title: `Counter-patch lifecycle review ${idx}`,
          description: `Seeded for proposal ${idx === 3 ? 'accept' : 'reject'} CLI test.`,
          diff,
          authorId: 'test-author',
          priority: 'normal',
        });
        setter(cpReview.review.reviewId);

        await service.claimReview({
          reviewId: cpReview.review.reviewId,
          claimantId: 'cli-tester',
        });
        await service.submitVerdict({
          reviewId: cpReview.review.reviewId,
          actorId: 'cli-tester',
          verdict: 'changes_requested',
          reason: `Needs changes (review ${idx}).`,
        });
        // actorId must match authorId ('test-author') to trigger proposer-requeue
        // and set counterPatchStatus to 'pending'
        const requeued = await service.addMessage({
          reviewId: cpReview.review.reviewId,
          actorId: 'test-author',
          body: `Counter-patch submitted for review ${idx}.`,
        });
        // Sanity check: the seeding produced the expected state
        if (requeued.review?.counterPatchStatus !== 'pending') {
          throw new Error(
            `Expected counterPatchStatus='pending' for review ${idx}, got '${requeued.review?.counterPatchStatus}'`,
          );
        }
      }
    } finally {
      context.close();
      // Allow time for reviewer child process cleanup (SIGTERM)
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  });

  afterAll(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ─── status ──────────────────────────────────────────────────────────────

  describe('tandem status', () => {
    it('returns broker status as JSON', () => {
      const result = runTandem(['status', '--json', '--db-path', dbPath]);

      expect(result.status).toBe(0);
      const output = parseJsonOutput(result.stdout as string) as Record<string, unknown>;
      expect(output).toHaveProperty('reviewCount');
      expect(output).toHaveProperty('reviewerCount');
      expect(output).toHaveProperty('statusCounts');
      expect(output.reviewCount).toBeGreaterThanOrEqual(1);
    });

    it('prints human-readable output without --json', () => {
      const result = runTandem(['status', '--db-path', dbPath]);

      expect(result.status).toBe(0);
      const stdout = result.stdout as string;
      // Human-readable format uses formatDetail with labels like "Reviews:", "Reviewers:", etc.
      expect(stdout).toMatch(/Reviews:/i);
      expect(stdout).toMatch(/Reviewers:/i);
      expect(stdout).toMatch(/Messages:/i);
    });

    it('does not run pool scaling or startup recovery for short-lived status commands', () => {
      const directory = mkdtempSync(path.join(os.tmpdir(), 'tandem-cli-no-pool-'));
      const localDbPath = path.join(directory, 'broker.sqlite');
      const configPath = path.join(directory, 'review-broker-config.json');
      writeFileSync(
        configPath,
        JSON.stringify(
          {
            reviewer_pool: {
              max_pool_size: 3,
              scaling_ratio: 1,
              idle_timeout_seconds: 300,
              max_ttl_seconds: 3600,
              claim_timeout_seconds: 300,
              spawn_cooldown_seconds: 1,
              background_check_interval_seconds: 5,
            },
            reviewer: {
              provider: 'fixture',
              providers: {
                fixture: {
                  command: process.execPath,
                  args: [path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'test', 'fixtures', 'reviewer-worker.mjs')],
                },
              },
            },
          },
          null,
          2,
        ) + '\n',
      );

      const context = createAppContext({
        cwd: WORKTREE_ROOT,
        dbPath: localDbPath,
      });
      try {
        const now = '2026-04-24T12:00:00.000Z';
        context.reviewers.recordSpawned({
          reviewerId: 'live-cli-reviewer',
          command: process.execPath,
          args: ['fixture-worker.mjs'],
          pid: 12345,
          startedAt: now,
          lastSeenAt: now,
          sessionToken: 'existing-dashboard-session',
          createdAt: now,
          updatedAt: now,
        });
      } finally {
        context.close();
      }

      const result = runTandemWithEnv(['status', '--json', '--db-path', localDbPath], {
        REVIEW_BROKER_CONFIG_PATH: configPath,
      });

      expect(result.status).toBe(0);

      const verification = createAppContext({
        cwd: WORKTREE_ROOT,
        dbPath: localDbPath,
      });
      try {
        expect(verification.reviewers.getById('live-cli-reviewer')).toMatchObject({
          pid: 12345,
          offlineAt: null,
        });
        const lifecycleEvents = verification.db
          .prepare<unknown[], { event_type: string }>(
            `SELECT event_type FROM audit_events WHERE event_type IN ('reviewer.offline', 'pool.scale_up')`,
          )
          .all();
        expect(lifecycleEvents).toHaveLength(0);
      } finally {
        verification.close();
        rmSync(directory, { recursive: true, force: true });
      }
    });
  });

  // ─── reviews list ────────────────────────────────────────────────────────

  describe('tandem reviews list', () => {
    it('lists reviews as JSON', () => {
      const result = runTandem(['reviews', 'list', '--json', '--db-path', dbPath]);

      expect(result.status).toBe(0);
      const output = parseJsonOutput(result.stdout as string) as { reviews: Array<Record<string, unknown>> };
      expect(output.reviews).toBeInstanceOf(Array);
      expect(output.reviews.length).toBeGreaterThanOrEqual(1);
      expect(output.reviews[0]).toHaveProperty('reviewId');
      expect(output.reviews[0]).toHaveProperty('title');
      expect(output.reviews[0]).toHaveProperty('status');
    });

    it('filters reviews by --status pending', () => {
      const result = runTandem(['reviews', 'list', '--status', 'pending', '--json', '--db-path', dbPath]);

      expect(result.status).toBe(0);
      const output = parseJsonOutput(result.stdout as string) as { reviews: Array<Record<string, unknown>> };
      expect(output.reviews).toBeInstanceOf(Array);
      expect(output.reviews.length).toBeGreaterThanOrEqual(1);
      for (const review of output.reviews) {
        expect(review.status).toBe('pending');
      }
    });
  });

  // ─── reviews show ────────────────────────────────────────────────────────

  describe('tandem reviews show', () => {
    it('shows a specific review as JSON', () => {
      const result = runTandem(['reviews', 'show', reviewId, '--json', '--db-path', dbPath]);

      expect(result.status).toBe(0);
      const output = parseJsonOutput(result.stdout as string) as { review: Record<string, unknown> };
      expect(output.review).toBeDefined();
      expect(output.review.reviewId).toBe(reviewId);
    });
  });

  // ─── proposal show ──────────────────────────────────────────────────────

  describe('tandem proposal show', () => {
    it('shows the proposal as JSON', () => {
      const result = runTandem(['proposal', 'show', reviewId, '--json', '--db-path', dbPath]);

      expect(result.status).toBe(0);
      const output = parseJsonOutput(result.stdout as string) as { proposal: Record<string, unknown> };
      expect(output.proposal).toBeDefined();
      expect(output.proposal.reviewId).toBe(reviewId);
      expect(output.proposal).toHaveProperty('title');
      expect(output.proposal).toHaveProperty('description');
      expect(output.proposal).toHaveProperty('diff');
    });
  });

  // ─── discussion show ────────────────────────────────────────────────────

  describe('tandem discussion show', () => {
    it('shows discussion messages as JSON', () => {
      const result = runTandem(['discussion', 'show', reviewId, '--json', '--db-path', dbPath]);

      expect(result.status).toBe(0);
      const output = parseJsonOutput(result.stdout as string) as { messages: Array<Record<string, unknown>> };
      expect(output.messages).toBeInstanceOf(Array);
      expect(output.messages.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── activity ────────────────────────────────────────────────────────────

  describe('tandem activity', () => {
    it('shows activity feed as JSON', () => {
      const result = runTandem(['activity', reviewId, '--json', '--db-path', dbPath]);

      expect(result.status).toBe(0);
      const output = parseJsonOutput(result.stdout as string) as { activity: Array<Record<string, unknown>> };
      expect(output.activity).toBeInstanceOf(Array);
      expect(output.activity.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── reviewers list ──────────────────────────────────────────────────────

  describe('tandem reviewers list', () => {
    it('lists reviewers as JSON', () => {
      const result = runTandem(['reviewers', 'list', '--json', '--db-path', dbPath]);

      expect(result.status).toBe(0);
      const output = parseJsonOutput(result.stdout as string) as { reviewers: Array<Record<string, unknown>> };
      expect(output.reviewers).toBeInstanceOf(Array);
      expect(output.reviewers.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Error cases ─────────────────────────────────────────────────────────

  describe('error cases', () => {
    it('exits non-zero for unknown subcommand', () => {
      const result = runTandem(['bogus', '--db-path', dbPath]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/Unknown command/i);
    });

    it('exits non-zero when <id> is missing for reviews show', () => {
      const result = runTandem(['reviews', 'show', '--db-path', dbPath]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/Missing required <id>/i);
    });
  });

  // ─── Config ──────────────────────────────────────────────────────────────

  describe('tandem config', () => {
    let configDir: string;
    let configFilePath: string;

    beforeAll(() => {
      configDir = mkdtempSync(path.join(os.tmpdir(), 'tandem-config-smoke-'));
      configFilePath = path.join(configDir, 'config.json');
    });

    afterAll(() => {
      if (configDir) {
        rmSync(configDir, { recursive: true, force: true });
      }
    });

    function runTandemWithConfig(args: string[]): ReturnType<typeof spawnSync> {
      return spawnSync(TSX_PATH, [TANDEM_CLI_PATH, ...args], {
        cwd: WORKTREE_ROOT,
        encoding: 'utf8',
        env: { ...process.env, REVIEW_BROKER_CONFIG_PATH: configFilePath },
      });
    }

    it('config set writes a value (exit 0)', () => {
      const result = runTandemWithConfig([
        'config', 'set', 'reviewer.provider', 'anthropic',
        '--db-path', dbPath,
      ]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('reviewer.provider');
    });

    it('config show --json returns the set value', () => {
      const result = runTandemWithConfig([
        'config', 'show', '--json',
        '--db-path', dbPath,
      ]);

      expect(result.status).toBe(0);
      const output = parseJsonOutput(result.stdout as string) as Record<string, unknown>;
      expect(output).toHaveProperty('reviewer');
      const reviewer = output.reviewer as Record<string, unknown>;
      expect(reviewer.provider).toBe('anthropic');
    });

    it('config show (human-readable) includes the key name', () => {
      const result = runTandemWithConfig([
        'config', 'show',
        '--db-path', dbPath,
      ]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('reviewer');
    });
  });

  // ─── reviewers spawn ──────────────────────────────────────────────────

  describe('reviewers spawn', () => {
    const spawnedReviewerIds: string[] = [];

    afterAll(() => {
      // Kill any spawned reviewers to prevent test hangs
      for (const id of spawnedReviewerIds) {
        try {
          runTandem(['reviewers', 'kill', id, '--db-path', dbPath]);
        } catch {
          // Ignore kill errors during cleanup
        }
      }
    });

    it('spawns a reviewer with explicit --command (JSON output)', () => {
      const result = runTandem([
        'reviewers', 'spawn',
        '--command', process.execPath,
        '--args', path.join('packages', 'review-broker-server', 'test', 'fixtures', 'reviewer-worker.mjs'),
        '--json', '--db-path', dbPath,
      ]);

      expect(result.status).toBe(0);
      const output = parseJsonOutput(result.stdout as string) as {
        reviewer: Record<string, unknown>;
      };
      expect(output.reviewer).toBeDefined();
      expect(output.reviewer.reviewerId).toBeDefined();
      expect(typeof output.reviewer.reviewerId).toBe('string');
      expect(output.reviewer.status).toBeDefined();
      spawnedReviewerIds.push(output.reviewer.reviewerId as string);
    });

    it('supports --detached reviewer spawn for long-lived workers', () => {
      const result = runTandem([
        'reviewers', 'spawn',
        '--command', process.execPath,
        '--args', path.join('packages', 'review-broker-server', 'test', 'fixtures', 'reviewer-worker.mjs'),
        '--detached',
        '--json', '--db-path', dbPath,
      ]);

      expect(result.status).toBe(0);
      const output = parseJsonOutput(result.stdout as string) as {
        reviewer: Record<string, unknown>;
      };
      const pid = output.reviewer.pid as number;
      expect(typeof pid).toBe('number');
      expect(() => process.kill(pid, 0)).not.toThrow();
      process.kill(pid, 'SIGTERM');
    });

    it('spawns a reviewer with --provider after configuring provider', () => {
      // Seed config with a test provider
      const spawnConfigDir = mkdtempSync(path.join(os.tmpdir(), 'tandem-spawn-config-'));
      const spawnConfigFilePath = path.join(spawnConfigDir, 'config.json');
      const fixtureRelPath = path.join('packages', 'review-broker-server', 'test', 'fixtures', 'reviewer-worker.mjs');

      setConfigValue(spawnConfigFilePath, 'reviewer.providers.test-provider.command', process.execPath);
      setConfigValue(
        spawnConfigFilePath,
        'reviewer.providers.test-provider.args',
        JSON.stringify([fixtureRelPath]),
      );

      const result = spawnSync(TSX_PATH, [
        TANDEM_CLI_PATH,
        'reviewers', 'spawn', '--provider', 'test-provider',
        '--json', '--db-path', dbPath,
      ], {
        cwd: WORKTREE_ROOT,
        encoding: 'utf8',
        env: { ...process.env, REVIEW_BROKER_CONFIG_PATH: spawnConfigFilePath },
      });

      expect(result.status).toBe(0);
      const output = parseJsonOutput(result.stdout as string) as {
        reviewer: Record<string, unknown>;
      };
      expect(output.reviewer).toBeDefined();
      expect(output.reviewer.reviewerId).toBeDefined();
      spawnedReviewerIds.push(output.reviewer.reviewerId as string);

      // Cleanup temp config dir
      rmSync(spawnConfigDir, { recursive: true, force: true });
    });

    it('exits non-zero when neither --command nor --provider is given', () => {
      const result = runTandem([
        'reviewers', 'spawn',
        '--json', '--db-path', dbPath,
      ]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/Either --command or --provider/i);
    });

    it('exits non-zero for an unknown provider name', () => {
      const unknownConfigDir = mkdtempSync(path.join(os.tmpdir(), 'tandem-spawn-unknown-'));
      const unknownConfigFilePath = path.join(unknownConfigDir, 'config.json');

      const result = spawnSync(TSX_PATH, [
        TANDEM_CLI_PATH,
        'reviewers', 'spawn', '--provider', 'nonexistent-provider',
        '--json', '--db-path', dbPath,
      ], {
        cwd: WORKTREE_ROOT,
        encoding: 'utf8',
        env: { ...process.env, REVIEW_BROKER_CONFIG_PATH: unknownConfigFilePath },
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/Unknown provider/i);

      rmSync(unknownConfigDir, { recursive: true, force: true });
    });
  });

  // ─── Help ────────────────────────────────────────────────────────────────

  describe('help', () => {
    it('prints usage with available commands', () => {
      const result = runTandem(['--help']);

      expect(result.status).toBe(0);
      const stdout = result.stdout as string;
      expect(stdout).toContain('status');
      expect(stdout).toContain('reviews');
      expect(stdout).toContain('reviewers');
    });

    it('lists write commands in help output', () => {
      const result = runTandem(['--help']);

      expect(result.status).toBe(0);
      const stdout = result.stdout as string;
      expect(stdout).toContain('reviews claim');
      expect(stdout).toContain('reviews verdict');
      expect(stdout).toContain('reviews close');
      expect(stdout).toContain('discussion add');
      expect(stdout).toContain('proposal accept');
      expect(stdout).toContain('proposal reject');
    });

    it('lists reviews create, reviewers spawn, and reviewers kill in help output', () => {
      const result = runTandem(['--help']);

      expect(result.status).toBe(0);
      const stdout = result.stdout as string;
      expect(stdout).toContain('reviews create');
      expect(stdout).toContain('reviewers spawn');
      expect(stdout).toContain('reviewers kill');
    });

    it('lists dashboard in help output', () => {
      const result = runTandem(['--help']);

      expect(result.status).toBe(0);
      const stdout = result.stdout as string;
      expect(stdout).toContain('dashboard');
    });
  });

  // ─── dashboard ───────────────────────────────────────────────────────────

  describe('dashboard', () => {
    it('dashboard --help shows --port and --host options', () => {
      const result = runTandem(['dashboard', '--help']);

      expect(result.status).toBe(0);
      const stdout = result.stdout as string;
      expect(stdout).toContain('--port');
      expect(stdout).toContain('--host');
      expect(stdout).toContain('local extension DB');
      expect(stdout).toContain('otherwise global');
    });
  });

  // ─── reviews create ────────────────────────────────────────────────────

  describe('reviews create', () => {
    it('creates a review from a diff file (JSON output)', () => {
      const diffPath = path.join(
        WORKTREE_ROOT,
        'packages',
        'review-broker-server',
        'test',
        'fixtures',
        'valid-review.diff',
      );
      const result = runTandem([
        'reviews', 'create',
        '--title', 'CLI Created Review',
        '--description', 'From CLI test',
        '--diff-file', diffPath,
        '--author', 'cli-tester',
        '--json', '--db-path', dbPath,
      ]);

      expect(result.status).toBe(0);
      const output = parseJsonOutput(result.stdout as string) as {
        review: Record<string, unknown>;
        proposal: Record<string, unknown>;
      };
      expect(output.review).toBeDefined();
      expect(output.review.reviewId).toBeDefined();
      expect(output.review.status).toBe('pending');
      expect(output.proposal).toBeDefined();
    });

    it('exits non-zero when --title is missing', () => {
      const result = runTandem([
        'reviews', 'create',
        '--description', 'No title',
        '--diff-file', '/tmp/doesnt-matter.diff',
        '--author', 'cli-tester',
        '--json', '--db-path', dbPath,
      ]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/Missing required --title/i);
    });

    it('exits non-zero when --diff-file is missing', () => {
      const result = runTandem([
        'reviews', 'create',
        '--title', 'Missing diff',
        '--description', 'No diff file flag',
        '--author', 'cli-tester',
        '--json', '--db-path', dbPath,
      ]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/Missing required --diff-file/i);
    });

    it('exits non-zero for a nonexistent diff file path', () => {
      const result = runTandem([
        'reviews', 'create',
        '--title', 'Bad path',
        '--description', 'File does not exist',
        '--diff-file', '/tmp/nonexistent-path-abc123.diff',
        '--author', 'cli-tester',
        '--json', '--db-path', dbPath,
      ]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/Cannot read diff file/i);
    });
  });

  // ─── Write Commands ──────────────────────────────────────────────────────

  describe('reviews claim', () => {
    it('claims a pending review (JSON output)', () => {
      const result = runTandem([
        'reviews', 'claim', reviewId2, '--actor', 'cli-tester',
        '--json', '--db-path', dbPath,
      ]);

      expect(result.status).toBe(0);
      const output = parseJsonOutput(result.stdout as string) as Record<string, unknown>;
      expect(output).toHaveProperty('outcome');
      expect(output.outcome).toBe('claimed');
      expect(output).toHaveProperty('version');
    });
  });

  describe('reviews verdict', () => {
    it('submits an approved verdict (JSON output)', () => {
      const result = runTandem([
        'reviews', 'verdict', reviewId, '--actor', 'cli-tester',
        '--verdict', 'approved', '--reason', 'LGTM',
        '--json', '--db-path', dbPath,
      ]);

      expect(result.status).toBe(0);
      const output = parseJsonOutput(result.stdout as string) as Record<string, unknown>;
      expect(output).toHaveProperty('review');
      expect(output).toHaveProperty('proposal');
      expect(output).toHaveProperty('version');
    });

    it('allows CLI operator approval from changes_requested', async () => {
      const directory = mkdtempSync(path.join(os.tmpdir(), 'tandem-cli-verdict-override-'));
      const localDbPath = path.join(directory, 'test.sqlite');
      const context = createAppContext({
        cwd: WORKTREE_ROOT,
        dbPath: localDbPath,
      });
      const service = createBrokerService(context);

      let localReviewId: string;
      try {
        const created = await service.createReview({
          title: 'CLI override review',
          description: 'Seeded for operator approval after changes_requested.',
          diff: readFileSync(
            path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'test', 'fixtures', 'valid-review.diff'),
            'utf8',
          ),
          authorId: 'test-author',
          priority: 'normal',
        });
        localReviewId = created.review.reviewId;

        await service.claimReview({
          reviewId: localReviewId,
          claimantId: 'cli-reviewer',
        });
        await service.submitVerdict({
          reviewId: localReviewId,
          actorId: 'cli-reviewer',
          verdict: 'changes_requested',
          reason: 'Blocking feedback that the operator will override.',
        });
      } finally {
        context.close();
      }

      try {
        const result = runTandem([
          'reviews', 'verdict', localReviewId, '--actor', 'user',
          '--verdict', 'approved', '--reason', 'move it along',
          '--json', '--db-path', localDbPath,
        ]);

        expect(result.status).toBe(0);
        const output = parseJsonOutput(result.stdout as string) as Record<string, unknown>;
        const review = output.review as Record<string, unknown>;
        expect(review.status).toBe('approved');
        expect(review.latestVerdict).toBe('approved');
        expect(review.verdictReason).toBe('move it along');
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  });

  describe('discussion add', () => {
    it('adds a message to a review discussion (JSON output)', () => {
      const result = runTandem([
        'discussion', 'add', reviewId, '--actor', 'cli-tester',
        '--body', 'Test message from CLI', '--json', '--db-path', dbPath,
      ]);

      expect(result.status).toBe(0);
      const output = parseJsonOutput(result.stdout as string) as Record<string, unknown>;
      expect(output).toHaveProperty('message');
      expect(output).toHaveProperty('version');
      const message = output.message as Record<string, unknown>;
      expect(message.body).toBe('Test message from CLI');
    });

    it('can replace the canonical proposal diff when requeueing through the CLI', async () => {
      const directory = mkdtempSync(path.join(os.tmpdir(), 'tandem-cli-diff-requeue-'));
      const localDbPath = path.join(directory, 'test.sqlite');
      const diffPath = path.join(directory, 'replacement.diff');
      const originalDiff = readFileSync(
        path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'test', 'fixtures', 'valid-review.diff'),
        'utf8',
      );
      const replacementDiff = buildReplacementDiff('_proposal_fixture_cli_round2.ts', 'proposalFixtureCliRound2');
      writeFileSync(diffPath, replacementDiff, 'utf8');

      const context = createAppContext({
        cwd: WORKTREE_ROOT,
        dbPath: localDbPath,
      });
      const service = createBrokerService(context);

      let localReviewId: string;
      try {
        const created = await service.createReview({
          title: 'CLI replacement diff review',
          description: 'Seeded for discussion add --diff-file.',
          diff: originalDiff,
          authorId: 'test-author',
          priority: 'normal',
        });
        localReviewId = created.review.reviewId;

        await service.claimReview({
          reviewId: localReviewId,
          claimantId: 'cli-reviewer',
        });
        await service.submitVerdict({
          reviewId: localReviewId,
          actorId: 'cli-reviewer',
          verdict: 'changes_requested',
          reason: 'Please resubmit with the requested update.',
        });
      } finally {
        context.close();
      }

      try {
        const result = runTandem([
          'discussion', 'add', localReviewId, '--actor', 'test-author',
          '--body', 'Submitted the updated canonical patch.',
          '--diff-file', diffPath,
          '--json', '--db-path', localDbPath,
        ]);

        expect(result.status).toBe(0);
        const output = parseJsonOutput(result.stdout as string) as Record<string, unknown>;
        const review = output.review as Record<string, unknown>;
        expect(review.status).toBe('pending');
        expect(review.counterPatchStatus).toBe('pending');

        const proposalResult = runTandem(['proposal', 'show', localReviewId, '--json', '--db-path', localDbPath]);
        expect(proposalResult.status).toBe(0);
        const proposalOutput = parseJsonOutput(proposalResult.stdout as string) as { proposal: Record<string, unknown> };
        expect(proposalOutput.proposal.diff).toBe(replacementDiff);
        expect(proposalOutput.proposal.affectedFiles).toEqual([
          'packages/review-broker-server/src/runtime/_proposal_fixture_cli_round2.ts',
        ]);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  });

  describe('reviews close', () => {
    it('closes a review (JSON output)', () => {
      const result = runTandem([
        'reviews', 'close', reviewId, '--actor', 'cli-tester',
        '--json', '--db-path', dbPath,
      ]);

      expect(result.status).toBe(0);
      const output = parseJsonOutput(result.stdout as string) as Record<string, unknown>;
      expect(output).toHaveProperty('review');
      expect(output).toHaveProperty('version');
      const review = output.review as Record<string, unknown>;
      expect(review.status).toBe('closed');
    });
  });

  describe('reviews reclaim', () => {
    it('reclaims an already-claimed review (JSON output)', () => {
      const result = runTandem([
        'reviews', 'reclaim', reviewId2, '--actor', 'cli-tester',
        '--json', '--db-path', dbPath,
      ]);

      expect(result.status).toBe(0);
      const output = parseJsonOutput(result.stdout as string) as Record<string, unknown>;
      expect(output).toHaveProperty('review');
      expect(output).toHaveProperty('version');
    });
  });

  // ─── Proposal Accept / Reject (counter-patch) ────────────────────────────

  describe('proposal accept (counter-patch)', () => {
    it('accepts a pending counter-patch (JSON output)', () => {
      const result = runTandem([
        'proposal', 'accept', reviewId3, '--actor', 'cli-tester',
        '--json', '--db-path', dbPath,
      ]);

      expect(result.status).toBe(0);
      const output = parseJsonOutput(result.stdout as string) as {
        review: Record<string, unknown>;
      };
      expect(output.review).toBeDefined();
      expect(output.review.reviewId).toBe(reviewId3);
      expect(output.review.counterPatchStatus).toBe('accepted');
    });
  });

  describe('proposal reject (counter-patch)', () => {
    it('rejects a pending counter-patch (JSON output)', () => {
      const result = runTandem([
        'proposal', 'reject', reviewId4, '--actor', 'cli-tester',
        '--json', '--db-path', dbPath,
      ]);

      expect(result.status).toBe(0);
      const output = parseJsonOutput(result.stdout as string) as {
        review: Record<string, unknown>;
      };
      expect(output.review).toBeDefined();
      expect(output.review.reviewId).toBe(reviewId4);
      expect(output.review.counterPatchStatus).toBe('rejected');
    });
  });

  // ─── Write Command Error Cases ───────────────────────────────────────────

  describe('write command error cases', () => {
    it('reviews claim without --actor exits non-zero', () => {
      const result = runTandem([
        'reviews', 'claim', reviewId, '--db-path', dbPath,
      ]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/Missing required --actor/i);
    });

    it('reviews verdict with invalid --verdict exits non-zero', () => {
      const result = runTandem([
        'reviews', 'verdict', reviewId, '--actor', 'x',
        '--verdict', 'bogus', '--reason', 'test',
        '--db-path', dbPath,
      ]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/Invalid verdict/i);
    });

    it('reviews verdict without --verdict exits non-zero', () => {
      const result = runTandem([
        'reviews', 'verdict', reviewId, '--actor', 'x',
        '--db-path', dbPath,
      ]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/Missing required --verdict/i);
    });

    it('discussion add without --body exits non-zero', () => {
      const result = runTandem([
        'discussion', 'add', reviewId, '--actor', 'x',
        '--db-path', dbPath,
      ]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/Missing required --body/i);
    });

    it('proposal accept without --actor exits non-zero', () => {
      const result = runTandem([
        'proposal', 'accept', reviewId, '--db-path', dbPath,
      ]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/Missing required --actor/i);
    });

    it('reviews close without --actor exits non-zero', () => {
      const result = runTandem([
        'reviews', 'close', reviewId, '--db-path', dbPath,
      ]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/Missing required --actor/i);
    });
  });

  // ─── Cross-Surface Shared State ──────────────────────────────────────────

  describe('cross-surface shared state', () => {
    it('reads BrokerService-seeded data back via CLI (shared SQLite)', () => {
      const result = runTandem([
        'reviews', 'show', reviewId, '--json', '--db-path', dbPath,
      ]);

      expect(result.status).toBe(0);
      const output = parseJsonOutput(result.stdout as string) as {
        review: Record<string, unknown>;
      };
      expect(output.review.reviewId).toBe(reviewId);
      expect(output.review.title).toBe('Test review for CLI smoke tests');
    });
  });

  // ─── MCP ↔ CLI Parity Completeness ─────────────────────────────────────

  describe('MCP ↔ CLI parity completeness', () => {
    /**
     * Static mapping from every MCP tool name to its corresponding CLI
     * subcommand. If a new MCP tool is added to BROKER_OPERATIONS without
     * updating this mapping, the test below fails — forcing the author
     * to wire the CLI command and add test coverage.
     */
    const MCP_TOOL_TO_CLI_COMMAND: Record<string, string> = {
      create_review: 'reviews create',
      list_reviews: 'reviews list',
      spawn_reviewer: 'reviewers spawn',
      list_reviewers: 'reviewers list',
      kill_reviewer: 'reviewers kill',
      claim_review: 'reviews claim',
      get_review_status: 'reviews show',
      get_proposal: 'proposal show',
      reclaim_review: 'reviews reclaim',
      submit_verdict: 'reviews verdict',
      close_review: 'reviews close',
      add_message: 'discussion add',
      get_discussion: 'discussion show',
      get_activity_feed: 'activity',
      accept_counter_patch: 'proposal accept',
      reject_counter_patch: 'proposal reject',
    };

    it('every MCP tool name maps to a CLI command', () => {
      for (const toolName of BROKER_OPERATION_MCP_TOOL_NAMES) {
        expect(
          MCP_TOOL_TO_CLI_COMMAND,
          `MCP tool '${toolName}' has no CLI command mapping — add it to MCP_TOOL_TO_CLI_COMMAND and write a test`,
        ).toHaveProperty(toolName);
      }
    });

    it('mapping covers exactly the current set of MCP tools (no stale entries)', () => {
      const mappedTools = Object.keys(MCP_TOOL_TO_CLI_COMMAND).sort();
      const actualTools = [...BROKER_OPERATION_MCP_TOOL_NAMES].sort();
      expect(mappedTools).toEqual(actualTools);
    });
  });

  // ─── reviewers kill (destructive — placed last) ────────────────────────

  describe('reviewers kill', () => {
    it('kills a reviewer by ID (JSON output)', () => {
      const result = runTandem([
        'reviewers', 'kill', reviewerId,
        '--json', '--db-path', dbPath,
      ]);

      expect(result.status).toBe(0);
      const output = parseJsonOutput(result.stdout as string) as Record<string, unknown>;
      expect(output).toHaveProperty('outcome');
      expect(output).toHaveProperty('version');
    });

    it('exits non-zero when <id> is missing', () => {
      const result = runTandem([
        'reviewers', 'kill',
        '--db-path', dbPath,
      ]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/Missing required <id>/i);
    });
  });
});
