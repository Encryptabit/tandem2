import type { AutoSession, VerificationRetryContext } from './session.js';
import { createAutoSession } from './session.js';
import { readPausedReviewGateState, writePausedReviewGateState } from './pause-state.js';
import { finalizeReviewForUnit } from './finalize.js';
import { handleReviewSubmit, handleReviewStatus } from './commands.js';
import { formatPendingRetryPrompt } from './verification.js';
import type {
  ResolvedBlockedReviewPolicy,
  ReviewGateState,
  ReviewTransport,
  ReviewUnitIdentity,
} from './types.js';

export interface TandemReviewConfig {
  transport: ReviewTransport;
  blockedPolicy?: ResolvedBlockedReviewPolicy;
  injectRetryPrompt?: boolean;
  reviewWaitTimeoutMs?: number;
  reviewWaitPollIntervalMs?: number;
}

interface BeforeNextDispatchEvent {
  type: string;
  unitType: string;
  unitId: string;
  milestoneId?: string;
  status: string;
  cwd: string;
}

interface BeforeAgentStartEvent {
  systemPrompt?: string;
}

interface BeforeAgentStartResult {
  systemPrompt?: string;
  message?: unknown;
}

interface HookResult {
  action?: 'pause' | 'continue' | 'retry';
  reason?: string;
}

interface CoreRetryContext {
  attempt: number;
  failureContext: string;
}

interface ExtensionAPI {
  cwd: string;
  on(
    event: string,
    handler: (event: any, ctx: any) => Promise<HookResult | BeforeAgentStartResult | void> | HookResult | BeforeAgentStartResult | void,
  ): void;
  registerCommand(name: string, options: { description?: string; handler: (args: string, ctx: any) => Promise<void> }): void;
}

const ACTION_MAP: Record<string, HookResult['action']> = {
  'progress': 'continue',
  'retry-unit': 'retry',
  'pause': 'pause',
};

const DEFAULT_BLOCKED_POLICY: ResolvedBlockedReviewPolicy = 'intervene';
const DEFAULT_RETRY_ATTEMPT = 1;
const MAX_REASON_LENGTH = 220;
const DEFAULT_REVIEW_WAIT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_REVIEW_WAIT_POLL_INTERVAL_MS = 2 * 1000;

function truncate(value: string, maxLength = MAX_REASON_LENGTH): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

type HookOutcome = Awaited<ReturnType<typeof finalizeReviewForUnit>>;

