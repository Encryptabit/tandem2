import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createBrokerTransportAdapter } from '../src/transport-adapter.js';
import type { BrokerClient } from 'review-broker-client';

const execFileAsync = promisify(execFile);

const tmpDirs: string[] = [];

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout;
}

async function createGitRepo(): Promise<string> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'tandem-transport-'));
  tmpDirs.push(dir);
  await git(dir, ['init', '--initial-branch=main']);
  await git(dir, ['config', 'user.email', 'test@example.com']);
  await git(dir, ['config', 'user.name', 'Test']);
  await mkdir(path.join(dir, 'src'), { recursive: true });
  writeFileSync(path.join(dir, 'src', 'sample.txt'), 'baseline\n');
  await git(dir, ['add', '-A']);
  await git(dir, ['commit', '-m', 'baseline']);
  return dir;
}

function fakeBrokerClient(opts: {
  capture?: {
    diff?: string;
    title?: string;
    counterPatchBody?: string;
    counterPatchDiff?: string;
    counterPatchReviewId?: string;
    counterPatchActorId?: string;
  };
  statusResponse?: {
    reviewId: string;
    status: string;
    latestVerdict: 'approved' | 'changes_requested' | null;
    updatedAt: string;
    verdictReason: string | null;
  };
  discussionMessages?: Array<{ authorRole: 'author' | 'reviewer'; body: string }>;
} = {}): BrokerClient {
  return {
    async createReview(req: any) {
      if (opts.capture) {
        opts.capture.diff = req.diff;
        opts.capture.title = req.title;
      }
      return {
        review: {
          reviewId: 'rvw_test_1',
          status: 'pending',
          latestVerdict: null,
          updatedAt: new Date().toISOString(),
          verdictReason: null,
        },
      };
    },
    async addMessage(req: any) {
      if (opts.capture) {
        opts.capture.counterPatchBody = req.body;
        opts.capture.counterPatchDiff = req.diff;
        opts.capture.counterPatchReviewId = req.reviewId;
        opts.capture.counterPatchActorId = req.actorId;
      }

      return {
        review: {
          reviewId: req.reviewId,
          status: 'pending',
          latestVerdict: 'changes_requested',
          updatedAt: new Date().toISOString(),
          verdictReason: null,
        },
        message: {
          messageId: 1,
          reviewId: req.reviewId,
          actorId: req.actorId,
          authorRole: 'author',
          body: req.body,
          createdAt: new Date().toISOString(),
        },
        version: 0,
      };
    },
    async getReviewStatus() {
      const status = opts.statusResponse ?? {
        reviewId: 'rvw_test_1',
        status: 'approved',
        latestVerdict: 'approved' as const,
        updatedAt: new Date().toISOString(),
        verdictReason: 'ok',
      };

      return {
        review: status,
      };
    },
    async getDiscussion() {
      return {
        review: {
          reviewId: opts.statusResponse?.reviewId ?? 'rvw_test_1',
          status: opts.statusResponse?.status ?? 'approved',
          latestVerdict: opts.statusResponse?.latestVerdict ?? 'approved',
          updatedAt: opts.statusResponse?.updatedAt ?? new Date().toISOString(),
          verdictReason: opts.statusResponse?.verdictReason ?? 'ok',
        },
        messages: (opts.discussionMessages ?? []).map((message, index) => ({
          messageId: index + 1,
          reviewId: opts.statusResponse?.reviewId ?? 'rvw_test_1',
          actorId: `${message.authorRole}-${index + 1}`,
          authorRole: message.authorRole,
          body: message.body,
          createdAt: new Date().toISOString(),
        })),
        version: 0,
      };
    },
  } as unknown as BrokerClient;
}

