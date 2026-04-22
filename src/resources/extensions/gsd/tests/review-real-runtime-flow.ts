import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { finalizeReviewForUnit } from '../auto-loop.ts';
import { handleReviewStatus, handleReviewSubmit } from '../commands/handlers/review.ts';
import { pauseAuto, setAutoSession, startAuto } from '../auto.ts';
import type { ReviewErrorInfo, ReviewUnitIdentity } from '../review/types.ts';
import {
  readPersistedBrokerReviews,
  startReviewBrokerTransport,
  type PersistedBrokerReviewRow,
} from './review-broker-transport.ts';

export interface ParsedReviewOutput {
  targetSource?: string;
  target?: string;
  source?: string;
  refreshed?: string;
  reviewId?: string;
  status?: string;
  decision?: string;
  blockedPolicy?: string;
  summary?: string;
  error?: string;
}

export interface RedactedPausedEnvelope {
  reason: string;
  pausedReviewState: {
    schemaVersion: number;
    savedAt: string;
    reviewGateState: {
      unitId: string | null;
      reviewId: string | null;
      status: string | null;
      decision: string | null;
      blockedPolicy: string | null;
      summary: string | null;
      error: ReviewErrorInfo | null;
    } | null;
  };
}

export interface ReviewRealRuntimeProofResult {
  proofRoot: string;
  broker: {
    baseUrl: string;
    dbPath: string;
    pid: number;
    persistedRows: PersistedBrokerReviewRow[];
  };
  waitContinuity: {
    unitId: string;
    initialSubmit: ParsedReviewOutput;
    finalize: {
      action: string;
      reason: string;
      kind: string;
      reviewId: string | null;
      status: string | null;
      blockedPolicy: string | null;
      summary: string;
    };
    pausedEnvelope: RedactedPausedEnvelope;
    pausedStatus: ParsedReviewOutput;
    restartedStatus: ParsedReviewOutput;
    resubmit: ParsedReviewOutput;
  };
  blockedVisibility: {
    unitId: string;
    finalize: {
      action: string;
      reason: string;
      kind: string;
      reviewId: string | null;
      status: string | null;
      blockedPolicy: string | null;
      summary: string;
      feedback?: string;
    };
    pausedEnvelope: RedactedPausedEnvelope;
    pausedStatus: ParsedReviewOutput;
    resubmit: ParsedReviewOutput;
  };
  errorVisibility: {
    unitId: string;
    finalize: {
      action: string;
      reason: string;
      kind: string;
      reviewId: string | null;
      status: string | null;
      blockedPolicy: string | null;
      summary: string;
      error: ReviewErrorInfo;
    };
    pausedEnvelope: RedactedPausedEnvelope;
    pausedStatus: ParsedReviewOutput;
    manualSubmit: ParsedReviewOutput;
  };
  assertions: {
    waitReviewReused: true;
    blockedReviewReused: true;
    pausedContinuityVisible: true;
    blockedVisibilityVisible: true;
    errorVisibilityVisible: true;
    noDuplicateBrokerRows: true;
    errorRowAbsent: true;
  };
}

function reviewOutputPath(rootDir: string, name: string): string {
  return path.join(rootDir, `${name}.txt`);
}

async function resetRoot(rootDir: string): Promise<void> {
  await rm(rootDir, { recursive: true, force: true });
  await mkdir(rootDir, { recursive: true });
}

function parseReviewOutput(output: string): ParsedReviewOutput {
  const parsed: ParsedReviewOutput = {};
  for (const line of output.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(': ');
    if (separatorIndex === -1) {
      continue;
    }
    const key = line.slice(0, separatorIndex) as keyof ParsedReviewOutput;
    const value = line.slice(separatorIndex + 2);
    parsed[key] = value;
  }
  return parsed;
}

async function writeOutputArtifact(rootDir: string, name: string, output: string): Promise<ParsedReviewOutput> {
  await mkdir(rootDir, { recursive: true });
  await writeFile(reviewOutputPath(rootDir, name), output, 'utf8');
  return parseReviewOutput(output);
}

