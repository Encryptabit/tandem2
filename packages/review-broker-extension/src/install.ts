import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  ensureReviewBrokerConfigDefaults,
  type EnsureReviewBrokerConfigDefaultsOptions,
} from './config-defaults.js';

const DEFAULT_EXTENSION_FILENAME = 'tandem-review.mjs';
const DEFAULT_GLOBAL_EXTENSION_DIRNAME = 'tandem-review';

export interface InstallTandemReviewExtensionOptions
  extends Omit<EnsureReviewBrokerConfigDefaultsOptions, 'projectRoot'> {
  /**
   * Project to install into. Ignored when `global` is true.
   * Defaults to `process.cwd()`.
   */
  projectRoot?: string;
  /**
   * For project-local installs: target file path
   *   (default `<projectRoot>/.gsd/extensions/tandem-review.mjs`).
   * For global installs: target directory path
   *   (default `<piHome>/agent/extensions/tandem-review/`).
   */
  extensionPath?: string;
  /**
   * Install into the global pi user-extensions directory instead of the project's
   * `.gsd/extensions/` directory. Skips the project-local config bootstrap; the
   * extension creates `.gsd/review-broker/config.json` at runtime when loaded.
   */
  global?: boolean;
  /**
   * Override the global pi root used to derive the default install path.
   * Defaults to `process.env.PI_HOME ?? '~/.pi'`. Ignored when `global` is false.
   */
  globalPiHome?: string;
  /** Overwrite existing files when they differ from the rendered template. */
  force?: boolean;
}

export interface InstallTandemReviewExtensionResult {
  /** `'project'` for a `.gsd/extensions/...` install, `'global'` for a pi user-extension install. */
  scope: 'project' | 'global';
  /** Resolved project root (always set for project installs; null for global). */
  projectRoot: string | null;
  /** Path to the entrypoint file written on disk. */
  extensionPath: string;
  /** Path to the manifest JSON copied into a global install (null for project installs). */
  manifestPath: string | null;
  /** Path to the package.json written into a global install (null for project installs). */
  packageJsonPath: string | null;
  /** Path to the project-local config bootstrapped by the install (null for global installs). */
  configPath: string | null;
  extensionCreated: boolean;
  extensionUpdated: boolean;
  configCreated: boolean;
  configUpdated: boolean;
}

function resolvePackageEntryFromManifest(
  packageDir: string,
  manifest: Record<string, unknown>,
): string | null {
  const exportsField = manifest.exports;
  if (exportsField !== null && typeof exportsField === 'object') {
    const root = (exportsField as Record<string, unknown>)['.'];
    if (typeof root === 'string') {
      return path.resolve(packageDir, root);
    }
    if (root !== null && typeof root === 'object') {
      const importPath = (root as Record<string, unknown>).import;
      if (typeof importPath === 'string') {
        return path.resolve(packageDir, importPath);
      }
      const defaultPath = (root as Record<string, unknown>).default;
      if (typeof defaultPath === 'string') {
        return path.resolve(packageDir, defaultPath);
      }
    }
  }
  if (typeof manifest.main === 'string') {
    return path.resolve(packageDir, manifest.main);
  }
  return path.join(packageDir, 'index.js');
}