function resolveNonNegativeMs(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function resolvePositiveMs(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isWaitingForReview(outcome: HookOutcome): boolean {
  return outcome.action === 'pause' && outcome.reason === 'review-waiting' && outcome.gate.kind === 'wait';
}

function buildHookReason(outcome: HookOutcome): string {
  const base = `tandem-review: ${outcome.reason}`;

  if (outcome.gate.kind === 'allow') {
    return `${base} (${outcome.gate.reviewId})`;
  }

  if (outcome.gate.kind === 'wait' || outcome.gate.kind === 'block') {
    const guidance = outcome.gate.kind === 'block'
      ? outcome.gate.feedback ?? outcome.gate.summary
      : outcome.gate.summary;
    return `${base} (${outcome.gate.reviewId}): ${truncate(guidance)}`;
  }

  if (outcome.gate.kind === 'error') {
    const reviewRef = outcome.gate.reviewId ? ` (${outcome.gate.reviewId})` : '';
    return `${base}${reviewRef}: ${truncate(outcome.gate.summary)}`;
  }

  return base;
}

function buildReviewRetryPrompt(context: VerificationRetryContext | null): string | null {
  if (!context || context.source !== 'review') {
    return null;
  }

  return formatPendingRetryPrompt(context);
}

function assignCoreRetryContext(target: unknown, payload: CoreRetryContext): boolean {
  if (!target || typeof target !== 'object') {
    return false;
  }

  const record = target as Record<string, unknown>;
  record.pendingVerificationRetry = payload;
  return true;
}

function injectCoreRetryContext(ctx: unknown, payload: CoreRetryContext): boolean {
  if (!ctx || typeof ctx !== 'object') {
    return false;
  }

  const record = ctx as Record<string, unknown>;
  return (
    assignCoreRetryContext(record.state, payload) ||
    assignCoreRetryContext(record.session, payload) ||
    assignCoreRetryContext(record.autoState, payload) ||
    assignCoreRetryContext(ctx, payload)
  );
}

interface StatusCapableContext {
  hasUI?: boolean;
  ui?: {
    setStatus?: (key: string, value?: string) => void;
  };
}

function formatReviewFooterStatus(state: ReviewGateState | null): string | undefined {
  if (!state || !state.reviewId) {
    return undefined;
  }

  const reviewRef = state.reviewId.slice(0, 12);

  switch (state.status) {
    case 'pending':
      return `REVIEW pending ${reviewRef}`;
    case 'claimed':
      return `REVIEW claimed ${reviewRef}`;
    case 'changes_requested':
      return `REVIEW blocked ${reviewRef}`;
    case 'failed':
      return `REVIEW error ${reviewRef}`;
    default:
      return undefined;
  }
}

function setReviewFooterStatus(ctx: unknown, state: ReviewGateState | null): void {
  if (!ctx || typeof ctx !== 'object') {
    return;
  }

  const context = ctx as StatusCapableContext;
  if (!context.ui || typeof context.ui.setStatus !== 'function') {
    return;
  }

  context.ui.setStatus('tandem-review', formatReviewFooterStatus(state));
}
function buildReviewPromptInjection(prompt: string, systemPrompt: string): string {
  return [
    '**Tandem broker review guidance**',
    '',
    prompt,
    '',
    '---',
    '',
    systemPrompt,
  ].join('\n');
}

export function createTandemReviewExtension(config: TandemReviewConfig) {
  return async function register(pi: ExtensionAPI): Promise<void> {
    let session: AutoSession | null = null;
    const transport = config.transport;
    const projectRoot = pi.cwd ?? process.cwd();
    const blockedPolicy = config.blockedPolicy ?? DEFAULT_BLOCKED_POLICY;
    const injectRetryPrompt = config.injectRetryPrompt ?? true;
    const reviewWaitTimeoutMs = resolveNonNegativeMs(
      config.reviewWaitTimeoutMs,
      DEFAULT_REVIEW_WAIT_TIMEOUT_MS,
    );
    const reviewWaitPollIntervalMs = resolvePositiveMs(
      config.reviewWaitPollIntervalMs,
      DEFAULT_REVIEW_WAIT_POLL_INTERVAL_MS,
    );

    async function ensureSession(): Promise<AutoSession> {
      if (session) return session;
      const pausedState = await readPausedReviewGateState(projectRoot);
      session = createAutoSession({ reviewGateState: pausedState });
      return session;
    }

    pi.on('before_agent_start', async (event: BeforeAgentStartEvent, ctx: unknown): Promise<BeforeAgentStartResult | void> => {
      const currentSession = await ensureSession();
      setReviewFooterStatus(ctx, currentSession.reviewGateState);

      if (!injectRetryPrompt) {
        return;
      }

      const prompt = buildReviewRetryPrompt(currentSession.pendingVerificationRetry);
      if (!prompt) {
        return;
      }

      currentSession.pendingVerificationRetry = null;
      const baseSystemPrompt = typeof event.systemPrompt === 'string' ? event.systemPrompt : '';

      return {
        systemPrompt: buildReviewPromptInjection(prompt, baseSystemPrompt),
      };
    });

    pi.on('before_next_dispatch', async (event: BeforeNextDispatchEvent, ctx: unknown): Promise<HookResult> => {
      if (event.status !== 'completed') {
        return { action: 'continue' };
      }

      const currentSession = await ensureSession();
      setReviewFooterStatus(ctx, currentSession.reviewGateState);

      const unit: ReviewUnitIdentity = {
        unitId: event.unitId,
        unitType: event.unitType,
      };
      if (event.milestoneId !== undefined) unit.milestoneId = event.milestoneId;

      let outcome = await finalizeReviewForUnit({
        session: currentSession,
        unit,
        preferences: {
          blockedPolicy,
        },
        transport,
      });

      if (isWaitingForReview(outcome) && reviewWaitTimeoutMs > 0) {
        const deadline = Date.now() + reviewWaitTimeoutMs;
        await writePausedReviewGateState(projectRoot, currentSession.reviewGateState, outcome.reason);
        setReviewFooterStatus(ctx, currentSession.reviewGateState);

        while (isWaitingForReview(outcome) && Date.now() < deadline) {
          await sleep(Math.min(reviewWaitPollIntervalMs, Math.max(deadline - Date.now(), 0)));
          outcome = await finalizeReviewForUnit({
            session: currentSession,
            unit,
            preferences: {
              blockedPolicy,
            },
            transport,
          });
          setReviewFooterStatus(ctx, currentSession.reviewGateState);

          if (isWaitingForReview(outcome)) {
            await writePausedReviewGateState(projectRoot, currentSession.reviewGateState, outcome.reason);
          }
        }
      }

      if (outcome.action === 'pause') {
        await writePausedReviewGateState(projectRoot, currentSession.reviewGateState, outcome.reason);
      }

      if (outcome.action === 'retry-unit' && injectRetryPrompt) {
        const retryPrompt = buildReviewRetryPrompt(currentSession.pendingVerificationRetry);
        if (retryPrompt) {
          injectCoreRetryContext(ctx, {
            attempt: DEFAULT_RETRY_ATTEMPT,
            failureContext: retryPrompt,
          });
        }
      }

      if (
        outcome.action === 'progress' &&
        outcome.reason === 'review-allowed' &&
        outcome.gate.kind === 'allow' &&
        transport.onReviewAllowed
      ) {
        await transport.onReviewAllowed(unit, outcome.gate.reviewId);
      }

      setReviewFooterStatus(ctx, currentSession.reviewGateState);

      return {
        action: ACTION_MAP[outcome.action] ?? 'continue',
        reason: buildHookReason(outcome),
      };
    });

    pi.registerCommand('review', {
      description: 'Submit or check status of a broker review',
      handler: async (args: string): Promise<void> => {
        const subcommand = args.trim().split(/\s+/)[0] ?? 'status';

        let result: string;
        if (subcommand === 'submit') {
          result = await handleReviewSubmit({
            session,
            projectRoot,
            transport,
          });
        } else {
          result = await handleReviewStatus({
            session,
            projectRoot,
            transport,
          });
        }

        console.log(result);
      },
    });
  };
}

export type { ReviewTransport, ReviewUnitIdentity, ReviewStatusRecord } from './types.js';
export type { AutoSession, VerificationRetryContext } from './session.js';
export type { ReviewGateResult, ReviewGateState, ReviewMode, ReviewDecision } from './types.js';
export type { FinalizeReviewOutcome } from './finalize.js';
export { createAutoSession } from './session.js';
export { createBrokerTransportAdapter, type TransportAdapterConfig } from './transport-adapter.js';
export {
  ensureReviewBrokerConfigDefaults,
  type EnsureReviewBrokerConfigDefaultsOptions,
  type EnsureReviewBrokerConfigDefaultsResult,
} from './config-defaults.js';
export {
  installTandemReviewExtension,
  type InstallTandemReviewExtensionOptions,
  type InstallTandemReviewExtensionResult,
} from './install.js';
export { finalizeReviewForUnit } from './finalize.js';
export { runReviewGate } from './gate.js';
export { formatPendingRetryPrompt } from './verification.js';