async function readPausedEnvelope(projectRoot: string): Promise<RedactedPausedEnvelope> {
  const payload = JSON.parse(
    await readFile(path.join(projectRoot, '.gsd', 'runtime', 'paused-session.json'), 'utf8'),
  ) as {
    reason: string;
    pausedReviewState: {
      schemaVersion: number;
      savedAt: string;
      reviewGateState: {
        unit?: { unitId?: string | null } | null;
        reviewId?: string | null;
        status?: string | null;
        decision?: string | null;
        blockedPolicy?: string | null;
        summary?: string | null;
        error?: ReviewErrorInfo | null;
      } | null;
    };
  };

  return {
    reason: payload.reason,
    pausedReviewState: {
      schemaVersion: payload.pausedReviewState.schemaVersion,
      savedAt: payload.pausedReviewState.savedAt,
      reviewGateState: payload.pausedReviewState.reviewGateState
        ? {
            unitId: payload.pausedReviewState.reviewGateState.unit?.unitId ?? null,
            reviewId: payload.pausedReviewState.reviewGateState.reviewId ?? null,
            status: payload.pausedReviewState.reviewGateState.status ?? null,
            decision: payload.pausedReviewState.reviewGateState.decision ?? null,
            blockedPolicy: payload.pausedReviewState.reviewGateState.blockedPolicy ?? null,
            summary: payload.pausedReviewState.reviewGateState.summary ?? null,
            error: payload.pausedReviewState.reviewGateState.error ?? null,
          }
        : null,
    },
  };
}

function assertReviewId(value: string | undefined): asserts value is string {
  assert.ok(value);
  assert.match(value, /^rev-\d{4}$/);
}

function createUnit(unitId: string): ReviewUnitIdentity {
  return {
    unitId,
    milestoneId: 'M002',
    sliceId: 'S04',
    taskId: 'T03',
  };
}