function tryReadManifest(manifestPath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function resolveModuleEntryByWalk(specifier: string, startDir: string): string | null {
  let current = path.resolve(startDir);
  let workspaceRoot: string | null = null;

  while (true) {
    // 1. node_modules/<specifier> (handles installed deps and pnpm symlink layout)
    const nmManifestPath = path.join(current, 'node_modules', specifier, 'package.json');
    if (existsSync(nmManifestPath)) {
      const manifest = tryReadManifest(nmManifestPath);
      if (manifest) {
        const entry = resolvePackageEntryFromManifest(path.dirname(nmManifestPath), manifest);
        if (entry !== null && existsSync(entry)) {
          return entry;
        }
      }
    }

    // 2. Self-match: the current dir's own package.json names the specifier
    //    (so install.ts inside review-broker-extension can resolve itself).
    const ownManifestPath = path.join(current, 'package.json');
    if (existsSync(ownManifestPath)) {
      const manifest = tryReadManifest(ownManifestPath);
      if (manifest && manifest.name === specifier) {
        const entry = resolvePackageEntryFromManifest(current, manifest);
        if (entry !== null && existsSync(entry)) {
          return entry;
        }
      }
    }

    // 3. Workspace anchor: pnpm-workspace.yaml or a workspaces field in package.json.
    //    When we hit one, scan its packages/* directories for a matching name.
    if (existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
      workspaceRoot = current;
      break;
    }
    const ownManifest = tryReadManifest(ownManifestPath);
    if (ownManifest && ownManifest.workspaces !== undefined) {
      workspaceRoot = current;
      break;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }

  if (workspaceRoot !== null) {
    const packagesDir = path.join(workspaceRoot, 'packages');
    if (existsSync(packagesDir)) {
      for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
        const manifestPath = path.join(packagesDir, entry.name, 'package.json');
        if (!existsSync(manifestPath)) continue;
        const manifest = tryReadManifest(manifestPath);
        if (!manifest || manifest.name !== specifier) continue;
        const resolved = resolvePackageEntryFromManifest(path.dirname(manifestPath), manifest);
        if (resolved !== null && existsSync(resolved)) {
          return resolved;
        }
      }
    }
  }

  return null;
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
    // Continue to manual walk.
  }

  // Last resort: walk up looking for node_modules/<specifier>, the package itself
  // (self-reference), or a pnpm/workspace root with a matching packages/* member.
  // This is needed under vitest/vite-node, where the vite resolver can refuse
  // self-package self-reference and the CJS createRequire is anchored at a
  // non-file URL.
  const startDir = path.dirname(fileURLToPath(import.meta.url));
  return resolveModuleEntryByWalk(specifier, startDir);
}

function renderProjectExtensionEntrypoint(): string {
  return `/**
 * Tandem review-gate extension for this project.
 *
 * Auto-generated by tandem-review-install.
 */

import {
  createTandemReviewExtension,
  createBrokerTransportAdapter,
  ensureReviewBrokerConfigDefaults,
} from '@carithecoder/review-broker-extension';
import { startInProcessBrokerClient } from '@carithecoder/review-broker-client';

const BROKER_DB_PATH = process.env.TANDEM_BROKER_DB?.trim() || undefined;
const AUTHOR_ID = process.env.TANDEM_AUTHOR_ID ?? 'auto-agent';
const BLOCKED_POLICY = process.env.TANDEM_REVIEW_BLOCKED_POLICY === 'intervene'
  ? 'intervene'
  : 'auto-loop';
const REVIEW_WAIT_TIMEOUT_MS = Number.parseInt(process.env.TANDEM_REVIEW_WAIT_TIMEOUT_MS ?? '', 10);
const REVIEW_WAIT_POLL_INTERVAL_MS = Number.parseInt(process.env.TANDEM_REVIEW_WAIT_POLL_INTERVAL_MS ?? '', 10);

function optionalNonNegativeMs(value) {
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function optionalPositiveMs(value) {
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

ensureReviewBrokerConfigDefaults({
  projectRoot: process.cwd(),
});

const { client } = startInProcessBrokerClient({
  ...(BROKER_DB_PATH ? { dbPath: BROKER_DB_PATH } : {}),
  cwd: process.cwd(),
  handleSignals: false,
});

export default createTandemReviewExtension({
  blockedPolicy: BLOCKED_POLICY,
  reviewWaitTimeoutMs: optionalNonNegativeMs(REVIEW_WAIT_TIMEOUT_MS),
  reviewWaitPollIntervalMs: optionalPositiveMs(REVIEW_WAIT_POLL_INTERVAL_MS),
  transport: createBrokerTransportAdapter({
    client,
    cwd: process.cwd(),
    authorId: AUTHOR_ID,
  }),
});
`;
}

