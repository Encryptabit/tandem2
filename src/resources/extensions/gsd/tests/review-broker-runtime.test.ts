import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { readPersistedBrokerReview, startReviewBrokerTransport } from './review-broker-transport.ts';
import type { ReviewTransport } from '../review/types.ts';

const tmpRoot = path.join(process.cwd(), '.tmp-review-broker-runtime-tests');

async function resetTmpRoot(): Promise<void> {
  await rm(tmpRoot, { recursive: true, force: true });
  await mkdir(path.join(tmpRoot, '.gsd', 'runtime'), { recursive: true });
}

test('launches a spawned broker fixture, round-trips the review transport contract, and leaves durable SQLite state', async (t) => {
  await resetTmpRoot();

  const broker = await startReviewBrokerTransport({
    rootDir: tmpRoot,
  });
  t.after(async () => {
    await broker.stop();
  });

  assert.notEqual(broker.pid, process.pid);
  assert.match(broker.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
  await access(broker.dbPath);

  const transport: ReviewTransport = broker.transport;
  const unit = {
    unitId: 'M002-S04-T02',
    milestoneId: 'M002',
    sliceId: 'S04',
    taskId: 'T02',
  };

  await broker.setUnitScenario(unit.unitId, {
    submit: {
      status: 'pending',
      summary: 'Broker review queued.',
    },
    statusSequence: [
      {
        status: 'approved',
        summary: 'Broker approved the review after refresh.',
      },
    ],
  });

  const submitted = await transport.submitReview(unit);
  assert.match(submitted.reviewId, /^rev-\d{4}$/);
  assert.equal(submitted.status, 'pending');
  assert.equal(submitted.summary, 'Broker review queued.');

  const refreshed = await transport.getStatus(submitted.reviewId);
  assert.equal(refreshed.reviewId, submitted.reviewId);
  assert.equal(refreshed.status, 'approved');
  assert.equal(refreshed.summary, 'Broker approved the review after refresh.');

  await broker.stop();

  const persisted = await readPersistedBrokerReview(broker.dbPath, submitted.reviewId);
  assert.ok(persisted);
  assert.equal(persisted.reviewId, submitted.reviewId);
  assert.equal(persisted.unitId, unit.unitId);
  assert.equal(persisted.status, 'approved');
  assert.equal(persisted.summary, 'Broker approved the review after refresh.');
  assert.equal(persisted.statusCalls, 1);
});
