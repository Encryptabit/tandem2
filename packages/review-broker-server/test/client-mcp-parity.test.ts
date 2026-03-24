import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';

import { createInProcessBrokerClient, type BrokerClient } from '../../review-broker-client/src/index.js';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { StartedBrokerRuntime } from '../src/index.js';
import { createBrokerMcpServer, startBroker } from '../src/index.js';

const WORKTREE_ROOT = '/home/cari/repos/tandem2/.gsd/worktrees/M001';
const REVIEWER_FIXTURE_PATH = path.join(
  WORKTREE_ROOT,
  'packages',
  'review-broker-server',
  'test',
  'fixtures',
  'reviewer-worker.mjs',
);
const tempDirectories: string[] = [];
const openRuntimes: StartedBrokerRuntime[] = [];
const openMcpConnections: Array<{ client: Client; server: McpServer }> = [];

afterEach(async () => {
  while (openMcpConnections.length > 0) {
    const handle = openMcpConnections.pop();

    if (!handle) {
      continue;
    }

    await handle.client.close().catch(() => undefined);
    await handle.server.close().catch(() => undefined);
  }

  while (openRuntimes.length > 0) {
    const runtime = openRuntimes.pop();

    if (!runtime) {
      continue;
    }

    runtime.close();
    await runtime.waitUntilStopped().catch(() => undefined);
  }

  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();

    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe('review broker typed-client and MCP parity', () => {
  it('proves both surfaces share one broker state model, preserve wait semantics, and expose matching reviewer/audit vocabulary', async () => {
    const runtime = startHarness();
    const typedClient = createInProcessBrokerClient(runtime.service);
    const mcpClient = await createMcpHarness(runtime.service);

    const initialReviewerList = expectToolSuccess<{ reviewers: unknown[]; version: number }>(
      await mcpClient.listReviewers({}),
    );
    expect(initialReviewerList).toEqual({ reviewers: [], version: 0 });

    const waitedForReviewer = mcpClient.listReviewers({
      wait: true,
      sinceVersion: initialReviewerList.version,
      timeoutMs: 500,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    const spawnedByClient = await typedClient.spawnReviewer({
      reviewerId: 'reviewer-shared-1',
      command: process.execPath,
      args: [REVIEWER_FIXTURE_PATH],
      cwd: 'packages/review-broker-server',
    });
    const waitedReviewerList = expectToolSuccess<{ reviewers: unknown[]; version: number }>(await waitedForReviewer);

    expect(waitedReviewerList).toEqual({
      reviewers: [spawnedByClient.reviewer],
      version: spawnedByClient.version,
    });

    const initialReviews = await typedClient.listReviews({});
    expect(initialReviews).toEqual({ reviews: [], version: 0 });

    const waitedForReviewFromMcp = mcpClient.listReviews({
      wait: true,
      sinceVersion: initialReviews.version,
      timeoutMs: 500,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    const createdByClient = await typedClient.createReview({
      title: 'Client authored parity review',
      description: 'The typed client writes broker state that MCP should read back immediately.',
      diff: readFixture('valid-review.diff'),
      authorId: 'agent-author',
      priority: 'high',
    });
    const waitedReviewList = expectToolSuccess<{ reviews: unknown[]; version: number }>(await waitedForReviewFromMcp);

    expect(waitedReviewList).toEqual({
      reviews: [createdByClient.review],
      version: createdByClient.version,
    });

    const createdByMcp = expectToolSuccess<{
      review: Awaited<ReturnType<BrokerClient['createReview']>>['review'];
      proposal: Awaited<ReturnType<BrokerClient['createReview']>>['proposal'];
      version: number;
    }>(
      await mcpClient.createReview({
        title: 'MCP authored parity review',
        description: 'The MCP surface writes broker state that the typed client should observe.',
        diff: readFixture('valid-review.diff'),
        authorId: 'agent-author',
        priority: 'urgent',
      }),
    );

    const createdByMcpStatusFromClient = await typedClient.getReviewStatus({ reviewId: createdByMcp.review.reviewId });
    const createdByMcpProposalFromClient = await typedClient.getProposal({ reviewId: createdByMcp.review.reviewId });

    expect(createdByMcpStatusFromClient.review).toEqual(createdByMcp.review);
    expect(createdByMcpProposalFromClient.proposal).toEqual(createdByMcp.proposal);

    const claimedByClient = await typedClient.claimReview({
      reviewId: createdByMcp.review.reviewId,
      claimantId: 'reviewer-shared-1',
    });
    expect(claimedByClient).toMatchObject({
      outcome: 'claimed',
      review: {
        reviewId: createdByMcp.review.reviewId,
        status: 'claimed',
        claimedBy: 'reviewer-shared-1',
      },
    });

    const claimedStatus = await typedClient.getReviewStatus({ reviewId: createdByMcp.review.reviewId });
    const waitedForSubmittedStatus = typedClient.getReviewStatus({
      reviewId: createdByMcp.review.reviewId,
      wait: true,
      sinceVersion: claimedStatus.version,
      timeoutMs: 500,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    const messageAddedByMcp = expectToolSuccess<Awaited<ReturnType<BrokerClient['addMessage']>>>(
      await mcpClient.addMessage({
        reviewId: createdByMcp.review.reviewId,
        actorId: 'reviewer-shared-1',
        body: 'Submitting the broker review through the MCP surface for parity verification.',
      }),
    );
    const submittedStatusFromClient = await waitedForSubmittedStatus;

    expect(messageAddedByMcp.review).toMatchObject({
      reviewId: createdByMcp.review.reviewId,
      status: 'submitted',
      claimedBy: 'reviewer-shared-1',
      lastMessageAt: expect.any(String),
      lastActivityAt: expect.any(String),
    });
    expect(submittedStatusFromClient.review).toEqual(messageAddedByMcp.review);
    expect(submittedStatusFromClient.review.lastMessageAt).toBe(messageAddedByMcp.message.createdAt);

    const killedByMcp = expectToolSuccess<Awaited<ReturnType<BrokerClient['killReviewer']>>>(
      await mcpClient.killReviewer({ reviewerId: 'reviewer-shared-1' }),
    );
    const offlineReviewersFromClient = await typedClient.listReviewers({ status: 'offline' });
    const offlineReviewersFromMcp = expectToolSuccess<Awaited<ReturnType<BrokerClient['listReviewers']>>>(
      await mcpClient.listReviewers({ status: 'offline' }),
    );
    const requeuedStatusFromClient = await typedClient.getReviewStatus({ reviewId: createdByMcp.review.reviewId });
    const activityFromClient = await typedClient.getActivityFeed({ reviewId: createdByMcp.review.reviewId });
    const activityFromMcp = expectToolSuccess<Awaited<ReturnType<BrokerClient['getActivityFeed']>>>(
      await mcpClient.getActivityFeed({ reviewId: createdByMcp.review.reviewId }),
    );

    expect(killedByMcp).toMatchObject({
      outcome: 'killed',
      message: 'Reviewer reviewer-shared-1 received a shutdown signal.',
      reviewer: {
        reviewerId: 'reviewer-shared-1',
        status: 'offline',
        currentReviewId: null,
        offlineReason: 'operator_kill',
      },
    });
    expect(offlineReviewersFromClient).toEqual(offlineReviewersFromMcp);
    expect(offlineReviewersFromClient.reviewers).toEqual([
      expect.objectContaining({
        reviewerId: 'reviewer-shared-1',
        status: 'offline',
        currentReviewId: null,
        offlineReason: 'operator_kill',
      }),
    ]);
    expect(requeuedStatusFromClient.review).toMatchObject({
      reviewId: createdByMcp.review.reviewId,
      status: 'pending',
      claimedBy: null,
      claimGeneration: 2,
      latestVerdict: null,
    });
    expect(activityFromMcp).toEqual(activityFromClient);
    expect(activityFromClient.activity.map((entry) => entry.eventType)).toEqual([
      'review.created',
      'review.claimed',
      'review.submitted',
      'review.message_added',
      'review.reclaimed',
    ]);
    expect(activityFromClient.activity.at(-1)).toMatchObject({
      eventType: 'review.reclaimed',
      metadata: {
        reviewId: createdByMcp.review.reviewId,
        reviewerId: 'reviewer-shared-1',
        reclaimCause: 'operator_kill',
      },
    });
  });
});

function startHarness(): StartedBrokerRuntime {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-client-mcp-parity-'));
  tempDirectories.push(directory);

  const runtime = startBroker({
    cwd: WORKTREE_ROOT,
    dbPath: path.join(directory, 'broker.sqlite'),
    handleSignals: false,
  });
  openRuntimes.push(runtime);

  return runtime;
}

async function createMcpHarness(service: StartedBrokerRuntime['service']): Promise<BrokerMcpClient> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createBrokerMcpServer({ service });
  const client = new Client({ name: 'review-broker-parity-client', version: '0.1.0' });

  await server.connect(serverTransport);
  await client.connect(clientTransport);
  openMcpConnections.push({ client, server });

  return createBrokerMcpClient(client);
}

function createBrokerMcpClient(client: Client) {
  return {
    listReviews: (arguments_: Record<string, unknown>) => client.callTool({ name: 'list_reviews', arguments: arguments_ }),
    createReview: (arguments_: Record<string, unknown>) => client.callTool({ name: 'create_review', arguments: arguments_ }),
    listReviewers: (arguments_: Record<string, unknown>) => client.callTool({ name: 'list_reviewers', arguments: arguments_ }),
    addMessage: (arguments_: Record<string, unknown>) => client.callTool({ name: 'add_message', arguments: arguments_ }),
    killReviewer: (arguments_: Record<string, unknown>) => client.callTool({ name: 'kill_reviewer', arguments: arguments_ }),
    getActivityFeed: (arguments_: Record<string, unknown>) =>
      client.callTool({ name: 'get_activity_feed', arguments: arguments_ }),
  };
}

type BrokerMcpClient = ReturnType<typeof createBrokerMcpClient>;

function expectToolSuccess<TStructuredContent>(result: Awaited<ReturnType<Client['callTool']>>): TStructuredContent {
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toBeDefined();
  return result.structuredContent as TStructuredContent;
}

function readFixture(fileName: string): string {
  return readFileSync(path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'test', 'fixtures', fileName), 'utf8');
}
