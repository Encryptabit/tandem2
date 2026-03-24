import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createInProcessBrokerClient,
  startInProcessBrokerClient,
  type BrokerClient,
} from '../../review-broker-client/src/index.js';
import { inspectBrokerRuntime, startBroker, type BrokerStartupRecoverySnapshot, type StartedBrokerRuntime } from '../src/index.js';
import { createAppContext } from '../src/runtime/app-context.js';
import { createBrokerService } from '../src/runtime/broker-service.js';

const WORKTREE_ROOT = '/home/cari/repos/tandem2/.gsd/worktrees/M001';
const START_BROKER_CLI_PATH = path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'src', 'cli', 'start-broker.ts');
const REVIEWER_FIXTURE_PATH = path.join(
  WORKTREE_ROOT,
  'packages',
  'review-broker-server',
  'test',
  'fixtures',
  'reviewer-worker.mjs',
);
const TSX_PATH = path.join(WORKTREE_ROOT, 'node_modules', '.bin', 'tsx');
const tempDirectories: string[] = [];
const openRuntimes: StartedBrokerRuntime[] = [];
const openStartedClients: Array<ReturnType<typeof startInProcessBrokerClient>> = [];
const openMcpHarnesses: McpHarness[] = [];

afterEach(async () => {
  while (openMcpHarnesses.length > 0) {
    const harness = openMcpHarnesses.pop();

    if (!harness) {
      continue;
    }

    await closeMcpHarness(harness);
  }

  while (openStartedClients.length > 0) {
    const started = openStartedClients.pop();

    if (!started) {
      continue;
    }

    started.close();
    await started.waitUntilStopped().catch(() => undefined);
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

describe('review-broker-server end-to-end standalone parity', () => {
  it('persists one review lifecycle across typed client restart, real stdio MCP reopen, typed reopen, and standalone inspection', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-end-to-end-parity-'));
    tempDirectories.push(directory);

    const dbPath = path.join(directory, 'broker.sqlite');
    const redactionSentinel = 'SECRET_PATCH_BODY_SHOULD_NOT_APPEAR_END_TO_END';
    const diff = buildDiffWithSentinel(redactionSentinel);

    const firstRuntime = startTypedRuntime(dbPath);
    const firstClient = createInProcessBrokerClient(firstRuntime.service);

    const created = await firstClient.createReview({
      title: 'End-to-end standalone parity review',
      description: 'Prove restart-safe lifecycle parity across typed client, stdio MCP, and standalone inspection.',
      diff,
      authorId: 'agent-author',
      priority: 'high',
    });
    await firstClient.claimReview({
      reviewId: created.review.reviewId,
      claimantId: 'reviewer-phase-1',
    });
    await firstClient.addMessage({
      reviewId: created.review.reviewId,
      actorId: 'reviewer-phase-1',
      body: 'Please add the restart-safe acceptance coverage before approval.',
    });
    await firstClient.submitVerdict({
      reviewId: created.review.reviewId,
      actorId: 'reviewer-phase-1',
      verdict: 'changes_requested',
      reason: 'Restart-safe acceptance coverage is still missing.',
    });

    const typedPhaseStatus = await firstClient.getReviewStatus({ reviewId: created.review.reviewId });
    const typedPhaseProposal = await firstClient.getProposal({ reviewId: created.review.reviewId });
    const typedPhaseDiscussion = await firstClient.getDiscussion({ reviewId: created.review.reviewId });
    const typedPhaseActivity = await firstClient.getActivityFeed({ reviewId: created.review.reviewId });

    expect(typedPhaseStatus.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'changes_requested',
      claimedBy: 'reviewer-phase-1',
      currentRound: 1,
      latestVerdict: 'changes_requested',
      verdictReason: 'Restart-safe acceptance coverage is still missing.',
      counterPatchStatus: 'none',
    });
    expect(typedPhaseProposal.proposal).toMatchObject({
      reviewId: created.review.reviewId,
      title: 'End-to-end standalone parity review',
      currentRound: 1,
      latestVerdict: 'changes_requested',
      counterPatchStatus: 'none',
      affectedFiles: ['packages/review-broker-server/src/runtime/_proposal_fixture_valid.ts'],
    });
    expect(typedPhaseDiscussion.messages.map((message) => message.body)).toEqual([
      'Please add the restart-safe acceptance coverage before approval.',
    ]);
    expect(typedPhaseActivity.activity.map((entry) => entry.eventType)).toEqual([
      'review.created',
      'review.claimed',
      'review.submitted',
      'review.message_added',
      'review.changes_requested',
    ]);

    await closeRuntime(firstRuntime);

    const mcpHarness = await createMcpHarness(dbPath);
    await waitForStderrFlush();

    expect(mcpHarness.stderrLines).toEqual(
      expect.arrayContaining([expect.stringMatching(/"event":"mcp.started"/)]),
    );
    expect(mcpHarness.stderrLines.join('\n')).not.toContain(redactionSentinel);

    const mcpPhaseStatus = expectToolSuccess<Awaited<ReturnType<BrokerClient['getReviewStatus']>>>(
      await callMcpTool(mcpHarness.client, 'get_review_status', { reviewId: created.review.reviewId }),
    );
    const mcpPhaseProposal = expectToolSuccess<Awaited<ReturnType<BrokerClient['getProposal']>>>(
      await callMcpTool(mcpHarness.client, 'get_proposal', { reviewId: created.review.reviewId }),
    );
    const mcpPhaseDiscussion = expectToolSuccess<Awaited<ReturnType<BrokerClient['getDiscussion']>>>(
      await callMcpTool(mcpHarness.client, 'get_discussion', { reviewId: created.review.reviewId }),
    );
    const mcpPhaseActivity = expectToolSuccess<Awaited<ReturnType<BrokerClient['getActivityFeed']>>>(
      await callMcpTool(mcpHarness.client, 'get_activity_feed', { reviewId: created.review.reviewId }),
    );

    expect(mcpPhaseStatus.review).toEqual(typedPhaseStatus.review);
    expect(mcpPhaseProposal.proposal).toEqual(typedPhaseProposal.proposal);
    expect(mcpPhaseDiscussion.messages).toEqual(typedPhaseDiscussion.messages);
    expect(mcpPhaseActivity.activity).toEqual(typedPhaseActivity.activity);

    const requeuedByMcp = expectToolSuccess<Awaited<ReturnType<BrokerClient['addMessage']>>>(
      await callMcpTool(mcpHarness.client, 'add_message', {
        reviewId: created.review.reviewId,
        actorId: 'agent-author',
        body: 'Added the restart-safe acceptance coverage and requeued the proposal for another pass.',
      }),
    );
    const claimedByMcp = expectToolSuccess<Awaited<ReturnType<BrokerClient['claimReview']>>>(
      await callMcpTool(mcpHarness.client, 'claim_review', {
        reviewId: created.review.reviewId,
        claimantId: 'reviewer-phase-2',
      }),
    );
    const approvedByMcp = expectToolSuccess<Awaited<ReturnType<BrokerClient['submitVerdict']>>>(
      await callMcpTool(mcpHarness.client, 'submit_verdict', {
        reviewId: created.review.reviewId,
        actorId: 'reviewer-phase-2',
        verdict: 'approved',
        reason: 'Restart-safe parity holds across the reopened MCP runtime.',
      }),
    );
    const closedByMcp = expectToolSuccess<Awaited<ReturnType<BrokerClient['closeReview']>>>(
      await callMcpTool(mcpHarness.client, 'close_review', {
        reviewId: created.review.reviewId,
        actorId: 'reviewer-phase-2',
      }),
    );
    const mcpFinalStatus = expectToolSuccess<Awaited<ReturnType<BrokerClient['getReviewStatus']>>>(
      await callMcpTool(mcpHarness.client, 'get_review_status', { reviewId: created.review.reviewId }),
    );
    const mcpFinalProposal = expectToolSuccess<Awaited<ReturnType<BrokerClient['getProposal']>>>(
      await callMcpTool(mcpHarness.client, 'get_proposal', { reviewId: created.review.reviewId }),
    );
    const mcpFinalDiscussion = expectToolSuccess<Awaited<ReturnType<BrokerClient['getDiscussion']>>>(
      await callMcpTool(mcpHarness.client, 'get_discussion', { reviewId: created.review.reviewId }),
    );
    const mcpFinalActivity = expectToolSuccess<Awaited<ReturnType<BrokerClient['getActivityFeed']>>>(
      await callMcpTool(mcpHarness.client, 'get_activity_feed', { reviewId: created.review.reviewId }),
    );

    expect(requeuedByMcp.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'pending',
      claimedBy: null,
      currentRound: 2,
      latestVerdict: 'changes_requested',
      counterPatchStatus: 'pending',
    });
    expect(claimedByMcp.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'claimed',
      claimedBy: 'reviewer-phase-2',
      currentRound: 2,
    });
    expect(approvedByMcp.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'approved',
      claimedBy: 'reviewer-phase-2',
      currentRound: 2,
      latestVerdict: 'approved',
      verdictReason: 'Restart-safe parity holds across the reopened MCP runtime.',
      counterPatchStatus: 'pending',
    });
    expect(closedByMcp.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'closed',
      currentRound: 2,
      latestVerdict: 'approved',
      verdictReason: 'Restart-safe parity holds across the reopened MCP runtime.',
      counterPatchStatus: 'pending',
    });
    expect(mcpFinalDiscussion.messages.map((message) => message.body)).toEqual([
      'Please add the restart-safe acceptance coverage before approval.',
      'Added the restart-safe acceptance coverage and requeued the proposal for another pass.',
    ]);
    expect(mcpFinalActivity.activity.map((entry) => entry.eventType)).toEqual([
      'review.created',
      'review.claimed',
      'review.submitted',
      'review.message_added',
      'review.changes_requested',
      'review.requeued',
      'review.message_added',
      'review.claimed',
      'review.submitted',
      'review.approved',
      'review.closed',
    ]);

    await closeMcpHarness(mcpHarness);

    const reopened = startInProcessBrokerClient({
      cwd: WORKTREE_ROOT,
      dbPath,
      handleSignals: false,
    });
    openStartedClients.push(reopened);

    const reopenedStatus = await reopened.client.getReviewStatus({ reviewId: created.review.reviewId });
    const reopenedProposal = await reopened.client.getProposal({ reviewId: created.review.reviewId });
    const reopenedDiscussion = await reopened.client.getDiscussion({ reviewId: created.review.reviewId });
    const reopenedActivity = await reopened.client.getActivityFeed({ reviewId: created.review.reviewId });
    const reopenedSnapshot = inspectBrokerRuntime(reopened.runtime.context);

    expect(reopenedStatus.review).toEqual(mcpFinalStatus.review);
    expect(reopenedProposal.proposal).toEqual(mcpFinalProposal.proposal);
    expect(reopenedDiscussion.messages).toEqual(mcpFinalDiscussion.messages);
    expect(reopenedActivity.activity).toEqual(mcpFinalActivity.activity);
    expect(reopenedSnapshot).toMatchObject({
      reviewCount: 1,
      reviewerCount: 0,
      trackedReviewerCount: 0,
      reviewerStatusCounts: {},
      messageCount: 2,
      auditEventCount: 11,
      migrationCount: 3,
      statusCounts: {
        closed: 1,
      },
      counterPatchStatusCounts: {
        pending: 1,
      },
      latestReview: {
        reviewId: created.review.reviewId,
        status: 'closed',
        currentRound: 2,
        latestVerdict: 'approved',
        verdictReason: 'Restart-safe parity holds across the reopened MCP runtime.',
        counterPatchStatus: 'pending',
        lastMessageAt: expect.any(String),
        lastActivityAt: expect.any(String),
      },
      latestReviewer: null,
      latestMessage: {
        reviewId: created.review.reviewId,
        actorId: 'agent-author',
        authorRole: 'proposer',
        createdAt: expect.any(String),
      },
      latestAuditEvent: {
        reviewId: created.review.reviewId,
        eventType: 'review.closed',
        errorCode: null,
        summary: 'Review closed after approval.',
        metadata: {
          reviewId: created.review.reviewId,
          summary: 'Review closed after approval.',
        },
        createdAt: expect.any(String),
      },
    });

    await closeStartedClient(reopened);

    const onceRun = runStandaloneInspection(dbPath);
    expect(onceRun.status).toBe(0);
    expect(onceRun.stderr).toBe('');
    expect(onceRun.stdout).not.toContain(redactionSentinel);

    const onceEvents = parseJsonLines(onceRun.stdout);
    expect(onceEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'broker.started',
          mode: 'once',
          dbPath: path.resolve(dbPath),
          migrations: ['001_init', '002_review_lifecycle_parity', '003_reviewer_lifecycle'],
          startupRecovery: {
            completedAt: expect.any(String),
            recoveredReviewerIds: [],
            reclaimedReviewIds: [],
            staleReviewIds: [],
            unrecoverableReviewIds: [],
            reviewers: [],
          },
        }),
        expect.objectContaining({
          event: 'broker.once_complete',
          dbPath: path.resolve(dbPath),
          reviewCount: 1,
          reviewerCount: 0,
          trackedReviewerCount: 0,
          reviewerStatusCounts: {},
          messageCount: 2,
          auditEventCount: 11,
          migrationCount: 3,
          statusCounts: {
            closed: 1,
          },
          counterPatchStatusCounts: {
            pending: 1,
          },
          latestReview: {
            reviewId: created.review.reviewId,
            status: 'closed',
            currentRound: 2,
            latestVerdict: 'approved',
            verdictReason: 'Restart-safe parity holds across the reopened MCP runtime.',
            counterPatchStatus: 'pending',
            lastMessageAt: expect.any(String),
            lastActivityAt: expect.any(String),
          },
          latestReviewer: null,
          latestMessage: {
            reviewId: created.review.reviewId,
            actorId: 'agent-author',
            authorRole: 'proposer',
            createdAt: expect.any(String),
          },
          latestAuditEvent: {
            reviewId: created.review.reviewId,
            eventType: 'review.closed',
            errorCode: null,
            summary: 'Review closed after approval.',
            metadata: {
              reviewId: created.review.reviewId,
              summary: 'Review closed after approval.',
            },
            createdAt: expect.any(String),
          },
          startupRecovery: {
            completedAt: expect.any(String),
            recoveredReviewerIds: [],
            reclaimedReviewIds: [],
            staleReviewIds: [],
            unrecoverableReviewIds: [],
            reviewers: [],
          },
        }),
      ]),
    );
  });

  it('proves startup recovery parity across standalone inspection, real stdio MCP reopen, and typed-client reads', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-end-to-end-recovery-'));
    tempDirectories.push(directory);

    const dbPath = path.join(directory, 'broker.sqlite');
    const redactionSentinel = 'SECRET_PATCH_BODY_SHOULD_NOT_APPEAR_STARTUP_RECOVERY';
    const seeded = await seedStartupRecoveryParityState(dbPath, redactionSentinel);

    const onceRun = runStandaloneInspection(dbPath);
    expect(onceRun.status).toBe(0);
    expect(onceRun.stderr).toBe('');
    expect(onceRun.stdout).not.toContain(redactionSentinel);

    const onceEvents = parseJsonLines(onceRun.stdout);
    const startedEvent = findEvent(onceEvents, 'broker.started');
    const completedEvent = findEvent(onceEvents, 'broker.once_complete');

    expect(startedEvent).toMatchObject({
      mode: 'once',
      dbPath: path.resolve(dbPath),
      migrations: ['001_init', '002_review_lifecycle_parity', '003_reviewer_lifecycle'],
    });
    expectStartupRecoverySnapshot(startedEvent.startupRecovery as BrokerStartupRecoverySnapshot, seeded);
    expect(completedEvent).toMatchObject({
      dbPath: path.resolve(dbPath),
      reviewCount: 3,
      reviewerCount: 1,
      trackedReviewerCount: 0,
      reviewerStatusCounts: {
        offline: 1,
      },
      messageCount: 1,
      auditEventCount: 14,
      migrationCount: 3,
      statusCounts: {
        approved: 1,
        pending: 2,
      },
      counterPatchStatusCounts: {
        none: 3,
      },
      latestReviewer: {
        reviewerId: seeded.reviewerId,
        status: 'offline',
        currentReviewId: null,
        command: path.basename(process.execPath),
        args: ['packages/review-broker-server/test/fixtures/reviewer-worker.mjs'],
        cwd: 'packages/review-broker-server',
        pid: null,
        offlineReason: 'startup_recovery',
      },
      latestMessage: {
        reviewId: seeded.submittedReviewId,
        actorId: seeded.reviewerId,
        authorRole: 'reviewer',
        createdAt: '2026-03-20T19:05:00.000Z',
      },
      latestAuditEvent: {
        reviewId: expect.anything(),
        eventType: expect.stringMatching(/^(review\.reclaimed|reviewer\.offline)$/),
        errorCode: null,
        summary: expect.any(String),
        metadata: {
          reviewerId: seeded.reviewerId,
        },
        createdAt: expect.any(String),
      },
    });
    expectStartupRecoverySnapshot(completedEvent.startupRecovery as BrokerStartupRecoverySnapshot, seeded);

    const mcpHarness = await createMcpHarness(dbPath);
    await waitForStderrFlush();

    expect(mcpHarness.stderrLines.join('\n')).not.toContain(redactionSentinel);

    const mcpStartedEvent = parseJsonLine(
      mcpHarness.stderrLines.find((line) => line.includes('"event":"mcp.started"')) ?? '{}',
    );
    expect(mcpStartedEvent).toMatchObject({
      event: 'mcp.started',
      dbPath: path.resolve(dbPath),
      transport: 'stdio',
      startupRecovery: {
        completedAt: expect.any(String),
        recoveredReviewerIds: [],
        reclaimedReviewIds: [],
        staleReviewIds: [],
        unrecoverableReviewIds: [],
        reviewers: [],
      },
    });

    const mcpReviewers = expectToolSuccess<Awaited<ReturnType<BrokerClient['listReviewers']>>>(
      await callMcpTool(mcpHarness.client, 'list_reviewers', {}),
    );
    const mcpClaimedStatus = expectToolSuccess<Awaited<ReturnType<BrokerClient['getReviewStatus']>>>(
      await callMcpTool(mcpHarness.client, 'get_review_status', { reviewId: seeded.claimedReviewId }),
    );
    const mcpSubmittedStatus = expectToolSuccess<Awaited<ReturnType<BrokerClient['getReviewStatus']>>>(
      await callMcpTool(mcpHarness.client, 'get_review_status', { reviewId: seeded.submittedReviewId }),
    );
    const mcpApprovedStatus = expectToolSuccess<Awaited<ReturnType<BrokerClient['getReviewStatus']>>>(
      await callMcpTool(mcpHarness.client, 'get_review_status', { reviewId: seeded.approvedReviewId }),
    );
    const mcpClaimedActivity = expectToolSuccess<Awaited<ReturnType<BrokerClient['getActivityFeed']>>>(
      await callMcpTool(mcpHarness.client, 'get_activity_feed', { reviewId: seeded.claimedReviewId }),
    );
    const mcpSubmittedActivity = expectToolSuccess<Awaited<ReturnType<BrokerClient['getActivityFeed']>>>(
      await callMcpTool(mcpHarness.client, 'get_activity_feed', { reviewId: seeded.submittedReviewId }),
    );
    const mcpApprovedActivity = expectToolSuccess<Awaited<ReturnType<BrokerClient['getActivityFeed']>>>(
      await callMcpTool(mcpHarness.client, 'get_activity_feed', { reviewId: seeded.approvedReviewId }),
    );

    expect(mcpReviewers.reviewers).toEqual([
      expect.objectContaining({
        reviewerId: seeded.reviewerId,
        status: 'offline',
        currentReviewId: null,
        pid: null,
        offlineReason: 'startup_recovery',
      }),
    ]);
    expect(mcpClaimedStatus.review).toMatchObject({
      reviewId: seeded.claimedReviewId,
      status: 'pending',
      claimedBy: null,
      claimedAt: null,
      claimGeneration: 2,
      latestVerdict: null,
      counterPatchStatus: 'none',
    });
    expect(mcpSubmittedStatus.review).toMatchObject({
      reviewId: seeded.submittedReviewId,
      status: 'pending',
      claimedBy: null,
      claimedAt: null,
      claimGeneration: 2,
      latestVerdict: null,
      counterPatchStatus: 'none',
      lastMessageAt: '2026-03-20T19:05:00.000Z',
    });
    expect(mcpApprovedStatus.review).toMatchObject({
      reviewId: seeded.approvedReviewId,
      status: 'approved',
      claimedBy: seeded.reviewerId,
      claimGeneration: 1,
      latestVerdict: 'approved',
      verdictReason: 'Approved before the startup recovery acceptance proof.',
      counterPatchStatus: 'none',
    });
    expect(mcpClaimedActivity.activity.map((entry) => entry.eventType)).toEqual([
      'review.created',
      'review.claimed',
      'review.reclaimed',
    ]);
    expect(mcpSubmittedActivity.activity.map((entry) => entry.eventType)).toEqual([
      'review.created',
      'review.claimed',
      'review.submitted',
      'review.message_added',
      'review.reclaimed',
    ]);
    expect(mcpApprovedActivity.activity.map((entry) => entry.eventType)).toEqual([
      'review.created',
      'review.claimed',
      'review.submitted',
      'review.approved',
    ]);
    expect(mcpClaimedActivity.activity.at(-1)).toMatchObject({
      eventType: 'review.reclaimed',
      statusFrom: 'claimed',
      metadata: {
        reviewId: seeded.claimedReviewId,
        reviewerId: seeded.reviewerId,
        reclaimCause: 'startup_recovery',
      },
    });
    expect(mcpSubmittedActivity.activity.at(-1)).toMatchObject({
      eventType: 'review.reclaimed',
      statusFrom: 'submitted',
      metadata: {
        reviewId: seeded.submittedReviewId,
        reviewerId: seeded.reviewerId,
        reclaimCause: 'startup_recovery',
      },
    });
    expect(mcpApprovedActivity.activity.at(-1)).toMatchObject({
      eventType: 'review.approved',
    });

    await closeMcpHarness(mcpHarness);

    const reopened = startInProcessBrokerClient({
      cwd: WORKTREE_ROOT,
      dbPath,
      handleSignals: false,
    });
    openStartedClients.push(reopened);

    const reopenedReviewers = await reopened.client.listReviewers({});
    const reopenedClaimedStatus = await reopened.client.getReviewStatus({ reviewId: seeded.claimedReviewId });
    const reopenedSubmittedStatus = await reopened.client.getReviewStatus({ reviewId: seeded.submittedReviewId });
    const reopenedApprovedStatus = await reopened.client.getReviewStatus({ reviewId: seeded.approvedReviewId });
    const reopenedClaimedActivity = await reopened.client.getActivityFeed({ reviewId: seeded.claimedReviewId });
    const reopenedSubmittedActivity = await reopened.client.getActivityFeed({ reviewId: seeded.submittedReviewId });
    const reopenedApprovedActivity = await reopened.client.getActivityFeed({ reviewId: seeded.approvedReviewId });
    const reopenedSnapshot = inspectBrokerRuntime(reopened.runtime.context);

    expect(reopenedReviewers.reviewers).toEqual(mcpReviewers.reviewers);
    expect(reopenedClaimedStatus.review).toEqual(mcpClaimedStatus.review);
    expect(reopenedSubmittedStatus.review).toEqual(mcpSubmittedStatus.review);
    expect(reopenedApprovedStatus.review).toEqual(mcpApprovedStatus.review);
    expect(reopenedClaimedActivity.activity).toEqual(mcpClaimedActivity.activity);
    expect(reopenedSubmittedActivity.activity).toEqual(mcpSubmittedActivity.activity);
    expect(reopenedApprovedActivity.activity).toEqual(mcpApprovedActivity.activity);
    expect(reopenedSnapshot).toMatchObject({
      reviewCount: 3,
      reviewerCount: 1,
      trackedReviewerCount: 0,
      reviewerStatusCounts: {
        offline: 1,
      },
      messageCount: 1,
      auditEventCount: 14,
      migrationCount: 3,
      statusCounts: {
        approved: 1,
        pending: 2,
      },
      counterPatchStatusCounts: {
        none: 3,
      },
      latestReviewer: {
        reviewerId: seeded.reviewerId,
        status: 'offline',
        currentReviewId: null,
        command: path.basename(process.execPath),
        args: ['packages/review-broker-server/test/fixtures/reviewer-worker.mjs'],
        cwd: 'packages/review-broker-server',
        pid: null,
        offlineReason: 'startup_recovery',
      },
      latestMessage: {
        reviewId: seeded.submittedReviewId,
        actorId: seeded.reviewerId,
        authorRole: 'reviewer',
        createdAt: '2026-03-20T19:05:00.000Z',
      },
      latestAuditEvent: {
        reviewId: expect.anything(),
        eventType: expect.stringMatching(/^(review\.reclaimed|reviewer\.offline)$/),
        errorCode: null,
        summary: expect.any(String),
        metadata: {
          reviewerId: seeded.reviewerId,
        },
        createdAt: expect.any(String),
      },
    });

    await closeStartedClient(reopened);
  });
});

