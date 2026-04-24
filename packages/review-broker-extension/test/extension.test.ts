import { describe, expect, it, beforeEach } from 'vitest';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { createTandemReviewExtension } from '../src/index.js';
import type { ReviewTransport, ReviewUnitIdentity, ReviewStatusRecord } from '../src/types.js';

const tmpRoot = path.join(process.cwd(), '.tmp-ext-integration-tests');

async function resetTmpRoot(): Promise<void> {
  await rm(tmpRoot, { recursive: true, force: true });
  await mkdir(path.join(tmpRoot, '.gsd', 'runtime'), { recursive: true });
}

interface MockExtensionAPI {
  cwd: string;
  handlers: Map<string, (event: any, ctx: any) => Promise<any>>;
  commands: Map<string, { description?: string; handler: (args: string, ctx: any) => Promise<void> }>;
  shortcuts: Map<string, { description?: string; handler: (ctx: any) => Promise<void> | void }>;
  on(event: string, handler: (event: any, ctx: any) => Promise<any>): void;
  registerCommand(name: string, options: { description?: string; handler: (args: string, ctx: any) => Promise<void> }): void;
  registerShortcut(name: string, options: { description?: string; handler: (ctx: any) => Promise<void> | void }): void;
}

function createMockExtensionAPI(): MockExtensionAPI {
  const api: MockExtensionAPI = {
    cwd: tmpRoot,
    handlers: new Map(),
    commands: new Map(),
    shortcuts: new Map(),
    on(event, handler) {
      api.handlers.set(event, handler);
    },
    registerCommand(name, options) {
      api.commands.set(name, options);
    },
    registerShortcut(name, options) {
      api.shortcuts.set(name, options);
    },
  };
  return api;
}

function createMockTransport(responses: {
  submit?: ReviewStatusRecord;
  status?: ReviewStatusRecord;
  statusSequence?: ReviewStatusRecord[];
  submitError?: Error;
} = {}): ReviewTransport {
  return {
    async submitReview(_unit: ReviewUnitIdentity): Promise<ReviewStatusRecord> {
      if (responses.submitError) throw responses.submitError;
      return responses.submit ?? { reviewId: 'rev-test', status: 'approved', summary: 'Approved.' };
    },
    async getStatus(_reviewId: string): Promise<ReviewStatusRecord> {
      if (responses.statusSequence && responses.statusSequence.length > 0) {
        return responses.statusSequence.shift()!;
      }
      return responses.status ?? { reviewId: 'rev-test', status: 'approved', summary: 'Approved.' };
    },
  };
}

