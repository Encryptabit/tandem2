import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export interface SeedGlobalConfigResult {
  seeded: boolean;
  globalConfigPath: string;
  workerScriptPath: string;
  /** Absolute path to the Node executable baked into the seeded provider command. */
  nodeExecPath: string;
}

/**
 * If the global config file does not yet exist, write a default that enables
 * the standalone reviewer pool out of the box. Returns whether the seed was
 * performed; idempotent on subsequent calls.
 */
export function seedGlobalConfigIfMissing(globalConfigPath: string): SeedGlobalConfigResult {
  const workerScriptPath = resolveBundledWorkerPath();
  const nodeExecPath = process.execPath;

  if (existsSync(globalConfigPath)) {
    return { seeded: false, globalConfigPath, workerScriptPath, nodeExecPath };
  }

  const defaultConfig = {
    reviewer: {
      provider: 'codex',
      providers: {
        codex: {
          command: nodeExecPath,
          args: [workerScriptPath],
        },
      },
    },
    reviewer_pool: {
      max_pool_size: 3,
      scaling_ratio: 1,
      idle_timeout_seconds: 300,
      max_ttl_seconds: 3600,
      claim_timeout_seconds: 1800,
      spawn_cooldown_seconds: 5,
      background_check_interval_seconds: 10,
    },
  };

  mkdirSync(path.dirname(globalConfigPath), { recursive: true });
  writeFileSync(globalConfigPath, JSON.stringify(defaultConfig, null, 2) + '\n', 'utf8');

  return { seeded: true, globalConfigPath, workerScriptPath, nodeExecPath };
}

function resolveBundledWorkerPath(): string {
  // Walk up from this module's location until we find scripts/reviewer-worker.mjs.
  // Robust to both unbundled (dist/runtime/) and tsup-bundled (dist/) layouts.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const target = path.join('scripts', 'reviewer-worker.mjs');
  let current = here;
  while (true) {
    const candidate = path.join(current, target);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      // Last-resort fallback: the canonical relative path inside the package.
      return path.resolve(here, '..', '..', target);
    }
    current = parent;
  }
}
