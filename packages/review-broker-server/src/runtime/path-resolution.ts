import { existsSync } from 'node:fs';
import path from 'node:path';

export const REVIEW_BROKER_DB_PATH_ENV = 'REVIEW_BROKER_DB_PATH';
export const REVIEW_BROKER_CONFIG_PATH_ENV = 'REVIEW_BROKER_CONFIG_PATH';

export interface ResolveBrokerPathsOptions {
  cwd?: string;
  dbPath?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
}

export interface ResolvedBrokerPaths {
  workspaceRoot: string;
  dbPath: string;
  dbPathSource: 'argument' | 'env' | 'default';
  configPath: string;
  configPathSource: 'env' | 'default';
}

export function resolveBrokerPaths(options: ResolveBrokerPathsOptions = {}): ResolvedBrokerPaths {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? env.HOME ?? cwd;
  const workspaceRoot = findWorkspaceRoot(cwd);

  let dbPathSource: ResolvedBrokerPaths['dbPathSource'] = 'default';
  let dbPath = defaultBrokerDbPath({ env, homeDir });

  if (env[REVIEW_BROKER_DB_PATH_ENV]) {
    dbPath = path.resolve(cwd, env[REVIEW_BROKER_DB_PATH_ENV]!);
    dbPathSource = 'env';
  }

  if (options.dbPath) {
    dbPath = path.resolve(cwd, options.dbPath);
    dbPathSource = 'argument';
  }

  let configPathSource: ResolvedBrokerPaths['configPathSource'] = 'default';
  let configPath = path.join(workspaceRoot, '.gsd', 'review-broker', 'config.json');

  if (env[REVIEW_BROKER_CONFIG_PATH_ENV]) {
    configPath = path.resolve(cwd, env[REVIEW_BROKER_CONFIG_PATH_ENV]!);
    configPathSource = 'env';
  }

  return {
    workspaceRoot,
    dbPath,
    dbPathSource,
    configPath,
    configPathSource,
  };
}

export function findWorkspaceRoot(startDir: string): string {
  let current = path.resolve(startDir);

  while (true) {
    if (hasWorkspaceMarker(current)) {
      return current;
    }

    const parent = path.dirname(current);

    if (parent === current) {
      return path.resolve(startDir);
    }

    current = parent;
  }
}

function hasWorkspaceMarker(candidate: string): boolean {
  return existsSync(path.join(candidate, '.git')) || existsSync(path.join(candidate, '.gsd'));
}

function defaultBrokerDbPath(options: { env: NodeJS.ProcessEnv; homeDir: string }): string {
  const stateHome = options.env.XDG_STATE_HOME
    ? path.resolve(options.env.XDG_STATE_HOME)
    : path.join(options.homeDir, '.local', 'state');

  return path.join(stateHome, 'tandem2', 'review-broker.sqlite');
}
