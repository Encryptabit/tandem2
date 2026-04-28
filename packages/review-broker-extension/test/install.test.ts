import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

  describe('--global', () => {
    it('writes a global directory layout with baked file:// imports', () => {
      const piHome = makeTempDir();

      const result = installTandemReviewExtension({
        global: true,
        globalPiHome: piHome,
      });

      expect(result.scope).toBe('global');
      expect(result.projectRoot).toBeNull();
      expect(result.configPath).toBeNull();
      expect(result.configCreated).toBe(false);
      expect(result.configUpdated).toBe(false);
      expect(result.extensionCreated).toBe(true);
      expect(result.extensionUpdated).toBe(true);

      const expectedDir = path.join(piHome, 'agent', 'extensions', 'tandem-review');
      expect(result.extensionPath).toBe(path.join(expectedDir, 'index.js'));
      expect(result.packageJsonPath).toBe(path.join(expectedDir, 'package.json'));
      expect(result.manifestPath).toBe(path.join(expectedDir, 'extension-manifest.json'));

      const indexContent = readFileSync(result.extensionPath, 'utf8');
      // Imports are baked as absolute file:// URLs, not bare specifiers.
      expect(indexContent).not.toMatch(/from\s+'@carithecoder\/review-broker-extension'/);
      expect(indexContent).not.toMatch(/from\s+'@carithecoder\/review-broker-client'/);
      expect(indexContent).toMatch(/from\s+'file:\/\/.*review-broker-extension.*'/);
      expect(indexContent).toMatch(/from\s+'file:\/\/.*review-broker-client.*'/);
      // Both baked URLs point at files that exist on disk.
      const importMatches = [...indexContent.matchAll(/from\s+'(file:\/\/[^']+)'/g)].map(
        (m) => m[1] as string,
      );
      expect(importMatches.length).toBe(2);
      for (const url of importMatches) {
        expect(existsSync(new URL(url))).toBe(true);
      }

      // package.json marks the dir as ESM and private.
      const pkg = JSON.parse(readFileSync(result.packageJsonPath!, 'utf8'));
      expect(pkg).toEqual({ type: 'module', private: true });

      // Manifest is copied from the source package and advertises the review command.
      const manifest = JSON.parse(readFileSync(result.manifestPath!, 'utf8'));
      expect(manifest.id).toBe('tandem-review');
      expect(manifest.provides.commands).toContain('review');
      expect(manifest.provides.hooks).toContain('before_next_dispatch');
    });

    it('honors --extension-path as a directory override and PI_HOME via globalPiHome', () => {
      const customDir = makeTempDir();

      const result = installTandemReviewExtension({
        global: true,
        extensionPath: path.join(customDir, 'tandem-review'),
      });

      expect(result.extensionPath).toBe(path.join(customDir, 'tandem-review', 'index.js'));
      expect(existsSync(result.packageJsonPath!)).toBe(true);
      expect(existsSync(result.manifestPath!)).toBe(true);
    });

    it('is idempotent on repeat install and refreshes content on --force', () => {
      const piHome = makeTempDir();

      const first = installTandemReviewExtension({ global: true, globalPiHome: piHome });
      expect(first.extensionCreated).toBe(true);
      expect(first.extensionUpdated).toBe(true);

      const second = installTandemReviewExtension({ global: true, globalPiHome: piHome });
      expect(second.extensionCreated).toBe(false);
      expect(second.extensionUpdated).toBe(false);

      // Replace the entrypoint with a stub so --force has something to overwrite.
      writeFileSync(first.extensionPath, '// stale stub\n', 'utf8');

      const refreshed = installTandemReviewExtension({
        global: true,
        globalPiHome: piHome,
        force: true,
      });
      expect(refreshed.extensionCreated).toBe(false);
      expect(refreshed.extensionUpdated).toBe(true);
      expect(readFileSync(first.extensionPath, 'utf8')).toContain('createTandemReviewExtension');
    });

    it('does not bootstrap a project-local config', () => {
      const piHome = makeTempDir();
      const projectRoot = makeTempDir();
      const projectConfigPath = path.join(projectRoot, '.gsd', 'review-broker', 'config.json');

      installTandemReviewExtension({
        global: true,
        globalPiHome: piHome,
        // projectRoot is ignored when global=true; verify nothing leaks into it.
        projectRoot,
      });

      expect(existsSync(projectConfigPath)).toBe(false);
    });

    it('uses pathToFileURL semantics so absolute paths round-trip', () => {
      // Sanity check that the import URL produced by pathToFileURL is a valid file:// URL
      // pointing back at the resolved file. (Catches a regression if someone swaps to a
      // hand-rolled prefix like `file://` + path that breaks on Windows drive letters.)
      const piHome = makeTempDir();
      const result = installTandemReviewExtension({ global: true, globalPiHome: piHome });
      const indexContent = readFileSync(result.extensionPath, 'utf8');
      const url = [...indexContent.matchAll(/from\s+'(file:\/\/[^']+review-broker-extension[^']+)'/g)][0]?.[1];
      expect(typeof url).toBe('string');
      // Round-trip through URL → make sure pathToFileURL of that path produces the same href.
      const parsed = new URL(url!);
      expect(pathToFileURL(parsed.pathname).href.startsWith('file://')).toBe(true);
    });
  });
});
