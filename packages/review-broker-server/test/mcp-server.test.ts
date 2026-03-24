import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, describe, expect, it } from 'vitest';

import { BROKER_OPERATION_MCP_TOOL_NAMES, BROKER_OPERATIONS } from 'review-broker-core';

import { REVIEWER_FIXTURE_PATH, WORKTREE_ROOT } from './test-paths.js';
const CLI_PATH = path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'src', 'cli', 'start-mcp.ts');
const TSX_PATH = path.join(WORKTREE_ROOT, 'node_modules', '.bin', 'tsx');
const tempDirectories: string[] = [];
const openClients: Array<{ client: Client; transport: StdioClientTransport }> = [];

afterEach(async () => {
  while (openClients.length > 0) {
    const handle = openClients.pop();

    if (!handle) {
      continue;
    }

    await handle.client.close().catch(() => undefined);
    await handle.transport.close().catch(() => undefined);
  }

  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();

    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe('review-broker-server MCP stdio surface', () => {
  it('lists one official MCP tool per shared broker operation and keeps startup diagnostics on stderr', async () => {
    const harness = await createHarness();

    const listed = await harness.client.listTools();
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual([...BROKER_OPERATION_MCP_TOOL_NAMES].sort());
    expect(listed.tools).toEqual(
      expect.arrayContaining(
        BROKER_OPERATIONS.map((operation) =>
          expect.objectContaining({
            name: operation.mcpToolName,
            title: operation.mcpToolName,
            description: `Invoke broker operation ${operation.methodName}.`,
            inputSchema: expect.objectContaining({ type: 'object' }),
            outputSchema: expect.objectContaining({ type: 'object' }),
          }),
        ),
      ),
    );

    expect(harness.stderrLines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/"event":"mcp.started"/),
      ]),
    );
  });

  it('dispatches representative review and reviewer operations through the official stdio transport', async () => {
    const harness = await createHarness();

    const initialReviewers = await harness.client.callTool({
      name: 'list_reviewers',
      arguments: {},
    });
    expect(initialReviewers.structuredContent).toEqual({ reviewers: [], version: 0 });
    expect(initialReviewers.content).toEqual([{ type: 'text', text: 'list_reviewers succeeded. Version 0.' }]);

    const spawned = await harness.client.callTool({
      name: 'spawn_reviewer',
      arguments: {
        reviewerId: 'mcp-reviewer-1',
        command: process.execPath,
        args: [REVIEWER_FIXTURE_PATH],
        cwd: 'packages/review-broker-server',
      },
    });

    expect(spawned.structuredContent).toMatchObject({
      reviewer: {
        reviewerId: 'mcp-reviewer-1',
        status: 'idle',
        currentReviewId: null,
        command: path.basename(process.execPath),
        args: ['packages/review-broker-server/test/fixtures/reviewer-worker.mjs'],
        cwd: 'packages/review-broker-server',
      },
      version: 1,
    });

    const created = await harness.client.callTool({
      name: 'create_review',
      arguments: {
        title: 'MCP review',
        description: 'Verify MCP tool dispatch uses the shared broker contract.',
        diff: readFixture('valid-review.diff'),
        authorId: 'agent-author',
        priority: 'high',
      },
    });

    expect(created.structuredContent).toMatchObject({
      review: {
        reviewId: expect.stringMatching(/^rvw_/),
        title: 'MCP review',
        status: 'pending',
        priority: 'high',
        authorId: 'agent-author',
        currentRound: 1,
      },
      proposal: {
        title: 'MCP review',
        currentRound: 1,
        affectedFiles: expect.arrayContaining(['packages/review-broker-server/src/runtime/_proposal_fixture_valid.ts']),
      },
      version: expect.any(Number),
    });

    const listedReviews = await harness.client.callTool({
      name: 'list_reviews',
      arguments: {},
    });
    expect(listedReviews.structuredContent).toMatchObject({
      reviews: [
        expect.objectContaining({
          reviewId: (created.structuredContent as Record<string, any>).review.reviewId,
          status: 'pending',
        }),
      ],
      version: expect.any(Number),
    });
  });

  it('surfaces structured tool failures and redacted stderr diagnostics for invalid broker dispatches', async () => {
    const harness = await createHarness();
    const uniqueLeakSentinel = 'SECRET_PATCH_BODY_SHOULD_NOT_APPEAR';

    const failed = await harness.client.callTool({
      name: 'create_review',
      arguments: {
        title: 'Dispatch failure review',
        description: 'An invalid diff should fail inside the broker service without leaking patch bodies.',
        diff: `not a unified diff\n${uniqueLeakSentinel}`,
        authorId: 'agent-author',
        priority: 'normal',
      },
    });

    expect(failed.isError).toBe(true);
    expect(failed.structuredContent).toBeUndefined();
    expect(failed.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'text',
          text: expect.any(String),
        }),
      ]),
    );

    await waitForStderrFlush();

    const failureLine = harness.stderrLines.find((line) => line.includes('"event":"mcp.tool_failed"'));
    expect(failureLine).toBeDefined();
    expect(failureLine).toContain('"toolName":"create_review"');
    expect(failureLine).toContain('"phase":"dispatch_failed"');
    expect(failureLine).not.toContain(uniqueLeakSentinel);
  });

  it('reports startup argument failures on stderr without contaminating stdout', () => {
    const run = spawnSync(TSX_PATH, [CLI_PATH, '--busy-timeout-ms', 'nope'], {
      cwd: WORKTREE_ROOT,
      encoding: 'utf8',
      env: buildChildEnv(),
    });

    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
    expect(run.stderr).toContain('"event":"mcp.start_failed"');
    expect(run.stderr).toContain('Invalid value for --busy-timeout-ms: nope. Expected a non-negative integer.');
  });
});

async function createHarness(): Promise<{ client: Client; transport: StdioClientTransport; stderrLines: string[] }> {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-mcp-'));
  tempDirectories.push(directory);

  const stderrLines: string[] = [];
  const transport = new StdioClientTransport({
    command: 'corepack',
    args: [
      'pnpm',
      '--filter',
      'review-broker-server',
      'exec',
      'tsx',
      'src/cli/start-mcp.ts',
      '--db-path',
      path.join(directory, 'broker.sqlite'),
      '--cwd',
      WORKTREE_ROOT,
    ],
    cwd: WORKTREE_ROOT,
    env: buildChildEnv(),
    stderr: 'pipe',
  });

  const stderr = transport.stderr;
  stderr?.setEncoding?.('utf8');
  stderr?.on('data', (chunk) => {
    const text = String(chunk);
    for (const line of text.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        stderrLines.push(trimmed);
      }
    }
  });

  const client = new Client({ name: 'review-broker-test-client', version: '0.1.0' });
  await client.connect(transport);
  openClients.push({ client, transport });

  return { client, transport, stderrLines };
}

function buildChildEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

function readFixture(fileName: string): string {
  return readFileSync(path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'test', 'fixtures', fileName), 'utf8');
}

async function waitForStderrFlush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
}