describe('createTandemReviewExtension', () => {
  beforeEach(resetTmpRoot);

  it('registers before_next_dispatch hook and review command', async () => {
    const transport = createMockTransport();
    const register = createTandemReviewExtension({ transport, reviewWaitTimeoutMs: 0 });
    const api = createMockExtensionAPI();

    await register(api);

    expect(api.handlers.has('before_next_dispatch')).toBe(true);
    expect(api.handlers.has('before_agent_start')).toBe(true);
    expect(api.commands.has('review')).toBe(true);
    expect(api.shortcuts.has('ctrl+alt+r')).toBe(true);
    expect(api.shortcuts.has('ctrl+shift+r')).toBe(true);
  });

  it('publishes a REVIEW footer status while a broker review is pending', async () => {
    const transport = createMockTransport({
      submit: { reviewId: 'rev-waiting', status: 'pending', summary: 'Queued.' },
    });
    const register = createTandemReviewExtension({ transport, reviewWaitTimeoutMs: 0 });
    const api = createMockExtensionAPI();
    await register(api);

    const statusUpdates: Array<{ key: string; value?: string }> = [];
    const handler = api.handlers.get('before_next_dispatch')!;

    await handler({
      type: 'before_next_dispatch',
      unitType: 'task',
      unitId: 'M001-S01-T08',
      status: 'completed',
      cwd: tmpRoot,
    }, {
      ui: {
        setStatus(key: string, value?: string) {
          statusUpdates.push({ key, value });
        },
      },
    });

    const pendingStatus = statusUpdates
      .filter((entry) => entry.key === 'tandem-review')
      .map((entry) => entry.value)
      .find((value) => typeof value === 'string' && value.includes('REVIEW pending'));

    expect(pendingStatus).toMatch(/REVIEW pending/);
  });

  it('hook returns continue for approved reviews', async () => {
    const transport = createMockTransport({
      submit: { reviewId: 'rev-ok', status: 'approved', summary: 'Looks good.' },
    });
    const register = createTandemReviewExtension({ transport, reviewWaitTimeoutMs: 0 });
    const api = createMockExtensionAPI();
    await register(api);

    const handler = api.handlers.get('before_next_dispatch')!;
    const result = await handler({
      type: 'before_next_dispatch',
      unitType: 'task',
      unitId: 'M001-S01-T01',
      milestoneId: 'M001',
      status: 'completed',
      cwd: tmpRoot,
    }, {});

    expect(result.action).toBe('continue');
    expect(result.reason).toMatch(/tandem-review/);
  });

  it('waits for pending reviews and continues when the broker approves before timeout', async () => {
    let allowedReviewId: string | null = null;
    const transport: ReviewTransport = {
      async submitReview(): Promise<ReviewStatusRecord> {
        return { reviewId: 'rev-wait-approved', status: 'pending', summary: 'Queued.' };
      },
      async getStatus(reviewId: string): Promise<ReviewStatusRecord> {
        return { reviewId, status: 'approved', summary: 'Approved while waiting.' };
      },
      async onReviewAllowed(_unit: ReviewUnitIdentity, reviewId: string): Promise<void> {
        allowedReviewId = reviewId;
      },
    };
    const register = createTandemReviewExtension({
      transport,
      reviewWaitPollIntervalMs: 1,
      reviewWaitTimeoutMs: 50,
    });
    const api = createMockExtensionAPI();
    await register(api);

    const handler = api.handlers.get('before_next_dispatch')!;
    const result = await handler({
      type: 'before_next_dispatch',
      unitType: 'task',
      unitId: 'M001-S01-T01',
      milestoneId: 'M001',
      status: 'completed',
      cwd: tmpRoot,
    }, {});

    expect(result.action).toBe('continue');
    expect(result.reason).toMatch(/review-allowed/);
    expect(allowedReviewId).toBe('rev-wait-approved');
  });

  it('hook returns continue for non-completed status without calling transport', async () => {
    let transportCalled = false;
    const transport: ReviewTransport = {
      async submitReview() {
        transportCalled = true;
        return { reviewId: 'rev-x', status: 'approved' };
      },
      async getStatus() {
        transportCalled = true;
        return { reviewId: 'rev-x', status: 'approved' };
      },
    };

    const register = createTandemReviewExtension({ transport, reviewWaitTimeoutMs: 0 });
    const api = createMockExtensionAPI();
    await register(api);

    const handler = api.handlers.get('before_next_dispatch')!;
    const result = await handler({
      type: 'before_next_dispatch',
      unitType: 'task',
      unitId: 'M001-S01-T01',
      status: 'failed',
      cwd: tmpRoot,
    }, {});

    expect(result.action).toBe('continue');
    expect(transportCalled).toBe(false);
  });

  it('hook retries for blocked reviews by default (intervene policy) with user-guidance prompt injection', async () => {
    const transport = createMockTransport({
      submit: {
        reviewId: 'rev-blocked',
        status: 'changes_requested',
        summary: 'Fix the imports.',
        feedback: 'Use named exports.',
      },
    });
    const register = createTandemReviewExtension({ transport });
    const api = createMockExtensionAPI();
    await register(api);

    const handler = api.handlers.get('before_next_dispatch')!;
    const coreLikeContext: { state: { pendingVerificationRetry?: unknown } } = {
      state: {},
    };

    const result = await handler({
      type: 'before_next_dispatch',
      unitType: 'task',
      unitId: 'M001-S01-T01',
      status: 'completed',
      cwd: tmpRoot,
    }, coreLikeContext);

    expect(result.action).toBe('retry');
    expect(result.reason).toMatch(/review-blocked/);
    expect(result.reason).toMatch(/Use named exports\./);
    expect(coreLikeContext.state.pendingVerificationRetry).toMatchObject({
      attempt: 1,
      failureContext: expect.stringContaining('get explicit direction before editing code'),
    });

    const beforeAgentStart = api.handlers.get('before_agent_start')!;
    const promptResult = await beforeAgentStart({
      systemPrompt: 'BASE SYSTEM PROMPT',
    }, {});

    expect(promptResult).toMatchObject({
      systemPrompt: expect.stringContaining('Tandem broker review guidance'),
    });
    expect(promptResult.systemPrompt).toContain('Use named exports.');
  });

  it('auto-loop policy returns retry and injects reviewer guidance into before_agent_start', async () => {
    const transport = createMockTransport({
      submit: {
        reviewId: 'rev-auto-loop',
        status: 'changes_requested',
        summary: 'Fix the imports.',
        feedback: 'Use named exports.',
      },
    });
    const register = createTandemReviewExtension({
      transport,
      blockedPolicy: 'auto-loop',
    });
    const api = createMockExtensionAPI();
    await register(api);

    const hookHandler = api.handlers.get('before_next_dispatch')!;
    const coreLikeContext: { state: { pendingVerificationRetry?: unknown } } = {
      state: {},
    };

    const hookResult = await hookHandler({
      type: 'before_next_dispatch',
      unitType: 'task',
      unitId: 'M001-S01-T01',
      status: 'completed',
      cwd: tmpRoot,
    }, coreLikeContext);

    expect(hookResult.action).toBe('retry');
    expect(hookResult.reason).toMatch(/review-blocked/);
    expect(coreLikeContext.state.pendingVerificationRetry).toMatchObject({
      attempt: 1,
      failureContext: expect.stringContaining('Use named exports.'),
    });

    const blockedFile = await readFile(
      path.join(tmpRoot, '.gsd', 'runtime', 'tandem-review-state.json'),
      'utf8',
    );
    const parsedBlocked = JSON.parse(blockedFile);
    expect(parsedBlocked.reason).toBe('review-blocked');
    expect(parsedBlocked.pausedReviewState.reviewGateState.reviewId).toBe('rev-auto-loop');
    expect(parsedBlocked.pausedReviewState.reviewGateState.status).toBe('changes_requested');

    const beforeAgentStart = api.handlers.get('before_agent_start')!;
    const agentPromptResult = await beforeAgentStart({
      systemPrompt: 'BASE SYSTEM PROMPT',
    }, {});

    expect(agentPromptResult).toMatchObject({
      systemPrompt: expect.stringContaining('Tandem broker review guidance'),
    });
    expect(agentPromptResult.systemPrompt).toContain('Use named exports.');

    const secondAgentPrompt = await beforeAgentStart({
      systemPrompt: 'BASE SYSTEM PROMPT',
    }, {});

    expect(secondAgentPrompt).toBeUndefined();
  });

  it('hook returns pause for waiting reviews and persists state to filesystem', async () => {
    const transport = createMockTransport({
      submit: {
        reviewId: 'rev-wait',
        status: 'claimed',
        summary: 'Under review.',
      },
    });
    const register = createTandemReviewExtension({ transport, reviewWaitTimeoutMs: 0 });
    const api = createMockExtensionAPI();
    await register(api);

    const handler = api.handlers.get('before_next_dispatch')!;
    const result = await handler({
      type: 'before_next_dispatch',
      unitType: 'task',
      unitId: 'M001-S01-T01',
      status: 'completed',
      cwd: tmpRoot,
    }, {});

    expect(result.action).toBe('pause');
    expect(result.reason).toMatch(/tandem-review/);

    const pausedFile = await readFile(
      path.join(tmpRoot, '.gsd', 'runtime', 'tandem-review-state.json'),
      'utf8',
    );
    const parsed = JSON.parse(pausedFile);
    expect(parsed.pausedReviewState.reviewGateState.reviewId).toBe('rev-wait');
  });

  it('hook returns pause for transport errors and persists state', async () => {
    const transport = createMockTransport({
      submitError: Object.assign(new Error('Connection refused'), { code: 'ECONNREFUSED' }),
    });
    const register = createTandemReviewExtension({ transport });
    const api = createMockExtensionAPI();
    await register(api);

    const handler = api.handlers.get('before_next_dispatch')!;
    const result = await handler({
      type: 'before_next_dispatch',
      unitType: 'task',
      unitId: 'M001-S01-T01',
      status: 'completed',
      cwd: tmpRoot,
    }, {});

    expect(result.action).toBe('pause');
    expect(result.reason).toMatch(/review-error/);

    const pausedFile = await readFile(
      path.join(tmpRoot, '.gsd', 'runtime', 'tandem-review-state.json'),
      'utf8',
    );
    const parsed = JSON.parse(pausedFile);
    expect(parsed.pausedReviewState.reviewGateState.decision).toBe('error');
  });

  it('hook restores session from paused state on first invocation', async () => {
    const transport = createMockTransport({
      status: { reviewId: 'rev-restored', status: 'approved', summary: 'Finally approved.' },
    });

    const register = createTandemReviewExtension({ transport });
    const api = createMockExtensionAPI();

    const { writePausedReviewGateState } = await import('../src/pause-state.js');
    const { createReviewGateState } = await import('../src/types.js');
    await writePausedReviewGateState(
      tmpRoot,
      createReviewGateState({
        phase: 'waiting',
        unit: { unitId: 'M001-S01-T01' },
        reviewId: 'rev-restored',
        status: 'pending',
        decision: 'wait',
        blockedPolicy: 'auto-loop',
        summary: 'Waiting.',
      }),
      'review-waiting',
    );

    await register(api);

    const handler = api.handlers.get('before_next_dispatch')!;
    const result = await handler({
      type: 'before_next_dispatch',
      unitType: 'task',
      unitId: 'M001-S01-T01',
      milestoneId: 'M001',
      status: 'completed',
      cwd: tmpRoot,
    }, {});

    expect(result.action).toBe('continue');
  });

  it('review command opens the status overlay when UI is available', async () => {
    const { writePausedReviewGateState } = await import('../src/pause-state.js');
    const { createReviewGateState } = await import('../src/types.js');
    await writePausedReviewGateState(
      tmpRoot,
      createReviewGateState({
        phase: 'waiting',
        unit: { unitId: 'M001/S01/T01' },
        reviewId: 'rev-overlay',
        status: 'pending',
        decision: 'wait',
        blockedPolicy: 'auto-loop',
        summary: 'Queued.',
      }),
      'review-waiting',
    );

    const transport: ReviewTransport = {
      async submitReview() {
        throw new Error('not used');
      },
      async getStatus(reviewId) {
        return { reviewId, status: 'pending', summary: 'Still queued.' };
      },
      async getReviewDiscussion(reviewId) {
        return [{
          messageId: 1,
          reviewId,
          actorId: 'reviewer-1',
          authorRole: 'reviewer',
          body: 'Reviewer feedback goes here.',
          createdAt: new Date().toISOString(),
        }];
      },
      async listRecentReviews() {
        return [{
          reviewId: 'rev-overlay',
          title: 'Review: M001/S01/T01',
          workspaceRoot: tmpRoot,
          projectName: 'tmp',
          status: 'pending',
          priority: 'normal',
          authorId: 'tester',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          claimedBy: null,
          claimedAt: null,
          claimGeneration: 0,
          currentRound: 1,
          latestVerdict: null,
          verdictReason: null,
          counterPatchStatus: 'none',
          lastMessageAt: null,
          lastActivityAt: null,
        }];
      },
    };

    const register = createTandemReviewExtension({ transport });
    const api = createMockExtensionAPI();
    await register(api);

    let rendered = '';
    let overlayOptions: unknown;
    const uiContext = {
      ui: {
        async custom(factory: any, options: any) {
          overlayOptions = options?.overlayOptions;
          const component = factory(
            { requestRender() {} },
            { fg: (_name: string, text: string) => text, bold: (text: string) => text },
            {},
            () => {},
          );
          rendered = component.render(100).join('\n');
        },
      },
    };

    await api.commands.get('review')!.handler('status', uiContext);

    expect(rendered).toContain('Tandem Review');
    expect(rendered).toContain('rev-overlay');
    expect(rendered).toContain('Reviewer feedback goes here.');
    expect(rendered).toContain('Recent Reviews');
    expect(rendered.split('\n')[0]).toHaveLength(100);
    expect(overlayOptions).toMatchObject({
      anchor: 'center',
      width: '90%',
      minWidth: 80,
      maxHeight: '92%',
    });
  });

  it('review shortcuts open the same status overlay', async () => {
    const transport = createMockTransport();
    const register = createTandemReviewExtension({ transport });
    const api = createMockExtensionAPI();
    await register(api);

    let opened = false;
    await api.shortcuts.get('ctrl+alt+r')!.handler({
      ui: {
        async custom() {
          opened = true;
        },
      },
    });

    expect(opened).toBe(true);

    opened = false;
    await api.shortcuts.get('ctrl+shift+r')!.handler({
      ui: {
        async custom() {
          opened = true;
        },
      },
    });

    expect(opened).toBe(true);
  });

  it('review command keeps text fallback when UI is unavailable', async () => {
    const transport = createMockTransport();
    const register = createTandemReviewExtension({ transport });
    const api = createMockExtensionAPI();
    await register(api);

    const command = api.commands.get('review')!;
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(' '));

    try {
      await command.handler('status', {});
    } finally {
      console.log = origLog;
    }

    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]).toMatch(/review_state_missing|reviewId/);
  });
});
