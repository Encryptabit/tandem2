import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PROVIDER_NAME = 'codex';
const DEFAULT_POOL_CONFIG = {
  max_pool_size: 3,
  scaling_ratio: 1,
  idle_timeout_seconds: 300,
  max_ttl_seconds: 3600,
  claim_timeout_seconds: 1800,
  spawn_cooldown_seconds: 5,
  background_check_interval_seconds: 10,
} as const;

const LEGACY_POOL_DEFAULTS = {
  max_ttl_seconds: 600,
  claim_timeout_seconds: 300,
} as const;

type JsonObject = Record<string, unknown>;

export interface EnsureReviewBrokerConfigDefaultsOptions {
  projectRoot?: string;
  configPath?: string;
  providerName?: string;
  workerCommand?: string;
  workerScriptPath?: string;
}

export interface EnsureReviewBrokerConfigDefaultsResult {
  configPath: string;
  created: boolean;
  updated: boolean;
  providerName: string;
  workerCommand: string;
  workerArgs: string[];
}

function asObject(value: unknown): JsonObject | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as JsonObject;
}

function resolveModuleEntry(specifier: string): string | null {
  try {
    const resolvedHref = import.meta.resolve(specifier);
    if (resolvedHref.startsWith('file://')) {
      return fileURLToPath(resolvedHref);
    }
  } catch {
    // Continue to CJS fallback.
  }

  try {
    const require = createRequire(import.meta.url);
    return require.resolve(specifier);
  } catch {
    return null;
  }
}

function resolveDefaultWorkerScriptPath(): string {
  const candidates: string[] = [];

  const clientEntryPath = resolveModuleEntry('review-broker-client');
  if (clientEntryPath) {
    const clientPackageDir = path.dirname(path.dirname(realpathSync(clientEntryPath)));
    candidates.push(
      path.resolve(clientPackageDir, '..', 'review-broker-server', 'scripts', 'reviewer-worker.mjs'),
    );
  }

  const serverEntryPath = resolveModuleEntry('tandem2');
  if (serverEntryPath) {
    const serverPackageDir = path.dirname(path.dirname(realpathSync(serverEntryPath)));
    candidates.push(path.join(serverPackageDir, 'scripts', 'reviewer-worker.mjs'));
    candidates.push(path.join(serverPackageDir, 'dist', 'scripts', 'reviewer-worker.js'));
  }

  const resolved = candidates.find((candidate) => existsSync(candidate));
  if (resolved) {
    return resolved;
  }

  return 'packages/review-broker-server/scripts/reviewer-worker.mjs';
}

export function ensureReviewBrokerConfigDefaults(
  options: EnsureReviewBrokerConfigDefaultsOptions = {},
): EnsureReviewBrokerConfigDefaultsResult {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const configPath = path.resolve(
    options.configPath ?? path.join(projectRoot, '.gsd', 'review-broker', 'config.json'),
  );
  const created = !existsSync(configPath);

  let config: JsonObject = {};
  if (!created) {
    const raw = readFileSync(configPath, 'utf8').trim();
    if (raw.length > 0) {
      const parsed = JSON.parse(raw) as unknown;
      const parsedObject = asObject(parsed);
      if (!parsedObject) {
        throw new Error(`Config at ${configPath} must contain a JSON object.`);
      }
      config = parsedObject;
    }
  }

  let updated = created;

  let reviewerConfig = asObject(config.reviewer);
  if (!reviewerConfig) {
    reviewerConfig = {};
    config.reviewer = reviewerConfig;
    updated = true;
  }

  let providers = asObject(reviewerConfig.providers);
  if (!providers) {
    providers = {};
    reviewerConfig.providers = providers;
    updated = true;
  }

  const requestedProviderName = options.providerName?.trim() || DEFAULT_PROVIDER_NAME;
  const existingProviderName =
    typeof reviewerConfig.provider === 'string' && reviewerConfig.provider.trim().length > 0
      ? reviewerConfig.provider.trim()
      : null;

  let selectedProviderName = existingProviderName;
  if (!selectedProviderName) {
    const firstExistingProvider = Object.keys(providers)[0];
    selectedProviderName = firstExistingProvider ?? requestedProviderName;
    reviewerConfig.provider = selectedProviderName;
    updated = true;
  }

  let selectedProviderConfig = asObject(providers[selectedProviderName]);
  if (!selectedProviderConfig) {
    selectedProviderConfig = {};
    providers[selectedProviderName] = selectedProviderConfig;
    updated = true;
  }

  const workerCommand = options.workerCommand ?? process.execPath;
  if (
    typeof selectedProviderConfig.command !== 'string' ||
    selectedProviderConfig.command.trim().length === 0
  ) {
    selectedProviderConfig.command = workerCommand;
    updated = true;
  }

  const workerScriptPath = options.workerScriptPath ?? resolveDefaultWorkerScriptPath();
  const currentArgs = Array.isArray(selectedProviderConfig.args)
    ? selectedProviderConfig.args.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : [];

  const LEGACY_DEFAULT_WORKER_SCRIPT = 'packages/review-broker-server/scripts/reviewer-worker.mjs';
  if (
    currentArgs.length === 1 &&
    currentArgs[0] === LEGACY_DEFAULT_WORKER_SCRIPT &&
    workerScriptPath !== LEGACY_DEFAULT_WORKER_SCRIPT
  ) {
    selectedProviderConfig.args = [workerScriptPath];
    updated = true;
  } else if (currentArgs.length === 0) {
    selectedProviderConfig.args = [workerScriptPath];
    updated = true;
  }

  let reviewerPoolConfig = asObject(config.reviewer_pool);
  if (!reviewerPoolConfig) {
    reviewerPoolConfig = { ...DEFAULT_POOL_CONFIG };
    config.reviewer_pool = reviewerPoolConfig;
    updated = true;
  } else {
    for (const [key, value] of Object.entries(DEFAULT_POOL_CONFIG)) {
      if (reviewerPoolConfig[key] === undefined) {
        reviewerPoolConfig[key] = value;
        updated = true;
      }
    }
    for (const [key, legacyValue] of Object.entries(LEGACY_POOL_DEFAULTS)) {
      if (reviewerPoolConfig[key] === legacyValue) {
        reviewerPoolConfig[key] = DEFAULT_POOL_CONFIG[key as keyof typeof LEGACY_POOL_DEFAULTS];
        updated = true;
      }
    }
  }

  if (updated) {
    mkdirSync(path.dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  }

  const resolvedProviderConfig = asObject(asObject(config.reviewer)?.providers)?.[
    String(asObject(config.reviewer)?.provider ?? selectedProviderName)
  ];
  const resolvedProviderObject = asObject(resolvedProviderConfig) ?? {};
  const resolvedCommand =
    typeof resolvedProviderObject.command === 'string' && resolvedProviderObject.command.length > 0
      ? resolvedProviderObject.command
      : workerCommand;
  const resolvedArgs = Array.isArray(resolvedProviderObject.args)
    ? resolvedProviderObject.args.filter((value): value is string => typeof value === 'string')
    : [];

  return {
    configPath,
    created,
    updated,
    providerName: String(asObject(config.reviewer)?.provider ?? selectedProviderName),
    workerCommand: resolvedCommand,
    workerArgs: resolvedArgs,
  };
}