function startTypedRuntime(dbPath: string): StartedBrokerRuntime {
  const runtime = startBroker({
    cwd: WORKTREE_ROOT,
    dbPath,
    handleSignals: false,
  });
  openRuntimes.push(runtime);
  return runtime;
}

async function closeRuntime(runtime: StartedBrokerRuntime): Promise<void> {
  runtime.close();
  await runtime.waitUntilStopped();
  removeFromArray(openRuntimes, runtime);
}

async function closeStartedClient(started: ReturnType<typeof startInProcessBrokerClient>): Promise<void> {
  started.close();
  await started.waitUntilStopped();
  removeFromArray(openStartedClients, started);
}

async function createMcpHarness(dbPath: string): Promise<McpHarness> {
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
      dbPath,
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

  const client = new Client({ name: 'review-broker-end-to-end-client', version: '0.1.0' });
  await client.connect(transport);

  const harness = { client, transport, stderrLines };
  openMcpHarnesses.push(harness);
  return harness;
}

async function closeMcpHarness(harness: McpHarness): Promise<void> {
  await harness.client.close().catch(() => undefined);
  await harness.transport.close().catch(() => undefined);
  removeFromArray(openMcpHarnesses, harness);
}

function runStandaloneInspection(dbPath: string): ReturnType<typeof spawnSync> {
  return spawnSync(TSX_PATH, [START_BROKER_CLI_PATH, '--db-path', dbPath, '--once'], {
    cwd: WORKTREE_ROOT,
    encoding: 'utf8',
    env: buildChildEnv(),
  });
}

