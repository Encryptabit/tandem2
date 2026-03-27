import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ZERO_USAGE } from '@gsd/pi-agent-core';
import type { StreamFn } from '@gsd/pi-agent-core';
import { AssistantMessageEventStream } from '@gsd/pi-ai';
import type { AssistantMessage, Context } from '@gsd/pi-ai';

import type { AppContext } from '../src/runtime/app-context.js';
import { createAppContext } from '../src/runtime/app-context.js';
import { createBrokerService } from '../src/runtime/broker-service.js';
import { createReviewerAgent } from '../src/agent/reviewer-agent.js';
import { createReviewerAgentTools } from '../src/agent/reviewer-tools.js';
import { WORKTREE_ROOT } from './test-paths.js';

// ── Harness ─────────────────────────────────────────────────────────────────

const tempDirectories: string[] = [];
const openContexts: AppContext[] = [];

afterEach(() => {
  while (openContexts.length > 0) {
    openContexts.pop()?.close();
  }
  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

function createHarness() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'reviewer-agent-'));
  tempDirectories.push(directory);

  const context = createAppContext({
    cwd: WORKTREE_ROOT,
    dbPath: path.join(directory, 'broker.sqlite'),
  });
  openContexts.push(context);

  return {
    context,
    service: createBrokerService(context),
  };
}

function readFixture(fileName: string): string {
  return readFileSync(
    path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'test', 'fixtures', fileName),
    'utf8',
  );
}

// ── Mock stream helpers ─────────────────────────────────────────────────────

function makeAssistantMessage(
  content: AssistantMessage['content'],
  stopReason: AssistantMessage['stopReason'] = 'toolUse',
): AssistantMessage {
  return {
    role: 'assistant',
    content,
    api: 'anthropic-messages',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    usage: ZERO_USAGE,
    stopReason,
    timestamp: Date.now(),
  };
}

function makeToolCall(id: string, name: string, args: Record<string, any>) {
  return { type: 'toolCall' as const, id, name, arguments: args };
}

/**
 * Build a mock streamFn that scripts a multi-turn tool-call sequence.
 *
 * The function inspects `context.messages` to determine which turn it's on
 * by counting `toolResult` messages. It then returns the appropriate scripted
 * assistant response for that turn.
 */
function createMockStreamFn(reviewId: string): StreamFn {
  let callCount = 0;

  return (_model, context: Context, _options?) => {
    // Count toolResult messages to determine turn number
    const toolResults = context.messages.filter((m) => m.role === 'toolResult');
    const turn = toolResults.length; // 0-based: 0 = first turn, 1 = after first tool result, etc.

    callCount++;
    let message: AssistantMessage;

    switch (turn) {
      case 0:
        // Turn 1: List pending reviews
        message = makeAssistantMessage([
          makeToolCall(`call_${callCount}`, 'list_reviews', { status: 'pending' }),
        ]);
        break;

      case 1:
        // Turn 2: Claim the review (extract reviewId from list_reviews result)
        message = makeAssistantMessage([
          makeToolCall(`call_${callCount}`, 'claim_review', { reviewId }),
        ]);
        break;

      case 2:
        // Turn 3: Read the proposal
        message = makeAssistantMessage([
          makeToolCall(`call_${callCount}`, 'get_proposal', { reviewId }),
        ]);
        break;

      case 3:
        // Turn 4: Submit verdict
        message = makeAssistantMessage([
          makeToolCall(`call_${callCount}`, 'submit_verdict', {
            reviewId,
            verdict: 'approved',
            reason: 'Code changes are correct and well-structured. The implementation follows established patterns and introduces no regressions.',
          }),
        ]);
        break;

      default:
        // Turn 5+: End the loop with a text-only message
        message = makeAssistantMessage(
          [{ type: 'text', text: 'Review complete. The changes have been approved.' }],
          'stop',
        );
        break;
    }

    // Return an AssistantMessageEventStream that immediately resolves
    const stream = new AssistantMessageEventStream();
    // Push start event with the message as partial
    queueMicrotask(() => {
      stream.push({ type: 'start', partial: message });
      stream.push({ type: 'done', reason: message.stopReason === 'stop' ? 'stop' : 'toolUse', message });
    });
    return stream;
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('reviewer agent integration', () => {
  it('agent claims a review, reads proposal, and submits verdict via mock stream', async () => {
    const harness = createHarness();
    const validDiff = readFixture('valid-review.diff');
    const reviewerId = 'test-reviewer-agent';

    // 1. Create a review in the broker
    const created = await harness.service.createReview({
      title: 'Agent integration test review',
      description: 'Verify the full agent review lifecycle.',
      diff: validDiff,
      authorId: 'test-author',
      priority: 'high',
    });
    const reviewId = created.review.reviewId;

    // 2. Build mock streamFn that scripts the multi-turn tool sequence
    const mockStreamFn = createMockStreamFn(reviewId);

    // 3. Create the reviewer agent with the mock stream
    const agent = createReviewerAgent({
      brokerService: harness.service,
      reviewerId,
      streamFn: mockStreamFn,
    });

    // 4. Collect agent events for observability verification
    const events: { type: string; toolName?: string }[] = [];
    agent.subscribe((e) => {
      events.push({
        type: e.type,
        toolName: 'toolName' in e ? e.toolName : undefined,
      });
    });

    // 5. Run the agent
    await agent.prompt('Review the next pending review.');

    // 6. Verify database state — review ends in 'approved' status after verdict
    const finalStatus = await harness.service.getReviewStatus({ reviewId });
    expect(finalStatus.review.status).toBe('approved');
    expect(finalStatus.review.latestVerdict).toBe('approved');
    expect(finalStatus.review.claimedBy).toBe(reviewerId);
    expect(finalStatus.review.verdictReason).toContain('Code changes are correct');

    // 7. Verify the agent executed the expected tool sequence
    const toolExecutions = events
      .filter((e) => e.type === 'tool_execution_end')
      .map((e) => e.toolName);
    expect(toolExecutions).toEqual([
      'list_reviews',
      'claim_review',
      'get_proposal',
      'submit_verdict',
    ]);

    // 8. Verify audit trail reflects agent actions
    const activity = await harness.service.getActivityFeed({ reviewId });
    const eventTypes = activity.activity.map((entry) => entry.eventType);
    expect(eventTypes).toContain('review.created');
    expect(eventTypes).toContain('review.claimed');
    expect(eventTypes).toContain('review.approved');
  });

  it('agent tools return correct content structure', async () => {
    const harness = createHarness();
    const validDiff = readFixture('valid-review.diff');
    const reviewerId = 'tool-structure-tester';

    // Create a review so list_reviews has something to return
    await harness.service.createReview({
      title: 'Tool structure test review',
      description: 'Verify tool output shape.',
      diff: validDiff,
      authorId: 'test-author',
      priority: 'normal',
    });

    // Get the tools directly
    const tools = createReviewerAgentTools(harness.service, reviewerId);
    const listReviewsTool = tools.find((t) => t.name === 'list_reviews')!;

    // Execute list_reviews and verify the return shape
    const result = await listReviewsTool.execute('test-call-1', {});

    // Verify content structure: array of TextContent blocks
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toMatchObject({ type: 'text' });
    expect(typeof result.content[0].text).toBe('string');

    // Verify details contains the raw data
    expect(result.details).toBeDefined();
    expect(result.details.reviews).toBeInstanceOf(Array);
    expect(result.details.reviews).toHaveLength(1);

    // Verify the text content is valid JSON matching details
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual(result.details);
  });
});
