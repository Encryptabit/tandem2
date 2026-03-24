import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import parseDiff from 'parse-diff';

export interface ValidateReviewDiffOptions {
  diff: string;
  workspaceRoot: string;
}

export interface ValidatedReviewDiff {
  affectedFiles: string[];
  fileCount: number;
  additions: number;
  deletions: number;
}

export type DiffValidationErrorCode = 'INVALID_DIFF' | 'DIFF_VALIDATION_FAILED';

export class DiffValidationError extends Error {
  readonly code: DiffValidationErrorCode;
  readonly workspaceRoot: string;
  readonly affectedFiles: string[];

  constructor(options: {
    code: DiffValidationErrorCode;
    message: string;
    workspaceRoot: string;
    affectedFiles?: string[];
  }) {
    super(options.message);
    this.name = 'DiffValidationError';
    this.code = options.code;
    this.workspaceRoot = options.workspaceRoot;
    this.affectedFiles = options.affectedFiles ?? [];
  }
}

export function validateReviewDiff(options: ValidateReviewDiffOptions): ValidatedReviewDiff {
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const parsed = analyzeReviewDiff(options.diff);

  if (parsed.affectedFiles.length === 0) {
    throw new DiffValidationError({
      code: 'INVALID_DIFF',
      message: `Diff did not describe any affected files relative to ${workspaceRoot}.`,
      workspaceRoot,
      affectedFiles: [],
    });
  }

  runGitApplyCheck({ diff: options.diff, workspaceRoot, affectedFiles: parsed.affectedFiles });
  return parsed;
}

function analyzeReviewDiff(diff: string): ValidatedReviewDiff {
  const files = parseDiff(diff);
  const affectedFiles = Array.from(
    new Set(
      files
        .map((file) => normalizePatchedPath(file.to ?? file.from))
        .filter((filePath): filePath is string => Boolean(filePath)),
    ),
  ).sort((left, right) => left.localeCompare(right));

  return {
    affectedFiles,
    fileCount: affectedFiles.length,
    additions: files.reduce((total, file) => total + file.additions, 0),
    deletions: files.reduce((total, file) => total + file.deletions, 0),
  };
}

function runGitApplyCheck(options: { diff: string; workspaceRoot: string; affectedFiles: string[] }): void {
  const tempRoot = path.join(options.workspaceRoot, '.tmp');
  mkdirSync(tempRoot, { recursive: true });

  const tempDirectory = mkdtempSync(path.join(tempRoot, 'review-diff-'));
  const patchPath = path.join(tempDirectory, 'proposal.diff');

  try {
    writeFileSync(patchPath, options.diff, 'utf8');

    const result = spawnSync('git', ['-C', options.workspaceRoot, 'apply', '--check', patchPath], {
      encoding: 'utf8',
    });

    if (result.error) {
      throw new DiffValidationError({
        code: 'DIFF_VALIDATION_FAILED',
        message: `Failed to execute git apply --check in ${options.workspaceRoot}: ${result.error.message}`,
        workspaceRoot: options.workspaceRoot,
        affectedFiles: options.affectedFiles,
      });
    }

    if (result.status !== 0) {
      const details = [result.stderr, result.stdout].map((value) => value.trim()).filter(Boolean).join(' | ');
      throw new DiffValidationError({
        code: 'INVALID_DIFF',
        message: details || `git apply --check rejected the diff in ${options.workspaceRoot}.`,
        workspaceRoot: options.workspaceRoot,
        affectedFiles: options.affectedFiles,
      });
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function normalizePatchedPath(filePath: string | undefined): string | null {
  if (!filePath || filePath === '/dev/null') {
    return null;
  }

  if (filePath.startsWith('a/') || filePath.startsWith('b/')) {
    return filePath.slice(2);
  }

  return filePath;
}