async function callMcpTool(client: Client, name: string, arguments_: Record<string, unknown>) {
  return client.callTool({ name, arguments: arguments_ });
}

function expectToolSuccess<TStructuredContent>(result: Awaited<ReturnType<Client['callTool']>>): TStructuredContent {
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toBeDefined();
  return result.structuredContent as TStructuredContent;
}

function buildDiffWithSentinel(redactionSentinel: string): string {
  return readFixture('valid-review.diff').replace("proposalFixture = 'valid'", `proposalFixture = '${redactionSentinel}'`);
}

async function seedStartupRecoveryParityState(
  dbPath: string,
  redactionSentinel: string,
): Promise<{
  reviewerId: string;
  claimedReviewId: string;
  submittedReviewId: string;
  approvedReviewId: string;
}> {
  const reviewerId = 'parity-reviewer-1';
  const context = createAppContext({
    cwd: WORKTREE_ROOT,
    dbPath,
  });
  const service = createBrokerService(context, {
    now: createNow([
      '2026-03-20T19:00:00.000Z',
      '2026-03-20T19:01:00.000Z',
      '2026-03-20T19:02:00.000Z',
      '2026-03-20T19:03:00.000Z',
      '2026-03-20T19:04:00.000Z',
      '2026-03-20T19:05:00.000Z',
      '2026-03-20T19:06:00.000Z',
      '2026-03-20T19:07:00.000Z',
    ]),
  });

  try {
    await service.spawnReviewer({
      reviewerId,
      command: process.execPath,
      args: [REVIEWER_FIXTURE_PATH],
      cwd: 'packages/review-broker-server',
    });

    const diff = buildDiffWithSentinel(redactionSentinel);
    const claimed = await service.createReview({
      title: 'Startup recovery claimed review',
      description: 'Claimed reviews should be reclaimed during the standalone parity recovery phase.',
      diff,
      authorId: 'agent-author',
      priority: 'high',
    });
    const submitted = await service.createReview({
      title: 'Startup recovery submitted review',
      description: 'Submitted reviews should also be reclaimed during the standalone parity recovery phase.',
      diff,
      authorId: 'agent-author',
      priority: 'urgent',
    });
    const approved = await service.createReview({
      title: 'Startup recovery approved review',
      description: 'Approved reviews should remain approved after startup recovery.',
      diff,
      authorId: 'agent-author',
      priority: 'normal',
    });

    await service.claimReview({
      reviewId: claimed.review.reviewId,
      claimantId: reviewerId,
    });
    await service.claimReview({
      reviewId: submitted.review.reviewId,
      claimantId: reviewerId,
    });
    await service.addMessage({
      reviewId: submitted.review.reviewId,
      actorId: reviewerId,
      body: 'Submitted before simulating the standalone startup recovery phase.',
    });
    await service.claimReview({
      reviewId: approved.review.reviewId,
      claimantId: reviewerId,
    });
    await service.submitVerdict({
      reviewId: approved.review.reviewId,
      actorId: reviewerId,
      verdict: 'approved',
      reason: 'Approved before the startup recovery acceptance proof.',
    });

    context.close();

    return {
      reviewerId,
      claimedReviewId: claimed.review.reviewId,
      submittedReviewId: submitted.review.reviewId,
      approvedReviewId: approved.review.reviewId,
    };
  } catch (error) {
    context.close();
    throw error;
  }
}

