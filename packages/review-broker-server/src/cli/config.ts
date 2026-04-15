/**
 * Config management for the review broker.
 *
 * Reads/writes a JSON config file at the resolved `configPath`
 * (typically `.gsd/review-broker/config.json`). Supports dot-path
 * key assignment for nested configuration values.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const NODE_PROVIDER_COMMANDS = new Set(['node', 'node.exe', 'nodejs', 'nodejs.exe']);

/**
 * Read and parse the broker config JSON file.
 * Returns `{}` if the file does not exist.
 */
export function readConfig(configPath: string): Record<string, unknown> {
  if (!existsSync(configPath)) {
    return {};
  }
  const raw = readFileSync(configPath, 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

/**
 * Write the config object to disk as pretty-printed JSON.
 * Creates the parent directory tree if it doesn't exist.
 */
export function writeConfig(configPath: string, data: Record<string, unknown>): void {
  const dir = path.dirname(configPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * Validate reviewer worker command semantics for known process launchers.
 *
 * Node-style commands (`node`, `node.exe`, `nodejs`, `nodejs.exe`) require at
 * least one arg (script or module entrypoint). Running bare `node` with no
 * args exits quickly (or drops into REPL), which causes pool spawn churn.
 */
export function validateReviewerWorkerCommand(
  command: string,
  args: string[] | undefined,
  sourceLabel: string,
): void {
  const commandName = path.basename(command).toLowerCase();

  if (NODE_PROVIDER_COMMANDS.has(commandName) && (args === undefined || args.length === 0)) {
    throw new Error(
      `${sourceLabel} command "${command}" requires at least one script/module argument. ` +
        'Configure provider args, for example: ["packages/review-broker-server/scripts/reviewer-worker.mjs"].',
    );
  }
}

/**
 * Resolve a named reviewer provider from the config file.
 *
 * Looks up `reviewer.providers.<providerName>` in the config object,
 * validates that it has a `command` field, and returns `{ command, args }`.
 *
 * The `args` field may be stored as a JSON-stringified array (when set via
 * `setConfigValue`) or as a native array — both forms are accepted.
 */
export function resolveProvider(
  configPath: string,
  providerName: string,
): { command: string; args?: string[] } {
  const config = readConfig(configPath);

  // Navigate to reviewer.providers.<providerName>
  const reviewer = config.reviewer;
  if (typeof reviewer !== 'object' || reviewer === null || Array.isArray(reviewer)) {
    throw new Error(
      `Unknown provider "${providerName}". No provider configured at "reviewer.providers.${providerName}".`,
    );
  }

  const providers = (reviewer as Record<string, unknown>).providers;
  if (typeof providers !== 'object' || providers === null || Array.isArray(providers)) {
    throw new Error(
      `Unknown provider "${providerName}". No provider configured at "reviewer.providers.${providerName}".`,
    );
  }

  const entry = (providers as Record<string, unknown>)[providerName];
  if (entry === undefined || typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    throw new Error(
      `Unknown provider "${providerName}". No provider configured at "reviewer.providers.${providerName}".`,
    );
  }

  const provider = entry as Record<string, unknown>;
  const command = provider.command;
  if (typeof command !== 'string' || command.length === 0) {
    throw new Error(`Provider "${providerName}" is missing required "command" field.`);
  }

  // Parse args: accept native array or JSON-stringified array
  let args: string[] | undefined;
  if (provider.args !== undefined) {
    if (Array.isArray(provider.args)) {
      args = provider.args as string[];
    } else if (typeof provider.args === 'string') {
      try {
        const parsed = JSON.parse(provider.args);
        if (Array.isArray(parsed)) {
          args = parsed as string[];
        }
      } catch {
        // If not valid JSON, treat as a single arg
        args = [provider.args];
      }
    }
  }

  validateReviewerWorkerCommand(command, args, `Provider "${providerName}"`);

  return { command, ...(args !== undefined ? { args } : {}) };
}

/**
 * Resolve the currently selected reviewer provider from config.
 *
 * Reads `reviewer.provider`, then resolves it through `reviewer.providers.<name>`.
 * Returns null when no active provider is configured.
 */
export function resolveSelectedReviewerProvider(
  configPath: string,
): { providerName: string; command: string; args?: string[] } | null {
  const config = readConfig(configPath);
  const reviewer = config.reviewer;

  if (typeof reviewer !== 'object' || reviewer === null || Array.isArray(reviewer)) {
    return null;
  }

  const providerName = (reviewer as Record<string, unknown>).provider;
  if (typeof providerName !== 'string' || providerName.trim().length === 0) {
    return null;
  }

  const resolved = resolveProvider(configPath, providerName);
  return {
    providerName,
    ...resolved,
  };
}

/**
 * Set a single value in the config file using a dot-path key.
 *
 * Example: `setConfigValue(path, 'reviewer.provider', 'anthropic')`
 * produces `{ reviewer: { provider: "anthropic" } }`.
 *
 * Existing keys not on the dot-path are preserved.
 * Returns the updated config object.
 */
export function setConfigValue(
  configPath: string,
  dotKey: string,
  value: string,
): Record<string, unknown> {
  const config = readConfig(configPath);
  const parts = dotKey.split('.');

  // Walk/create nested objects, set leaf value
  let current: Record<string, unknown> = config;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    if (typeof current[key] !== 'object' || current[key] === null || Array.isArray(current[key])) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;

  writeConfig(configPath, config);
  return config;
}