function renderGlobalExtensionEntrypoint(args: {
  reviewBrokerExtensionUrl: string;
  reviewBrokerClientUrl: string;
}): string {
  return `/**
 * Tandem review-gate extension (global pi user-extension install).
 *
 * Auto-generated by \`tandem-review-install --global\`. The package paths
 * below are baked at install time so this entrypoint loads regardless of
 * whether \`review-broker-extension\` and \`review-broker-client\` are on
 * the runtime module-resolution path.
 *
 * If you move or uninstall the underlying packages, re-run
 * \`tandem-review-install --global --force\` to refresh these paths.
 */

import {
  createTandemReviewExtension,
  createBrokerTransportAdapter,
  ensureReviewBrokerConfigDefaults,
} from '${args.reviewBrokerExtensionUrl}';
import { startInProcessBrokerClient } from '${args.reviewBrokerClientUrl}';

const BROKER_DB_PATH = process.env.TANDEM_BROKER_DB?.trim() || undefined;
const AUTHOR_ID = process.env.TANDEM_AUTHOR_ID ?? 'auto-agent';
const BLOCKED_POLICY = process.env.TANDEM_REVIEW_BLOCKED_POLICY === 'intervene'
  ? 'intervene'
  : 'auto-loop';
const REVIEW_WAIT_TIMEOUT_MS = Number.parseInt(process.env.TANDEM_REVIEW_WAIT_TIMEOUT_MS ?? '', 10);
const REVIEW_WAIT_POLL_INTERVAL_MS = Number.parseInt(process.env.TANDEM_REVIEW_WAIT_POLL_INTERVAL_MS ?? '', 10);

function optionalNonNegativeMs(value) {
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function optionalPositiveMs(value) {
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

ensureReviewBrokerConfigDefaults({
  projectRoot: process.cwd(),
});

const { client } = startInProcessBrokerClient({
  ...(BROKER_DB_PATH ? { dbPath: BROKER_DB_PATH } : {}),
  cwd: process.cwd(),
  handleSignals: false,
});

export default createTandemReviewExtension({
  blockedPolicy: BLOCKED_POLICY,
  reviewWaitTimeoutMs: optionalNonNegativeMs(REVIEW_WAIT_TIMEOUT_MS),
  reviewWaitPollIntervalMs: optionalPositiveMs(REVIEW_WAIT_POLL_INTERVAL_MS),
  transport: createBrokerTransportAdapter({
    client,
    cwd: process.cwd(),
    authorId: AUTHOR_ID,
  }),
});
`;
}

function defaultGlobalExtensionRoot(globalPiHome: string | undefined): string {
  const home = globalPiHome ?? process.env.PI_HOME ?? path.join(homedir(), '.pi');
  return path.join(home, 'agent', 'extensions', DEFAULT_GLOBAL_EXTENSION_DIRNAME);
}

function findExtensionManifestSource(): string | null {
  // The bundled manifest lives next to dist/. Walk up from this module file:
  //   <pkg>/dist/install.js → <pkg>/extension-manifest.json
  // (when running from src in dev, it's still <pkg>/extension-manifest.json)
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '..', 'extension-manifest.json'),
    path.resolve(here, '..', '..', 'extension-manifest.json'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function writeIfChanged(targetPath: string, content: string, force: boolean | undefined): {
  created: boolean;
  updated: boolean;
} {
  if (!existsSync(targetPath)) {
    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, content, 'utf8');
    return { created: true, updated: true };
  }
  if (force === true && readFileSync(targetPath, 'utf8') !== content) {
    writeFileSync(targetPath, content, 'utf8');
    return { created: false, updated: true };
  }
  return { created: false, updated: false };
}

