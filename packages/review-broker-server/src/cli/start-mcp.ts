#!/usr/bin/env node
import process from 'node:process';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createBrokerMcpServer, startBroker } from '../index.js';

interface CliOptions {
  help: boolean;
  cwd?: string;
  dbPath?: string;
  busyTimeoutMs?: number;
}

async function main(): Promise<void> {
  try {
    const options = parseCliArgs(process.argv.slice(2));

    if (options.help) {
      printUsage();
      return;
    }

    const runtime = startBroker({
      ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
      ...(options.dbPath !== undefined ? { dbPath: options.dbPath } : {}),
      ...(options.busyTimeoutMs !== undefined ? { busyTimeoutMs: options.busyTimeoutMs } : {}),
    });
    const server = createBrokerMcpServer({ service: runtime.service });
    const transport = new StdioServerTransport();

    let shuttingDown = false;
    const closeRuntime = () => {
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;
      runtime.close();
    };

    transport.onerror = (error) => {
      emit('mcp.transport_error', {
        message: error.message,
      });
      closeRuntime();
    };

    transport.onclose = () => {
      emit('mcp.transport_closed', {
        dbPath: runtime.context.dbPath,
      });
      closeRuntime();
    };

    await server.connect(transport);

    emit('mcp.started', {
      dbPath: runtime.context.dbPath,
      dbPathSource: runtime.context.dbPathSource,
      workspaceRoot: runtime.context.workspaceRoot,
      configPath: runtime.context.configPath,
      configPathSource: runtime.context.configPathSource,
      startupRecovery: runtime.getStartupRecoverySnapshot(),
      transport: 'stdio',
    });

    await runtime.waitUntilStopped();
    await server.close().catch(() => undefined);

    emit('mcp.stopped', {
      dbPath: runtime.context.dbPath,
      shutdown: runtime.getShutdownSnapshot(),
    });
  } catch (error) {
    const options = parseFallbackCliOptions(process.argv.slice(2));

    emit('mcp.start_failed', {
      cwd: options.cwd ?? process.cwd(),
      dbPath: options.dbPath ?? null,
      message: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  }
}

function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (!argument) {
      continue;
    }

    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }

    if (argument.startsWith('--db-path=')) {
      options.dbPath = argument.slice('--db-path='.length);
      continue;
    }

    if (argument === '--db-path') {
      options.dbPath = requireValue(argv, index, '--db-path');
      index += 1;
      continue;
    }

    if (argument.startsWith('--cwd=')) {
      options.cwd = argument.slice('--cwd='.length);
      continue;
    }

    if (argument === '--cwd') {
      options.cwd = requireValue(argv, index, '--cwd');
      index += 1;
      continue;
    }

    if (argument.startsWith('--busy-timeout-ms=')) {
      options.busyTimeoutMs = parsePositiveInteger(argument.slice('--busy-timeout-ms='.length), '--busy-timeout-ms');
      continue;
    }

    if (argument === '--busy-timeout-ms') {
      options.busyTimeoutMs = parsePositiveInteger(requireValue(argv, index, '--busy-timeout-ms'), '--busy-timeout-ms');
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function parseFallbackCliOptions(argv: string[]): Pick<CliOptions, 'cwd' | 'dbPath'> {
  const options: Pick<CliOptions, 'cwd' | 'dbPath'> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (!argument) {
      continue;
    }

    if (argument.startsWith('--db-path=')) {
      options.dbPath = argument.slice('--db-path='.length);
      continue;
    }

    if (argument === '--db-path') {
      const value = argv[index + 1];
      if (value && !value.startsWith('--')) {
        options.dbPath = value;
        index += 1;
      }
      continue;
    }

    if (argument.startsWith('--cwd=')) {
      options.cwd = argument.slice('--cwd='.length);
      continue;
    }

    if (argument === '--cwd') {
      const value = argv[index + 1];
      if (value && !value.startsWith('--')) {
        options.cwd = value;
        index += 1;
      }
    }
  }

  return options;
}

function requireValue(argv: string[], index: number, optionName: string): string {
  const value = argv[index + 1];

  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${optionName}.`);
  }

  return value;
}

function parsePositiveInteger(rawValue: string, optionName: string): number {
  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid value for ${optionName}: ${rawValue}. Expected a non-negative integer.`);
  }

  return parsed;
}

function emit(event: string, payload: Record<string, unknown>): void {
  process.stderr.write(`${JSON.stringify({ event, ...payload })}\n`);
}

function printUsage(): void {
  process.stderr.write(
    `Usage: start-mcp [options]\n\nOptions:\n  --db-path <path>          Override the SQLite database path\n  --cwd <path>              Resolve workspace-relative paths from this directory\n  --busy-timeout-ms <ms>    Override SQLite busy_timeout PRAGMA\n  -h, --help                Show this help message\n`,
  );
}

await main();
