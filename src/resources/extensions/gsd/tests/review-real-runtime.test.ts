import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { runReviewRealRuntimeProof } from './review-real-runtime-flow.ts';

const tmpRoot = path.join(process.cwd(), '.tmp-review-real-runtime-tests');

test('proves auto/manual review convergence across a spawned broker runtime and leaves inspectable artifacts', async () => {
  await rm(tmpRoot, { recursive: true, force: true });

  const summary = await runReviewRealRuntimeProof(tmpRoot);
  const summaryPath = path.join(tmpRoot, 'proof-summary.json');
  const brokerRowsPath = path.join(tmpRoot, 'broker-rows.json');

  assert.equal(summary.waitContinuity.initialSubmit.reviewId, summary.waitContinuity.resubmit.reviewId);
  assert.equal(summary.waitContinuity.pausedStatus.reviewId, summary.waitContinuity.restartedStatus.reviewId);
  assert.equal(summary.blockedVisibility.finalize.reviewId, summary.blockedVisibility.resubmit.reviewId);
  assert.equal(summary.errorVisibility.pausedStatus.error, 'broker_unavailable:Broker unavailable.');
  assert.equal(summary.broker.persistedRows.length, 2);
  assert.deepEqual(summary.assertions, {
    waitReviewReused: true,
    blockedReviewReused: true,
    pausedContinuityVisible: true,
    blockedVisibilityVisible: true,
    errorVisibilityVisible: true,
    noDuplicateBrokerRows: true,
    errorRowAbsent: true,
  });

  const persistedSummary = JSON.parse(await readFile(summaryPath, 'utf8')) as typeof summary;
  const persistedRows = JSON.parse(await readFile(brokerRowsPath, 'utf8')) as typeof summary.broker.persistedRows;

  assert.equal(persistedSummary.waitContinuity.initialSubmit.reviewId, summary.waitContinuity.initialSubmit.reviewId);
  assert.equal(persistedSummary.blockedVisibility.resubmit.reviewId, summary.blockedVisibility.resubmit.reviewId);
  assert.equal(persistedSummary.errorVisibility.manualSubmit.error, 'broker_unavailable:Broker unavailable.');
  assert.deepEqual(persistedRows, summary.broker.persistedRows);
});