export function installTandemReviewExtension(
  options: InstallTandemReviewExtensionOptions = {},
): InstallTandemReviewExtensionResult {
  if (options.global) {
    return installGlobal(options);
  }
  return installLocal(options);
}

function installLocal(
  options: InstallTandemReviewExtensionOptions,
): InstallTandemReviewExtensionResult {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const extensionPath = path.resolve(
    options.extensionPath ??
      path.join(projectRoot, '.gsd', 'extensions', DEFAULT_EXTENSION_FILENAME),
  );

  const extensionContent = renderProjectExtensionEntrypoint();
  const { created, updated } = writeIfChanged(extensionPath, extensionContent, options.force);

  const configResult = ensureReviewBrokerConfigDefaults({
    projectRoot,
    ...(options.configPath ? { configPath: options.configPath } : {}),
    ...(options.providerName ? { providerName: options.providerName } : {}),
    ...(options.workerCommand ? { workerCommand: options.workerCommand } : {}),
    ...(options.workerScriptPath ? { workerScriptPath: options.workerScriptPath } : {}),
  });

  return {
    scope: 'project',
    projectRoot,
    extensionPath,
    manifestPath: null,
    packageJsonPath: null,
    configPath: configResult.configPath,
    extensionCreated: created,
    extensionUpdated: updated,
    configCreated: configResult.created,
    configUpdated: configResult.updated,
  };
}

function installGlobal(
  options: InstallTandemReviewExtensionOptions,
): InstallTandemReviewExtensionResult {
  const targetDir = path.resolve(
    options.extensionPath ?? defaultGlobalExtensionRoot(options.globalPiHome),
  );

  const reviewBrokerExtensionEntry = resolveModuleEntry('@carithecoder/review-broker-extension');
  if (!reviewBrokerExtensionEntry) {
    throw new Error(
      "Cannot resolve '@carithecoder/review-broker-extension' for a global install. " +
        'Install the package on a stable path (for example, `npm i -g review-broker-extension`) ' +
        'and try again.',
    );
  }
  const reviewBrokerClientEntry = resolveModuleEntry('@carithecoder/review-broker-client');
  if (!reviewBrokerClientEntry) {
    throw new Error(
      "Cannot resolve '@carithecoder/review-broker-client' for a global install. " +
        'Install the package on a stable path (for example, `npm i -g review-broker-client`) ' +
        'and try again.',
    );
  }

  const reviewBrokerExtensionUrl = pathToFileURL(reviewBrokerExtensionEntry).href;
  const reviewBrokerClientUrl = pathToFileURL(reviewBrokerClientEntry).href;

  const indexPath = path.join(targetDir, 'index.js');
  const packageJsonPath = path.join(targetDir, 'package.json');
  const manifestPath = path.join(targetDir, 'extension-manifest.json');

  mkdirSync(targetDir, { recursive: true });

  const indexContent = renderGlobalExtensionEntrypoint({
    reviewBrokerExtensionUrl,
    reviewBrokerClientUrl,
  });
  const indexOutcome = writeIfChanged(indexPath, indexContent, options.force);

  const packageJsonContent = JSON.stringify({ type: 'module', private: true }, null, 2) + '\n';
  writeIfChanged(packageJsonPath, packageJsonContent, options.force);

  const manifestSource = findExtensionManifestSource();
  let copiedManifestPath: string | null = null;
  if (manifestSource !== null) {
    if (!existsSync(manifestPath) || options.force === true) {
      copyFileSync(manifestSource, manifestPath);
    }
    copiedManifestPath = manifestPath;
  }

  return {
    scope: 'global',
    projectRoot: null,
    extensionPath: indexPath,
    manifestPath: copiedManifestPath,
    packageJsonPath,
    configPath: null,
    extensionCreated: indexOutcome.created,
    extensionUpdated: indexOutcome.updated,
    configCreated: false,
    configUpdated: false,
  };
}
