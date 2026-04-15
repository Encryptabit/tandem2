import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { readConfig, writeConfig, setConfigValue, resolveProvider } from '../src/cli/config.js';

describe('config module', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'tandem-config-'));
  });

  afterAll(() => {
    // Clean up any remaining temp dirs (vitest runs beforeEach per test)
  });

  function configPath(): string {
    return path.join(tempDir, 'nested', 'dir', 'config.json');
  }

  // ─── readConfig ────────────────────────────────────────────────────────

  describe('readConfig', () => {
    it('returns {} for a non-existent file', () => {
      const result = readConfig(path.join(tempDir, 'does-not-exist.json'));
      expect(result).toEqual({});
    });

    it('parses an existing JSON file', () => {
      const p = configPath();
      writeConfig(p, { hello: 'world' });
      const result = readConfig(p);
      expect(result).toEqual({ hello: 'world' });
    });
  });

  // ─── writeConfig ───────────────────────────────────────────────────────

  describe('writeConfig', () => {
    it('creates parent directories automatically', () => {
      const p = configPath();
      expect(existsSync(path.dirname(p))).toBe(false);

      writeConfig(p, { key: 'value' });

      expect(existsSync(p)).toBe(true);
    });

    it('roundtrips with readConfig', () => {
      const p = configPath();
      const data = { a: 1, b: 'two', c: { nested: true } };
      writeConfig(p, data);
      expect(readConfig(p)).toEqual(data);
    });
  });

  // ─── setConfigValue ────────────────────────────────────────────────────

  describe('setConfigValue', () => {
    it('sets a top-level key on a new config', () => {
      const p = configPath();
      const result = setConfigValue(p, 'provider', 'anthropic');
      expect(result).toEqual({ provider: 'anthropic' });
      expect(readConfig(p)).toEqual({ provider: 'anthropic' });
    });

    it('creates nested structure for dot-path key', () => {
      const p = configPath();
      const result = setConfigValue(p, 'reviewer.provider', 'anthropic');
      expect(result).toEqual({ reviewer: { provider: 'anthropic' } });
    });

    it('handles deeply nested dot-path keys', () => {
      const p = configPath();
      const result = setConfigValue(p, 'a.b.c.d', 'deep');
      expect(result).toEqual({ a: { b: { c: { d: 'deep' } } } });
    });

    it('preserves existing keys when adding new ones', () => {
      const p = configPath();
      writeConfig(p, { existing: 'value', section: { old: 'data' } });

      const result = setConfigValue(p, 'section.new', 'added');
      expect(result).toEqual({
        existing: 'value',
        section: { old: 'data', new: 'added' },
      });
    });

    it('overwrites an existing key', () => {
      const p = configPath();
      setConfigValue(p, 'reviewer.provider', 'openai');
      const result = setConfigValue(p, 'reviewer.provider', 'anthropic');
      expect(result).toEqual({ reviewer: { provider: 'anthropic' } });
    });

    it('overwrites a non-object intermediate with a nested object', () => {
      const p = configPath();
      writeConfig(p, { reviewer: 'flat-string' });
      const result = setConfigValue(p, 'reviewer.provider', 'anthropic');
      expect(result).toEqual({ reviewer: { provider: 'anthropic' } });
    });
  });

  // ─── resolveProvider ───────────────────────────────────────────────────

  describe('resolveProvider', () => {
    it('resolves a configured provider with command and args', () => {
      const p = configPath();
      writeConfig(p, {
        reviewer: {
          providers: {
            anthropic: {
              command: '/usr/bin/claude',
              args: ['--model', 'sonnet'],
            },
          },
        },
      });

      const result = resolveProvider(p, 'anthropic');
      expect(result).toEqual({
        command: '/usr/bin/claude',
        args: ['--model', 'sonnet'],
      });
    });

    it('resolves a configured provider with command only (no args)', () => {
      const p = configPath();
      writeConfig(p, {
        reviewer: {
          providers: {
            simple: {
              command: '/usr/bin/reviewer',
            },
          },
        },
      });

      const result = resolveProvider(p, 'simple');
      expect(result).toEqual({ command: '/usr/bin/reviewer' });
    });

    it('throws when node-based provider has no args', () => {
      const p = configPath();
      writeConfig(p, {
        reviewer: {
          providers: {
            brokenNode: {
              command: 'node',
            },
          },
        },
      });

      expect(() => resolveProvider(p, 'brokenNode')).toThrow(
        'Provider "brokenNode" command "node" requires at least one script/module argument.',
      );
    });

    it('allows node-based provider when script args are present', () => {
      const p = configPath();
      writeConfig(p, {
        reviewer: {
          providers: {
            worker: {
              command: 'node',
              args: ['packages/review-broker-server/scripts/reviewer-worker.mjs'],
            },
          },
        },
      });

      const result = resolveProvider(p, 'worker');
      expect(result).toEqual({
        command: 'node',
        args: ['packages/review-broker-server/scripts/reviewer-worker.mjs'],
      });
    });

    it('parses JSON-stringified args from setConfigValue', () => {
      const p = configPath();
      setConfigValue(p, 'reviewer.providers.test.command', '/usr/bin/test');
      setConfigValue(p, 'reviewer.providers.test.args', JSON.stringify(['--flag', 'value']));

      const result = resolveProvider(p, 'test');
      expect(result).toEqual({
        command: '/usr/bin/test',
        args: ['--flag', 'value'],
      });
    });

    it('throws for unknown provider name', () => {
      const p = configPath();
      writeConfig(p, {
        reviewer: {
          providers: {
            existing: { command: '/usr/bin/x' },
          },
        },
      });

      expect(() => resolveProvider(p, 'nonexistent')).toThrow(
        'Unknown provider "nonexistent". No provider configured at "reviewer.providers.nonexistent".',
      );
    });

    it('throws for provider missing command field', () => {
      const p = configPath();
      writeConfig(p, {
        reviewer: {
          providers: {
            broken: { args: ['--test'] },
          },
        },
      });

      expect(() => resolveProvider(p, 'broken')).toThrow(
        'Provider "broken" is missing required "command" field.',
      );
    });

    it('throws when no providers section exists', () => {
      const p = configPath();
      writeConfig(p, { reviewer: { other: 'stuff' } });

      expect(() => resolveProvider(p, 'any')).toThrow(
        'Unknown provider "any"',
      );
    });
  });
});
