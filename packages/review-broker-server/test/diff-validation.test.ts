import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { validateReviewDiff } from '../src/runtime/diff.js';

const execFileAsync = promisify(execFile);
const tmpDirs: string[] = [];

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout;
}

async function createGitRepo(): Promise<string> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'tandem-diff-validation-'));
  tmpDirs.push(dir);
  await git(dir, ['init', '--initial-branch=main']);
  await git(dir, ['config', 'user.email', 'test@example.com']);
  await git(dir, ['config', 'user.name', 'Test']);
  writeFileSync(path.join(dir, 'sample.txt'), 'baseline\n');
  await git(dir, ['add', '-A']);
  await git(dir, ['commit', '-m', 'baseline']);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('validateReviewDiff', () => {
  it('accepts a dirty worktree diff that applies forward to HEAD', async () => {
    const cwd = await createGitRepo();
    writeFileSync(path.join(cwd, 'sample.txt'), 'baseline\nworktree change\n');
    const diff = await git(cwd, ['diff', '--binary', 'HEAD', '--', 'sample.txt']);

    const validated = validateReviewDiff({ diff, workspaceRoot: cwd });

    expect(validated.affectedFiles).toEqual(['sample.txt']);
    expect(validated.additions).toBe(1);
  });

  it('accepts a committed proposal diff that applies in reverse from HEAD', async () => {
    const cwd = await createGitRepo();
    writeFileSync(path.join(cwd, 'sample.txt'), 'baseline\ncommitted change\n');
    await git(cwd, ['add', '-A']);
    await git(cwd, ['commit', '-m', 'complete unit']);
    const diff = await git(cwd, ['diff', '--binary', 'HEAD^', 'HEAD', '--', 'sample.txt']);

    const validated = validateReviewDiff({ diff, workspaceRoot: cwd });

    expect(validated.affectedFiles).toEqual(['sample.txt']);
    expect(validated.additions).toBe(1);
  });
});
