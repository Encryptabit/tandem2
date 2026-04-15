#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { inspectBrokerRuntime, startBroker } from '../index.js';
import { createDashboardRoutes } from '../http/dashboard-routes.js';
import { createDashboardServer } from '../http/dashboard-server.js';

interface CliOptions {
  help: boolean;
  once: boolean;
  dashboard: boolean;
  dashboardPort?: number;
  dashboardHost?: string;
  cwd?: string;
  dbPath?: string;
  busyTimeoutMs?: number;
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  try {
    const runtime = startBroker({
      ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
      ...(options.dbPath !== undefined ? { dbPath: options.dbPath } : {}),
      ...(options.busyTimeoutMs !== undefined ? { busyTimeoutMs: options.busyTimeoutMs } : {}),
    });

    const mode = options.once ? 'once' : options.dashboard ? 'dashboard' : 'serve';

    emit('broker.started', {
      startedAt: runtime.startedAt,
      mode,
      dbPath: runtime.context.dbPath,
      dbPathSource: runtime.context.dbPathSource,
      workspaceRoot: runtime.context.workspaceRoot,
      configPath: runtime.context.configPath,
      configPathSource: runtime.context.configPathSource,
      pragmas: runtime.context.pragmas,
      migrations: runtime.context.appliedMigrations.map((migration) => migration.id),
      startupRecovery: runtime.getStartupRecoverySnapshot(),
    });

    if (options.once) {
      const snapshot = inspectBrokerRuntime(runtime.context);
      runtime.close();
      await runtime.waitUntilStopped();

      emit('broker.once_complete', {
        dbPath: runtime.context.dbPath,
        reviewCount: snapshot.reviewCount,
        reviewerCount: snapshot.reviewerCount,
        trackedReviewerCount: snapshot.trackedReviewerCount,
        reviewerStatusCounts: snapshot.reviewerStatusCounts,
        messageCount: snapshot.messageCount,
        auditEventCount: snapshot.auditEventCount,
        migrationCount: snapshot.migrationCount,
        statusCounts: snapshot.statusCounts,
        counterPatchStatusCounts: snapshot.counterPatchStatusCounts,
        latestReview: snapshot.latestReview,
        latestReviewer: snapshot.latestReviewer,
        latestMessage: snapshot.latestMessage,
        latestAuditEvent: snapshot.latestAuditEvent,
        startupRecovery: runtime.getStartupRecoverySnapshot(),
      });
      return;
    }

    if (options.dashboard) {
      const dashboardDistPath = resolveDashboardDistPath(runtime.context.workspaceRoot);
      const routes = createDashboardRoutes({
        context: runtime.context,
        service: runtime.service,
        startupRecoverySnapshot: runtime.getStartupRecoverySnapshot(),
      });

      const server = await createDashboardServer({
        dashboardDistPath,
        routes,
        ...(options.dashboardHost !== undefined ? { host: options.dashboardHost } : {}),
        ...(options.dashboardPort !== undefined ? { port: options.dashboardPort } : {}),
      });

      emit('broker.dashboard_ready', {
        url: server.baseUrl,
        port: server.port,
        dashboardDistPath,
      });

      // Gracefully tear down on broker stop
      const originalClose = runtime.close;
      runtime.close = () => {
        routes.dispose();
        void server.close();
        originalClose();
      };

      await runtime.waitUntilStopped();
      emit('broker.stopped', {
        dbPath: runtime.context.dbPath,
        shutdown: runtime.getShutdownSnapshot(),
      });
      return;
    }

    await runtime.waitUntilStopped();
    emit('broker.stopped', {
      dbPath: runtime.context.dbPath,
      shutdown: runtime.getShutdownSnapshot(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    emit(
      'broker.start_failed',
      {
        cwd: options.cwd ?? process.cwd(),
        dbPath: options.dbPath ?? null,
        message,
      },
      'stderr',
    );

    process.exitCode = 1;
  }
}

function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    help: false,
    once: false,
    dashboard: false,
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

    if (argument === '--once') {
      options.once = true;
      continue;
    }

    if (argument === '--dashboard') {
      options.dashboard = true;
      continue;
    }

    if (argument.startsWith('--dashboard-port=')) {
      options.dashboardPort = parsePositiveInteger(argument.slice('--dashboard-port='.length), '--dashboard-port');
      continue;
    }

    if (argument === '--dashboard-port') {
      options.dashboardPort = parsePositiveInteger(requireValue(argv, index, '--dashboard-port'), '--dashboard-port');
      index += 1;
      continue;
    }

    if (argument.startsWith('--dashboard-host=')) {
      options.dashboardHost = argument.slice('--dashboard-host='.length);
      continue;
    }

    if (argument === '--dashboard-host') {
      options.dashboardHost = requireValue(argv, index, '--dashboard-host');
      index += 1;
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

function emit(event: string, payload: Record<string, unknown>, stream: 'stdout' | 'stderr' = 'stdout'): void {
  const line = JSON.stringify({ event, ...payload });

  if (stream === 'stderr') {
    console.error(line);
    return;
  }

  console.log(line);
}

function printUsage(): void {
  process.stdout.write(`Usage: start-broker [options]\n\nOptions:\n  --db-path <path>          Override the SQLite database path\n  --cwd <path>              Resolve workspace-relative paths from this directory\n  --busy-timeout-ms <ms>    Override SQLite busy_timeout PRAGMA\n  --once                    Open, migrate, report state, and exit\n  --dashboard               Start the broker with the mounted dashboard HTTP server\n  --dashboard-port <port>   Dashboard HTTP port (default: 0 = OS-assigned)\n  --dashboard-host <host>   Dashboard HTTP host (default: 127.0.0.1)\n  -h, --help                Show this help message\n`);
}

/**
 * Resolve the dashboard dist path relative to the workspace root.
 * Walks up from the broker-server package to find the sibling dashboard package.
 */
function resolveDashboardDistPath(cwd: string): string {
  const fromCwd = path.resolve(cwd, 'packages', 'review-broker-dashboard', 'dist');
  if (existsSync(fromCwd)) {
    return fromCwd;
  }

  return path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '..', '..', '..', 'review-broker-dashboard', 'dist',
  );
}

await main();
