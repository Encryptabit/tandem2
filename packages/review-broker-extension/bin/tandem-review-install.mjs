#!/usr/bin/env node
import process from 'node:process';

import { installTandemReviewExtension } from '../dist/install.js';

function printHelp() {
  process.stdout.write(`Usage: tandem-review-install [options]

Install the Tandem review extension entrypoint and bootstrap its review-broker
config defaults.

Modes:
  Project (default)        Drops .gsd/extensions/tandem-review.mjs into --cwd
                           and creates .gsd/review-broker/config.json defaults.
  Global (--global)        Drops a tandem-review/ directory into the user-level
                           pi extensions root (default: ~/.pi/agent/extensions/).
                           No project config is bootstrapped — the extension
                           creates .gsd/review-broker/config.json at runtime
                           against whichever project loads it.

Options:
  --cwd <path>             Project root for project installs (default: cwd)
  --extension-path <path>  Override the extension target.
                             Project mode: file path (default tandem-review.mjs)
                             Global mode:  directory path (default tandem-review/)
  --global                 Install into the global pi user-extensions directory
  --pi-home <path>         Override the pi home root used to derive the default
                             global install path (default: $PI_HOME or ~/.pi)
  --force                  Overwrite the extension entrypoint if it differs
  --json                   Print machine-readable JSON result
  -h, --help               Show this help message
`);
}

function parseArgs(argv) {
  const parsed = {
    cwd: undefined,
    extensionPath: undefined,
    global: false,
    piHome: undefined,
    force: false,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '-h' || arg === '--help') {
      parsed.help = true;
      continue;
    }

    if (arg === '--json') {
      parsed.json = true;
      continue;
    }

    if (arg === '--force') {
      parsed.force = true;
      continue;
    }

    if (arg === '--global') {
      parsed.global = true;
      continue;
    }

    if (arg === '--cwd' || arg === '--project-root') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${arg}.`);
      }
      parsed.cwd = value;
      i += 1;
      continue;
    }

    if (arg.startsWith('--cwd=')) {
      parsed.cwd = arg.slice('--cwd='.length);
      continue;
    }

    if (arg.startsWith('--project-root=')) {
      parsed.cwd = arg.slice('--project-root='.length);
      continue;
    }

    if (arg === '--extension-path') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --extension-path.');
      }
      parsed.extensionPath = value;
      i += 1;
      continue;
    }

    if (arg.startsWith('--extension-path=')) {
      parsed.extensionPath = arg.slice('--extension-path='.length);
      continue;
    }

    if (arg === '--pi-home') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --pi-home.');
      }
      parsed.piHome = value;
      i += 1;
      continue;
    }

    if (arg.startsWith('--pi-home=')) {
      parsed.piHome = arg.slice('--pi-home='.length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

try {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const result = installTandemReviewExtension({
    ...(args.cwd ? { projectRoot: args.cwd } : {}),
    ...(args.extensionPath ? { extensionPath: args.extensionPath } : {}),
    ...(args.global ? { global: true } : {}),
    ...(args.piHome ? { globalPiHome: args.piHome } : {}),
    ...(args.force ? { force: true } : {}),
  });

  if (args.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else if (result.scope === 'global') {
    process.stdout.write(
      [
        `Installed tandem review extension (global) at ${result.extensionPath}`,
        result.manifestPath ? `Manifest at ${result.manifestPath}` : null,
        result.packageJsonPath ? `Package metadata at ${result.packageJsonPath}` : null,
        `Extension created=${result.extensionCreated} updated=${result.extensionUpdated}`,
        'Project review-broker config will be created on first run.',
      ]
        .filter((line) => line !== null)
        .join('\n') + '\n',
    );
  } else {
    process.stdout.write(
      [
        `Installed tandem review extension at ${result.extensionPath}`,
        result.configPath ? `Config defaults ready at ${result.configPath}` : null,
        `Extension created=${result.extensionCreated} updated=${result.extensionUpdated}`,
        `Config created=${result.configCreated} updated=${result.configUpdated}`,
      ]
        .filter((line) => line !== null)
        .join('\n') + '\n',
    );
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}