beforeEach(() => {
  // nothing; each test mints its own tmp dir
});

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('createBrokerTransportAdapter (committed proposal diff model)', () => {
  it('submits the latest committed diff when the worktree is clean', async () => {
    const cwd = await createGitRepo();
    writeFileSync(path.join(cwd, 'src', 'sample.txt'), 'baseline\nadded line\n');
    await git(cwd, ['add', '-A']);
    await git(cwd, ['commit', '-m', 'complete unit']);

    const capture: { diff?: string; title?: string } = {};
    const transport = createBrokerTransportAdapter({
      client: fakeBrokerClient({ capture }),
      cwd,
      authorId: 'tester',
    });

    const record = await transport.submitReview({ unitId: 'U-1', milestoneId: 'M01', taskId: 'T01' });

    expect(record.reviewId).toBe('rvw_test_1');
    expect(record.status).toBe('pending');
    expect(capture.diff).toContain('+added line');
    expect(capture.diff).toContain('src/sample.txt');
    expect(capture.title).toBe('Review: M01/T01');

    const status = await git(cwd, ['status', '--porcelain']);
    expect(status.trim()).toBe('');
  });

  it('still supports uncommitted worktree diffs without committing on approval', async () => {
    const cwd = await createGitRepo();
    writeFileSync(path.join(cwd, 'src', 'sample.txt'), 'baseline\nuncommitted line\n');

    const capture: { diff?: string } = {};
    const transport = createBrokerTransportAdapter({
      client: fakeBrokerClient({ capture }),
      cwd,
      authorId: 'tester',
    });

    await transport.submitReview({ unitId: 'U-1', milestoneId: 'M01', taskId: 'T01' });
    expect(capture.diff).toContain('+uncommitted line');

    const headBefore = (await git(cwd, ['rev-parse', 'HEAD'])).trim();
    await transport.onReviewAllowed!({ unitId: 'U-1', milestoneId: 'M01', taskId: 'T01' }, 'rvw_test_1');
    const headAfter = (await git(cwd, ['rev-parse', 'HEAD'])).trim();
    const status = await git(cwd, ['status', '--porcelain']);

    expect(headAfter).toBe(headBefore);
    expect(status).toContain('src/sample.txt');
  });

  it('fails closed when expected unit artifacts are missing from disk', async () => {
    const cwd = await createGitRepo();
    writeFileSync(path.join(cwd, 'src', 'sample.txt'), 'baseline\nchanged\n');

    const transport = createBrokerTransportAdapter({
      client: fakeBrokerClient(),
      cwd,
      authorId: 'tester',
    });

    await expect(
      transport.submitReview({
        unitId: 'M001/S03',
        unitType: 'plan-slice',
        milestoneId: 'M001',
        sliceId: 'S03',
      }),
    ).rejects.toThrow(/review_patch_missing_expected_artifact/);
  });

  it('does not require expected artifacts under a .gsd symlink to be changed in git', async () => {
    const cwd = await createGitRepo();
    const externalGsdRoot = mkdtempSync(path.join(os.tmpdir(), 'tandem-gsd-state-'));
    tmpDirs.push(externalGsdRoot);
    await mkdir(path.join(externalGsdRoot, 'milestones', 'M001', 'slices', 'S03', 'tasks'), { recursive: true });
    writeFileSync(
      path.join(externalGsdRoot, 'milestones', 'M001', 'slices', 'S03', 'tasks', 'T01-SUMMARY.md'),
      '# T01 summary\n',
    );
    writeFileSync(path.join(cwd, '.gitignore'), '.gsd\n');
    await git(cwd, ['add', '.gitignore']);
    await git(cwd, ['commit', '-m', 'ignore gsd state']);
    symlinkSync(externalGsdRoot, path.join(cwd, '.gsd'), 'dir');

    writeFileSync(path.join(cwd, 'src', 'sample.txt'), 'baseline\ncommitted unit change\n');
    await git(cwd, ['add', '-A']);
    await git(cwd, ['commit', '-m', 'complete symlinked gsd unit']);

    const capture: { diff?: string } = {};
    const transport = createBrokerTransportAdapter({
      client: fakeBrokerClient({ capture }),
      cwd,
      authorId: 'tester',
    });

    await transport.submitReview({
      unitId: 'M001/S03/T01',
      unitType: 'execute-task',
      milestoneId: 'M001',
      sliceId: 'S03',
      taskId: 'T01',
    });

    expect(capture.diff).toContain('src/sample.txt');
    expect(capture.diff).toContain('+committed unit change');
    expect(capture.diff).not.toContain('.gsd/milestones/M001/slices/S03/tasks/T01-SUMMARY.md');
  });

  it('includes expected durable artifacts and excludes transient .gsd runtime logs', async () => {
    const cwd = await createGitRepo();

    await mkdir(path.join(cwd, '.gsd', 'audit'), { recursive: true });
    await mkdir(path.join(cwd, '.gsd', 'milestones', 'M001', 'slices', 'S03'), { recursive: true });

    writeFileSync(path.join(cwd, '.gsd', 'audit', 'events.jsonl'), 'baseline-audit\n');
    await git(cwd, ['add', '-A']);
    await git(cwd, ['commit', '-m', 'track-audit-log']);

    writeFileSync(path.join(cwd, '.gsd', 'audit', 'events.jsonl'), 'baseline-audit\nnoise line\n');
    writeFileSync(
      path.join(cwd, '.gsd', 'milestones', 'M001', 'slices', 'S03', 'S03-PLAN.md'),
      '# S03 plan\n\n- [ ] **T01: Example** `est:30m`\n',
    );
    writeFileSync(path.join(cwd, 'src', 'sample.txt'), 'baseline\nreview this change\n');

    const capture: { diff?: string } = {};
    const transport = createBrokerTransportAdapter({
      client: fakeBrokerClient({ capture }),
      cwd,
      authorId: 'tester',
    });

    await transport.submitReview({
      unitId: 'M001/S03',
      unitType: 'plan-slice',
      milestoneId: 'M001',
      sliceId: 'S03',
    });

    expect(capture.diff).toContain('.gsd/milestones/M001/slices/S03/S03-PLAN.md');
    expect(capture.diff).toContain('src/sample.txt');
    expect(capture.diff).not.toContain('.gsd/audit/events.jsonl');
  });

  it('preserves patch integrity for mixed tracked + untracked diffs (no trim-induced corruption)', async () => {
    const cwd = await createGitRepo();

    await mkdir(path.join(cwd, '.gsd', 'milestones', 'M001', 'slices', 'S03', 'tasks'), { recursive: true });
    await mkdir(path.join(cwd, '.tmp'), { recursive: true });

    writeFileSync(
      path.join(cwd, '.gsd', 'milestones', 'M001', 'slices', 'S03', 'S03-SUMMARY.md'),
      '# Summary\n\nSlice output\n',
    );
    writeFileSync(
      path.join(cwd, '.gsd', 'milestones', 'M001', 'slices', 'S03', 'S03-UAT.md'),
      '# UAT\n\n- [x] Verified\n',
    );
    writeFileSync(
      path.join(cwd, '.gsd', 'milestones', 'M001', 'slices', 'S03', 'tasks', 'T03-VERIFY.json'),
      '{"passed":true}',
    );
    writeFileSync(path.join(cwd, '.tmp', 'public.data.json.s03.bak'), '{"backup":true}\n');
    writeFileSync(path.join(cwd, 'src', 'sample.txt'), 'baseline\ntracked change\n');

    const capture: { diff?: string } = {};
    const transport = createBrokerTransportAdapter({
      client: fakeBrokerClient({ capture }),
      cwd,
      authorId: 'tester',
    });

    await transport.submitReview({
      unitId: 'M001/S03',
      unitType: 'complete-slice',
      milestoneId: 'M001',
      sliceId: 'S03',
    });

    expect(capture.diff).toBeDefined();

    const checkDir = mkdtempSync(path.join(os.tmpdir(), 'tandem-transport-check-'));
    tmpDirs.push(checkDir);
    const patchPath = path.join(checkDir, 'proposal.diff');
    const indexPath = path.join(checkDir, 'index');
    writeFileSync(patchPath, capture.diff ?? '', 'utf8');

    const env = { ...process.env, GIT_INDEX_FILE: indexPath };
    await execFileAsync('git', ['read-tree', 'HEAD'], { cwd, env });
    await expect(
      execFileAsync('git', ['apply', '--cached', '--check', patchPath], { cwd, env }),
    ).resolves.toBeDefined();
  });

  it('resubmits a counter-patch to the same review id and includes updated diff context', async () => {
    const cwd = await createGitRepo();

    await mkdir(path.join(cwd, '.gsd', 'milestones', 'M001', 'slices', 'S03'), { recursive: true });
    writeFileSync(
      path.join(cwd, '.gsd', 'milestones', 'M001', 'slices', 'S03', 'S03-PLAN.md'),
      '# S03 plan\n\n- [ ] **T01: Example** `est:30m`\n',
    );
    writeFileSync(path.join(cwd, 'src', 'sample.txt'), 'baseline\ncounter patch\n');

    const capture: {
      counterPatchBody?: string;
      counterPatchDiff?: string;
      counterPatchReviewId?: string;
      counterPatchActorId?: string;
    } = {};

    const transport = createBrokerTransportAdapter({
      client: fakeBrokerClient({ capture }),
      cwd,
      authorId: 'tester',
    });

    const record = await transport.submitCounterPatch!({
      unit: {
        unitId: 'M001/S03',
        unitType: 'plan-slice',
        milestoneId: 'M001',
        sliceId: 'S03',
      },
      reviewId: 'rvw_existing_1',
      feedback: 'Please rename the helper export.',
    });

    expect(record.reviewId).toBe('rvw_existing_1');
    expect(record.status).toBe('pending');
    expect(capture.counterPatchReviewId).toBe('rvw_existing_1');
    expect(capture.counterPatchActorId).toBe('tester');
    expect(capture.counterPatchBody).toContain('Counter-patch update for M001/S03 on rvw_existing_1.');
    expect(capture.counterPatchBody).toContain('Please rename the helper export.');
    expect(capture.counterPatchBody).toContain('Updated files:');
    expect(capture.counterPatchBody).toContain('S03-PLAN.md');
    expect(capture.counterPatchBody).toContain('src/sample.txt');
    expect(capture.counterPatchDiff).toContain('diff --git');
    expect(capture.counterPatchDiff).toContain('S03-PLAN.md');
    expect(capture.counterPatchDiff).toContain('src/sample.txt');
  });

  it('getStatus prefers latest reviewer discussion message as feedback when blocked', async () => {
    const cwd = await createGitRepo();

    const transport = createBrokerTransportAdapter({
      client: fakeBrokerClient({
        statusResponse: {
          reviewId: 'rvw_blocked',
          status: 'changes_requested',
          latestVerdict: 'changes_requested',
          updatedAt: new Date().toISOString(),
          verdictReason: 'Diff is close, but needs one rename.',
        },
        discussionMessages: [
          { authorRole: 'author', body: 'Pushed initial patch.' },
          { authorRole: 'reviewer', body: 'Rename `WidgetCount` to `TodoCount`.' },
        ],
      }),
      cwd,
      authorId: 'tester',
    });

    const status = await transport.getStatus('rvw_blocked');

    expect(status.status).toBe('changes_requested');
    expect(status.summary).toBe('Diff is close, but needs one rename.');
    expect(status.feedback).toBe('Rename `WidgetCount` to `TodoCount`.');
  });

  it('onReviewAllowed does not commit because GSD owns proposer commits', async () => {
    const cwd = await createGitRepo();
    writeFileSync(path.join(cwd, 'src', 'sample.txt'), 'baseline\napproved change\n');

    const transport = createBrokerTransportAdapter({
      client: fakeBrokerClient(),
      cwd,
      authorId: 'tester',
    });

    const headBefore = (await git(cwd, ['rev-parse', 'HEAD'])).trim();

    await transport.onReviewAllowed!({ unitId: 'U-2', milestoneId: 'M01', taskId: 'T02' }, 'rvw_xyz');

    const headAfter = (await git(cwd, ['rev-parse', 'HEAD'])).trim();
    expect(headAfter).toBe(headBefore);

    const status = await git(cwd, ['status', '--porcelain']);
    expect(status).toContain('src/sample.txt');
  });

  it('resubmitted committed counter-patches keep the original base and replace the proposal diff', async () => {
    const cwd = await createGitRepo();

    await mkdir(path.join(cwd, '.gsd', 'milestones', 'M001', 'slices', 'S03'), { recursive: true });
    writeFileSync(
      path.join(cwd, '.gsd', 'milestones', 'M001', 'slices', 'S03', 'S03-PLAN.md'),
      '# Planned\n\n- [ ] **T01: Example** `est:20m`\n',
    );
    writeFileSync(path.join(cwd, 'src', 'sample.txt'), 'baseline\noriginal proposal\n');
    await git(cwd, ['add', '-A']);
    await git(cwd, ['commit', '-m', 'complete initial unit']);

    const capture: { diff?: string; counterPatchDiff?: string } = {};
    const transport = createBrokerTransportAdapter({
      client: fakeBrokerClient({ capture }),
      cwd,
      authorId: 'tester',
    });

    await transport.submitReview({
      unitId: 'M001/S03',
      unitType: 'plan-slice',
      milestoneId: 'M001',
      sliceId: 'S03',
    });

    expect(capture.diff).toContain('+original proposal');

    writeFileSync(
      path.join(cwd, '.gsd', 'milestones', 'M001', 'slices', 'S03', 'S03-PLAN.md'),
      '# Planned\n\n- [x] **T01: Example** `est:20m`\n',
    );
    writeFileSync(path.join(cwd, 'src', 'sample.txt'), 'baseline\noriginal proposal\nreview feedback fix\n');
    await git(cwd, ['add', '-A']);
    await git(cwd, ['commit', '-m', 'address reviewer feedback']);

    await transport.submitCounterPatch!({
      reviewId: 'rvw_test_1',
      feedback: 'Mark the task complete and add the missing fix.',
      unit: {
        unitId: 'M001/S03',
        unitType: 'plan-slice',
        milestoneId: 'M001',
        sliceId: 'S03',
      },
    });

    expect(capture.counterPatchDiff).toContain('+original proposal');
    expect(capture.counterPatchDiff).toContain('+review feedback fix');
    expect(capture.counterPatchDiff).toContain('+- [x] **T01: Example**');
  });

  it('onReviewAllowed clears remembered review base without creating commits', async () => {
    const cwd = await createGitRepo();
    writeFileSync(path.join(cwd, 'src', 'sample.txt'), 'baseline\nfirst committed change\n');
    await git(cwd, ['add', '-A']);
    await git(cwd, ['commit', '-m', 'complete unit']);

    const transport = createBrokerTransportAdapter({
      client: fakeBrokerClient(),
      cwd,
      authorId: 'tester',
    });

    await transport.submitReview({
      unitId: 'U-3',
      milestoneId: 'M01',
      taskId: 'T03',
    });

    const headBefore = (await git(cwd, ['rev-parse', 'HEAD'])).trim();
    await transport.onReviewAllowed!({
      unitId: 'M001/S03',
      milestoneId: 'M01',
      taskId: 'T03',
    }, 'rvw_test_1');
    const headAfter = (await git(cwd, ['rev-parse', 'HEAD'])).trim();

    expect(headAfter).toBe(headBefore);
  });

  it('ignores the deprecated custom commitMessage builder', async () => {
    const cwd = await createGitRepo();
    writeFileSync(path.join(cwd, 'src', 'sample.txt'), 'baseline\ncustom\n');

    const transport = createBrokerTransportAdapter({
      client: fakeBrokerClient(),
      cwd,
      authorId: 'tester',
      commitMessage: (unit, reviewId) => `chore(${unit.taskId ?? unit.unitId}): approved as ${reviewId}`,
    });

    await transport.onReviewAllowed!({ unitId: 'U-4', taskId: 'T04' }, 'rvw_custom');

    const message = (await git(cwd, ['log', '-1', '--pretty=%B'])).trim();
    expect(message).toBe('baseline');
  });
});
