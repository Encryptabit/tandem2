import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { installTandemReviewExtension } from '../src/install.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'review-broker-ext-install-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('installTandemReviewExtension', () => {
  it('creates extension entrypoint and review-broker config defaults', () => {
    const projectRoot = makeTempDir();

    const result = installTandemReviewExtension({
      projectRoot,
      workerCommand: 'node',
      workerScriptPath: '/tmp/reviewer-worker.mjs',
    });

    expect(result.extensionCreated).toBe(true);
    expect(result.configCreated).toBe(true);

    const extensionContent = readFileSync(result.extensionPath, 'utf8');
    expect(extensionContent).toContain("createTandemReviewExtension");
    expect(extensionContent).toContain("ensureReviewBrokerConfigDefaults");
    expect(extensionContent).toContain("TANDEM_REVIEW_BLOCKED_POLICY");
    expect(extensionContent).toContain("blockedPolicy: BLOCKED_POLICY");
    expect(extensionContent).toContain("TANDEM_REVIEW_BLOCKED_POLICY === 'intervene'");
    expect(extensionContent).toContain(": 'auto-loop'");
    expect(extensionContent).toContain("TANDEM_REVIEW_WAIT_TIMEOUT_MS");
    expect(extensionContent).toContain("reviewWaitTimeoutMs");
    expect(extensionContent).toContain("process.env.TANDEM_BROKER_DB?.trim() || undefined");
    expect(extensionContent).toContain("...(BROKER_DB_PATH ? { dbPath: BROKER_DB_PATH } : {})");
    expect(extensionContent).not.toContain("'.gsd/review-broker/broker.db'");

    const config = JSON.parse(readFileSync(result.configPath, 'utf8'));
    expect(config.reviewer.provider).toBe('codex');
    expect(config.reviewer.providers.codex).toEqual({
      command: 'node',
      args: ['/tmp/reviewer-worker.mjs'],
    });
  });

  it('does not overwrite a custom extension file unless force=true', () => {
    const projectRoot = makeTempDir();
    const extensionPath = path.join(projectRoot, '.gsd', 'extensions', 'tandem-review.mjs');

    rmSync(path.dirname(extensionPath), { recursive: true, force: true });
    mkdirSync(path.dirname(extensionPath), { recursive: true });
    writeFileSync(extensionPath, '// custom extension entry\n', 'utf8');

    const installResult = installTandemReviewExtension({
      projectRoot,
      workerCommand: 'node',
      workerScriptPath: '/tmp/reviewer-worker.mjs',
    });

    expect(installResult.extensionCreated).toBe(false);
    expect(installResult.extensionUpdated).toBe(false);
    expect(readFileSync(extensionPath, 'utf8')).toBe('// custom extension entry\n');

    const forceResult = installTandemReviewExtension({
      projectRoot,
      force: true,
      workerCommand: 'node',
      workerScriptPath: '/tmp/reviewer-worker.mjs',
    });

    expect(forceResult.extensionUpdated).toBe(true);
    expect(readFileSync(extensionPath, 'utf8')).toContain('createTandemReviewExtension');
  });
});