function expectStartupRecoverySnapshot(
  snapshot: BrokerStartupRecoverySnapshot,
  seeded: {
    reviewerId: string;
    claimedReviewId: string;
    submittedReviewId: string;
  },
): void {
  expect(snapshot.completedAt).toEqual(expect.any(String));
  expect(snapshot.recoveredReviewerIds).toEqual([seeded.reviewerId]);
  expect(sortStrings(snapshot.reclaimedReviewIds)).toEqual(sortStrings([seeded.claimedReviewId, seeded.submittedReviewId]));
  expect(snapshot.staleReviewIds).toEqual([]);
  expect(snapshot.unrecoverableReviewIds).toEqual([]);
  expect(snapshot.reviewers).toEqual([
    {
      reviewerId: seeded.reviewerId,
      reclaimedReviewIds: sortStrings([seeded.claimedReviewId, seeded.submittedReviewId]),
      staleReviewIds: [],
      unrecoverableReviewIds: [],
    },
  ]);
}

function createNow(timestamps: string[]): () => string {
  const queue = [...timestamps];
  return () => queue.shift() ?? new Date().toISOString();
}

function findEvent(events: Array<Record<string, unknown>>, eventName: string): Record<string, unknown> {
  const event = events.find((candidate) => candidate.event === eventName);
  expect(event).toBeDefined();
  return event!;
}

function parseJsonLine(line: string): Record<string, unknown> {
  return JSON.parse(line) as Record<string, unknown>;
}

function sortStrings(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function readFixture(fileName: string): string {
  return readFileSync(path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'test', 'fixtures', fileName), 'utf8');
}

function parseJsonLines(output: string): Array<Record<string, unknown>> {
  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function buildChildEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

async function waitForStderrFlush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

function removeFromArray<TValue>(items: TValue[], value: TValue): void {
  const index = items.indexOf(value);

  if (index >= 0) {
    items.splice(index, 1);
  }
}

interface McpHarness {
  client: Client;
  transport: StdioClientTransport;
  stderrLines: string[];
}
