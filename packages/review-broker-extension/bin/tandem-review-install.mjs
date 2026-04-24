#!/usr/bin/env node
import process from 'node:process';

import { installTandemReviewExtension } from '../dist/install.js';

function printHelp() {
  process.stdout.write(`Usage: tandem-review-install [options]

Install the Tandem review extension entrypoint into a project and bootstrap
.gsd/review-broker/config.json defaults.

Options:
  --cwd <path>             Project root (default: current working directory)
  --extension-path <path>  Override extension file path
  --force                  Overwrite extension file if it already exists
  --json                   Print machine-readable JSON result
  -h, --help               Show this help message
`);
}

function parseArgs(argv) {
  const parsed = {
    cwd: undefined,
    extensionPath: undefined,
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
    ...(args.force ? { force: true } : {}),
  });

  if (args.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    process.stdout.write(
      [
        `Installed tandem review extension at ${result.extensionPath}`,
        `Config defaults ready at ${result.configPath}`,
        `Extension created=${result.extensionCreated} updated=${result.extensionUpdated}`,
        `Config created=${result.configCreated} updated=${result.configUpdated}`,
      ].join('\n') + '\n',
    );
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}
