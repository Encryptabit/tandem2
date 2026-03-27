import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadPoolConfig, PoolConfigSchema } from '../src/runtime/pool-config.js';

const tempDirectories: string[] = [];

afterEach(() => {
  while (tempDirectories.length > 0) {
    const dir = tempDirectories.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function writeTempConfig(data: Record<string, unknown>): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pool-config-test-'));
  tempDirectories.push(dir);
  const configPath = path.join(dir, 'config.json');
  writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf8');
  return configPath;
}

describe('PoolConfigSchema defaults', () => {
  it('provides all defaults for an empty object', () => {
    const result = PoolConfigSchema.parse({});
    expect(result).toEqual({
      max_pool_size: 3,
      idle_timeout_seconds: 300,
      max_ttl_seconds: 3600,
      claim_timeout_seconds: 1200,
      spawn_cooldown_seconds: 10,
      scaling_ratio: 3.0,
      background_check_interval_seconds: 30,
    });
  });
});

describe('loadPoolConfig', () => {
  it('parses a valid full config correctly', () => {
    const configPath = writeTempConfig({
      reviewer_pool: {
        max_pool_size: 5,
        idle_timeout_seconds: 120,
        max_ttl_seconds: 7200,
        claim_timeout_seconds: 600,
        spawn_cooldown_seconds: 5,
        scaling_ratio: 2.0,
        background_check_interval_seconds: 15,
      },
    });
    const result = loadPoolConfig(configPath);
    expect(result).toEqual({
      max_pool_size: 5,
      idle_timeout_seconds: 120,
      max_ttl_seconds: 7200,
      claim_timeout_seconds: 600,
      spawn_cooldown_seconds: 5,
      scaling_ratio: 2.0,
      background_check_interval_seconds: 15,
    });
  });

  it('applies defaults for omitted fields (partial config)', () => {
    const configPath = writeTempConfig({
      reviewer_pool: {
        max_pool_size: 7,
      },
    });
    const result = loadPoolConfig(configPath);
    expect(result).toEqual({
      max_pool_size: 7,
      idle_timeout_seconds: 300,
      max_ttl_seconds: 3600,
      claim_timeout_seconds: 1200,
      spawn_cooldown_seconds: 10,
      scaling_ratio: 3.0,
      background_check_interval_seconds: 30,
    });
  });

  it('returns all defaults for empty reviewer_pool: {}', () => {
    const configPath = writeTempConfig({ reviewer_pool: {} });
    const result = loadPoolConfig(configPath);
    expect(result).toEqual({
      max_pool_size: 3,
      idle_timeout_seconds: 300,
      max_ttl_seconds: 3600,
      claim_timeout_seconds: 1200,
      spawn_cooldown_seconds: 10,
      scaling_ratio: 3.0,
      background_check_interval_seconds: 30,
    });
  });

  it('returns null when reviewer_pool section is missing', () => {
    const configPath = writeTempConfig({ some_other_key: 'value' });
    expect(loadPoolConfig(configPath)).toBeNull();
  });

  it('returns null when config file does not exist', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'pool-config-test-'));
    tempDirectories.push(dir);
    const nonexistentPath = path.join(dir, 'nonexistent.json');
    expect(loadPoolConfig(nonexistentPath)).toBeNull();
  });

  it('returns null when reviewer_pool is a string', () => {
    const configPath = writeTempConfig({ reviewer_pool: 'not-an-object' });
    expect(loadPoolConfig(configPath)).toBeNull();
  });

  it('returns null when reviewer_pool is a number', () => {
    const configPath = writeTempConfig({ reviewer_pool: 42 });
    expect(loadPoolConfig(configPath)).toBeNull();
  });

  it('returns null when reviewer_pool is null', () => {
    const configPath = writeTempConfig({ reviewer_pool: null });
    expect(loadPoolConfig(configPath)).toBeNull();
  });

  describe('validation errors with field paths', () => {
    it('rejects max_pool_size: -1 with field path', () => {
      const configPath = writeTempConfig({ reviewer_pool: { max_pool_size: -1 } });
      expect(() => loadPoolConfig(configPath)).toThrow(/max_pool_size/);
    });

    it('rejects max_pool_size: 11 (exceeds max 10)', () => {
      const configPath = writeTempConfig({ reviewer_pool: { max_pool_size: 11 } });
      expect(() => loadPoolConfig(configPath)).toThrow(/max_pool_size/);
    });

    it('rejects idle_timeout_seconds: 30 (below min 60)', () => {
      const configPath = writeTempConfig({ reviewer_pool: { idle_timeout_seconds: 30 } });
      expect(() => loadPoolConfig(configPath)).toThrow(/idle_timeout_seconds/);
    });

    it('rejects scaling_ratio: 0.5 (below min 1.0)', () => {
      const configPath = writeTempConfig({ reviewer_pool: { scaling_ratio: 0.5 } });
      expect(() => loadPoolConfig(configPath)).toThrow(/scaling_ratio/);
    });

    it('rejects max_ttl_seconds: 100 (below min 300)', () => {
      const configPath = writeTempConfig({ reviewer_pool: { max_ttl_seconds: 100 } });
      expect(() => loadPoolConfig(configPath)).toThrow(/max_ttl_seconds/);
    });

    it('rejects unknown keys in reviewer_pool (strict mode)', () => {
      const configPath = writeTempConfig({
        reviewer_pool: { max_pool_size: 3, unknown_field: true },
      });
      expect(() => loadPoolConfig(configPath)).toThrow(/Invalid pool config/);
    });

    it('produces error message prefixed with "Invalid pool config"', () => {
      const configPath = writeTempConfig({ reviewer_pool: { max_pool_size: -1 } });
      expect(() => loadPoolConfig(configPath)).toThrow(/^Invalid pool config:/);
    });
  });

  describe('boundary values accepted', () => {
    it('accepts max_pool_size: 1 (minimum)', () => {
      const configPath = writeTempConfig({ reviewer_pool: { max_pool_size: 1 } });
      const result = loadPoolConfig(configPath);
      expect(result?.max_pool_size).toBe(1);
    });

    it('accepts max_pool_size: 10 (maximum)', () => {
      const configPath = writeTempConfig({ reviewer_pool: { max_pool_size: 10 } });
      const result = loadPoolConfig(configPath);
      expect(result?.max_pool_size).toBe(10);
    });

    it('accepts idle_timeout_seconds: 60 (minimum)', () => {
      const configPath = writeTempConfig({ reviewer_pool: { idle_timeout_seconds: 60 } });
      const result = loadPoolConfig(configPath);
      expect(result?.idle_timeout_seconds).toBe(60);
    });

    it('accepts scaling_ratio: 1.0 (minimum)', () => {
      const configPath = writeTempConfig({ reviewer_pool: { scaling_ratio: 1.0 } });
      const result = loadPoolConfig(configPath);
      expect(result?.scaling_ratio).toBe(1.0);
    });
  });
});