export async function runReviewRealRuntimeProof(rootDir: string): Promise<ReviewRealRuntimeProofResult> {
  await resetRoot(rootDir);
  setAutoSession(null);

  const brokerRoot = path.join(rootDir, 'broker');
  const waitRoot = path.join(rootDir, 'wait-continuity');
  const blockedRoot = path.join(rootDir, 'blocked-visibility');
  const errorRoot = path.join(rootDir, 'error-visibility');

  const waitUnit = createUnit('M002-S04-T03-WAIT');
  const blockedUnit = createUnit('M002-S04-T03-BLOCK');
  const errorUnit = createUnit('M002-S04-T03-ERROR');

  const broker = await startReviewBrokerTransport({ rootDir: brokerRoot });
  let persistedRows: PersistedBrokerReviewRow[] = [];

  try {
    await broker.setUnitScenario(waitUnit.unitId, {
      submit: {
        status: 'pending',
        summary: 'Broker review queued.',
      },
      statusSequence: [
        {
          status: 'claimed',
          summary: 'Reviewer still evaluating.',
        },
      ],
    });

    const waitSession = await startAuto(waitRoot, { currentUnit: waitUnit });
    const waitSubmit = await writeOutputArtifact(
      waitRoot,
      'manual-submit-before-finalize',
      await handleReviewSubmit({
        projectRoot: waitRoot,
        transport: broker.transport,
      }),
    );
    assert.equal(waitSubmit.targetSource, 'current');
    assert.equal(waitSubmit.target, waitUnit.unitId);
    assert.equal(waitSubmit.status, 'pending');
    assert.equal(waitSubmit.decision, 'wait');
    assert.equal(waitSubmit.blockedPolicy, 'intervene');
    assertReviewId(waitSubmit.reviewId);
    assert.equal(waitSession.reviewGateState?.reviewId, waitSubmit.reviewId);

    const waitFinalize = await finalizeReviewForUnit({
      session: waitSession,
      unit: waitUnit,
      transport: broker.transport,
      pauseAuto: (reason) => pauseAuto(waitRoot, reason),
    });
    assert.equal(waitFinalize.action, 'pause');
    assert.equal(waitFinalize.reason, 'review-waiting');
    assert.equal(waitFinalize.gate.kind, 'wait');
    assert.equal(waitFinalize.gate.reviewId, waitSubmit.reviewId);
    assert.equal(waitFinalize.gate.status, 'claimed');
    assert.equal(waitSession.paused, true);
    assert.equal(waitSession.pausedReason, 'review-waiting');
    assert.match(waitSession.history.at(-1) ?? '', /^review-waiting:/);

    const waitPausedEnvelope = await readPausedEnvelope(waitRoot);
    assert.equal(waitPausedEnvelope.reason, 'review-waiting');
    assert.equal(waitPausedEnvelope.pausedReviewState.reviewGateState?.reviewId, waitSubmit.reviewId);
    assert.equal(waitPausedEnvelope.pausedReviewState.reviewGateState?.status, 'claimed');
    assert.equal(waitPausedEnvelope.pausedReviewState.reviewGateState?.decision, 'wait');

    setAutoSession(null);
    const waitPausedStatus = await writeOutputArtifact(
      waitRoot,
      'paused-status-before-restart',
      await handleReviewStatus({ projectRoot: waitRoot }),
    );
    assert.equal(waitPausedStatus.source, 'paused');
    assert.equal(waitPausedStatus.refreshed, 'no');
    assert.equal(waitPausedStatus.reviewId, waitSubmit.reviewId);
    assert.equal(waitPausedStatus.status, 'claimed');
    assert.equal(waitPausedStatus.decision, 'wait');

    const restartedWaitSession = await startAuto(waitRoot);
    assert.equal(restartedWaitSession.reviewGateState?.reviewId, waitSubmit.reviewId);
    const waitRestartedStatus = await writeOutputArtifact(
      waitRoot,
      'restarted-status',
      await handleReviewStatus({
        projectRoot: waitRoot,
        transport: broker.transport,
      }),
    );
    assert.equal(waitRestartedStatus.source, 'live');
    assert.equal(waitRestartedStatus.refreshed, 'yes');
    assert.equal(waitRestartedStatus.reviewId, waitSubmit.reviewId);
    assert.equal(waitRestartedStatus.status, 'claimed');
    assert.equal(waitRestartedStatus.decision, 'wait');

    const waitResubmit = await writeOutputArtifact(
      waitRoot,
      'manual-submit-after-restart',
      await handleReviewSubmit({
        projectRoot: waitRoot,
        transport: broker.transport,
      }),
    );
    assert.equal(waitResubmit.targetSource, 'current');
    assert.equal(waitResubmit.target, waitUnit.unitId);
    assert.equal(waitResubmit.reviewId, waitSubmit.reviewId);
    assert.equal(waitResubmit.status, 'claimed');
    assert.equal(waitResubmit.decision, 'wait');

    await broker.setUnitScenario(blockedUnit.unitId, {
      submit: {
        status: 'changes_requested',
        summary: 'Reviewer blocked progression.',
        feedback: 'Needs manual follow-up.',
      },
    });

    const blockedSession = await startAuto(blockedRoot, { currentUnit: blockedUnit });
    const blockedFinalize = await finalizeReviewForUnit({
      session: blockedSession,
      unit: blockedUnit,
      mode: 'human',
      transport: broker.transport,
      pauseAuto: (reason) => pauseAuto(blockedRoot, reason),
    });
    assert.equal(blockedFinalize.action, 'pause');
    assert.equal(blockedFinalize.reason, 'review-blocked');
    assert.equal(blockedFinalize.gate.kind, 'block');
    assert.equal(blockedFinalize.gate.blockedPolicy, 'intervene');
    assert.equal(blockedSession.paused, true);
    assert.equal(blockedSession.pausedReason, 'review-blocked');
    assert.match(blockedSession.history.at(-1) ?? '', /^review-blocked:intervene:/);

    const blockedPausedEnvelope = await readPausedEnvelope(blockedRoot);
    assert.equal(blockedPausedEnvelope.reason, 'review-blocked');
    assert.equal(blockedPausedEnvelope.pausedReviewState.reviewGateState?.reviewId, blockedFinalize.gate.reviewId);
    assert.equal(blockedPausedEnvelope.pausedReviewState.reviewGateState?.status, 'changes_requested');
    assert.equal(blockedPausedEnvelope.pausedReviewState.reviewGateState?.decision, 'block');
    assert.equal(blockedPausedEnvelope.pausedReviewState.reviewGateState?.blockedPolicy, 'intervene');

    setAutoSession(null);
    const blockedPausedStatus = await writeOutputArtifact(
      blockedRoot,
      'paused-status',
      await handleReviewStatus({ projectRoot: blockedRoot }),
    );
    assert.equal(blockedPausedStatus.source, 'paused');
    assert.equal(blockedPausedStatus.refreshed, 'no');
    assert.equal(blockedPausedStatus.reviewId, blockedFinalize.gate.reviewId ?? '');
    assert.equal(blockedPausedStatus.status, 'changes_requested');
    assert.equal(blockedPausedStatus.decision, 'block');
    assert.equal(blockedPausedStatus.blockedPolicy, 'intervene');

    await startAuto(blockedRoot);
    const blockedResubmit = await writeOutputArtifact(
      blockedRoot,
      'manual-submit-after-block',
      await handleReviewSubmit({
        projectRoot: blockedRoot,
        transport: broker.transport,
      }),
    );
    assert.equal(blockedResubmit.targetSource, 'current');
    assert.equal(blockedResubmit.target, blockedUnit.unitId);
    assert.equal(blockedResubmit.reviewId, blockedFinalize.gate.reviewId ?? '');
    assert.equal(blockedResubmit.status, 'changes_requested');
    assert.equal(blockedResubmit.decision, 'block');

    await broker.setUnitScenario(errorUnit.unitId, {
      submitError: {
        code: 'broker_unavailable',
        message: 'Broker unavailable.',
        retryable: true,
      },
    });

    const errorSession = await startAuto(errorRoot, { currentUnit: errorUnit });
    const errorFinalize = await finalizeReviewForUnit({
      session: errorSession,
      unit: errorUnit,
      transport: broker.transport,
      pauseAuto: (reason) => pauseAuto(errorRoot, reason),
    });
    assert.equal(errorFinalize.action, 'pause');
    assert.equal(errorFinalize.reason, 'review-error');
    assert.equal(errorFinalize.gate.kind, 'error');
    assert.equal(errorFinalize.gate.reviewId, null);
    assert.equal(errorFinalize.gate.status, null);
    assert.equal(errorFinalize.gate.error.code, 'broker_unavailable');
    assert.equal(errorSession.paused, true);
    assert.equal(errorSession.pausedReason, 'review-error');
    assert.match(errorSession.history.at(-1) ?? '', /^review-error:broker_unavailable:/);

    const errorPausedEnvelope = await readPausedEnvelope(errorRoot);
    assert.equal(errorPausedEnvelope.reason, 'review-error');
    assert.equal(errorPausedEnvelope.pausedReviewState.reviewGateState?.reviewId, null);
    assert.equal(errorPausedEnvelope.pausedReviewState.reviewGateState?.decision, 'error');
    assert.deepEqual(errorPausedEnvelope.pausedReviewState.reviewGateState?.error, {
      code: 'broker_unavailable',
      message: 'Broker unavailable.',
      retryable: true,
    });

    setAutoSession(null);
    const errorPausedStatus = await writeOutputArtifact(
      errorRoot,
      'paused-status',
      await handleReviewStatus({ projectRoot: errorRoot }),
    );
    assert.equal(errorPausedStatus.source, 'paused');
    assert.equal(errorPausedStatus.refreshed, 'no');
    assert.equal(errorPausedStatus.reviewId, 'none');
    assert.equal(errorPausedStatus.status, 'none');
    assert.equal(errorPausedStatus.decision, 'error');
    assert.equal(errorPausedStatus.blockedPolicy, 'auto-loop');
    assert.equal(errorPausedStatus.error, 'broker_unavailable:Broker unavailable.');

    await startAuto(errorRoot);
    const errorManualSubmit = await writeOutputArtifact(
      errorRoot,
      'manual-submit',
      await handleReviewSubmit({
        projectRoot: errorRoot,
        transport: broker.transport,
      }),
    );
    assert.equal(errorManualSubmit.targetSource, 'current');
    assert.equal(errorManualSubmit.target, errorUnit.unitId);
    assert.equal(errorManualSubmit.reviewId, 'none');
    assert.equal(errorManualSubmit.status, 'none');
    assert.equal(errorManualSubmit.decision, 'error');
    assert.equal(errorManualSubmit.summary, 'Broker unavailable.');
    assert.equal(errorManualSubmit.error, 'broker_unavailable:Broker unavailable.');

    setAutoSession(null);
    await broker.stop();
    persistedRows = await readPersistedBrokerReviews(broker.dbPath);

    const waitRows = persistedRows.filter((row) => row.unitId === waitUnit.unitId);
    const blockedRows = persistedRows.filter((row) => row.unitId === blockedUnit.unitId);
    const errorRows = persistedRows.filter((row) => row.unitId === errorUnit.unitId);

    assert.equal(waitRows.length, 1);
    assert.equal(waitRows[0]?.reviewId, waitSubmit.reviewId);
    assert.equal(waitRows[0]?.status, 'claimed');
    assert.equal(waitRows[0]?.summary, 'Reviewer still evaluating.');
    assert.equal(waitRows[0]?.statusCalls, 1);

    assert.equal(blockedRows.length, 1);
    assert.equal(blockedRows[0]?.reviewId, blockedFinalize.gate.reviewId);
    assert.equal(blockedRows[0]?.status, 'changes_requested');
    assert.equal(blockedRows[0]?.summary, 'Reviewer blocked progression.');
    assert.equal(blockedRows[0]?.feedback, 'Needs manual follow-up.');
    assert.equal(blockedRows[0]?.statusCalls, 0);

    assert.equal(errorRows.length, 0);
    assert.equal(new Set(persistedRows.map((row) => row.unitId)).size, persistedRows.length);

    const summary: ReviewRealRuntimeProofResult = {
      proofRoot: rootDir,
      broker: {
        baseUrl: broker.baseUrl,
        dbPath: broker.dbPath,
        pid: broker.pid,
        persistedRows,
      },
      waitContinuity: {
        unitId: waitUnit.unitId,
        initialSubmit: waitSubmit,
        finalize: {
          action: waitFinalize.action,
          reason: waitFinalize.reason,
          kind: waitFinalize.gate.kind,
          reviewId: waitFinalize.gate.reviewId,
          status: waitFinalize.gate.status,
          blockedPolicy: waitFinalize.gate.blockedPolicy,
          summary: waitFinalize.gate.summary,
        },
        pausedEnvelope: waitPausedEnvelope,
        pausedStatus: waitPausedStatus,
        restartedStatus: waitRestartedStatus,
        resubmit: waitResubmit,
      },
      blockedVisibility: {
        unitId: blockedUnit.unitId,
        finalize: {
          action: blockedFinalize.action,
          reason: blockedFinalize.reason,
          kind: blockedFinalize.gate.kind,
          reviewId: blockedFinalize.gate.reviewId,
          status: blockedFinalize.gate.status,
          blockedPolicy: blockedFinalize.gate.blockedPolicy,
          summary: blockedFinalize.gate.summary,
          feedback: blockedFinalize.gate.kind === 'block' ? blockedFinalize.gate.feedback : undefined,
        },
        pausedEnvelope: blockedPausedEnvelope,
        pausedStatus: blockedPausedStatus,
        resubmit: blockedResubmit,
      },
      errorVisibility: {
        unitId: errorUnit.unitId,
        finalize: {
          action: errorFinalize.action,
          reason: errorFinalize.reason,
          kind: errorFinalize.gate.kind,
          reviewId: errorFinalize.gate.reviewId,
          status: errorFinalize.gate.status,
          blockedPolicy: errorFinalize.gate.blockedPolicy,
          summary: errorFinalize.gate.summary,
          error: errorFinalize.gate.error,
        },
        pausedEnvelope: errorPausedEnvelope,
        pausedStatus: errorPausedStatus,
        manualSubmit: errorManualSubmit,
      },
      assertions: {
        waitReviewReused: true,
        blockedReviewReused: true,
        pausedContinuityVisible: true,
        blockedVisibilityVisible: true,
        errorVisibilityVisible: true,
        noDuplicateBrokerRows: true,
        errorRowAbsent: true,
      },
    };

    await writeFile(path.join(rootDir, 'broker-rows.json'), JSON.stringify(persistedRows, null, 2), 'utf8');
    await writeFile(path.join(rootDir, 'proof-summary.json'), JSON.stringify(summary, null, 2), 'utf8');

    return summary;
  } finally {
    setAutoSession(null);
    await broker.stop();
  }
}
