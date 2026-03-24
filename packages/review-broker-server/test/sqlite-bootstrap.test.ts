import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createAuditRepository } from '../src/db/audit-repository.js';
import { createMessagesRepository } from '../src/db/messages-repository.js';
import { openDatabase } from '../src/db/open-database.js';
import { createReviewersRepository } from '../src/db/reviewers-repository.js';
import { createReviewsRepository } from '../src/db/reviews-repository.js';

const tempDirectories: string[] = [];

afterEach(() => {
  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();

    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe('review-broker-server SQLite bootstrap', () => {
  it('creates the lifecycle schema, records all migrations, and applies durable pragmas', () => {
    const dbPath = createTempDbPath();
    const opened = openDatabase({ dbPath });

    try {
      const tableNames = opened.db
        .prepare<{ name: string }[]>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC")
        .all()
        .map((row) => row.name);
      const reviewColumns = opened.db
        .prepare<{ name: string }[]>("PRAGMA table_info('reviews')")
        .all()
        .map((row) => row.name);
      const messageColumns = opened.db
        .prepare<{ name: string }[]>("PRAGMA table_info('messages')")
        .all()
        .map((row) => row.name);
      const reviewerColumns = opened.db
        .prepare<{ name: string }[]>("PRAGMA table_info('reviewers')")
        .all()
        .map((row) => row.name);
      const indexNames = opened.db
        .prepare<{ name: string }[]>("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name ASC")
        .all()
        .map((row) => row.name);
      const migrations = opened.db
        .prepare<{ id: string; checksum: string }[]>('SELECT id, checksum FROM schema_migrations ORDER BY id ASC')
        .all();

      expect(tableNames).toEqual(
        expect.arrayContaining(['audit_events', 'messages', 'reviewers', 'reviews', 'schema_migrations']),
      );
      expect(reviewColumns).toEqual(
        expect.arrayContaining([
          'claim_generation',
          'claimed_at',
          'current_round',
          'latest_verdict',
          'verdict_reason',
          'counter_patch_status',
          'counter_patch_decision_actor_id',
          'counter_patch_decision_note',
          'counter_patch_decided_at',
          'last_message_at',
          'last_activity_at',
        ]),
      );
      expect(messageColumns).toEqual(expect.arrayContaining(['author_role', 'round_number']));
      expect(reviewerColumns).toEqual(
        expect.arrayContaining([
          'reviewer_id',
          'command',
          'args_json',
          'cwd',
          'pid',
          'started_at',
          'last_seen_at',
          'offline_at',
          'offline_reason',
          'exit_code',
          'exit_signal',
          'created_at',
          'updated_at',
        ]),
      );
      expect(indexNames).toEqual(
        expect.arrayContaining([
          'idx_messages_review_created_at',
          'idx_messages_review_round_created_at',
          'idx_reviewers_offline_at',
          'idx_reviewers_pid_active',
          'idx_reviewers_updated_at',
          'idx_reviews_claimed_by_status_updated_at',
        ]),
      );
      expect(migrations).toHaveLength(3);
      expect(migrations.map((migration) => migration.id)).toEqual([
        '001_init',
        '002_review_lifecycle_parity',
        '003_reviewer_lifecycle',
      ]);
      expect(migrations[0]?.checksum).toHaveLength(64);
      expect(migrations[1]?.checksum).toHaveLength(64);
      expect(migrations[2]?.checksum).toHaveLength(64);
      expect(opened.pragmas).toEqual({
        journalMode: 'WAL',
        busyTimeoutMs: 5_000,
        foreignKeys: true,
        synchronous: 'NORMAL',
      });
    } finally {
      opened.close();
    }
  });

  it('reopens the same database idempotently without duplicating migration state', () => {
    const dbPath = createTempDbPath();

    const firstOpen = openDatabase({ dbPath });
    firstOpen.close();

    const secondOpen = openDatabase({ dbPath });

    try {
      const migrations = secondOpen.db
        .prepare<{ id: string }[]>('SELECT id FROM schema_migrations ORDER BY id ASC')
        .all();

      expect(migrations).toEqual([
        { id: '001_init' },
        { id: '002_review_lifecycle_parity' },
        { id: '003_reviewer_lifecycle' },
      ]);
    } finally {
      secondOpen.close();
    }
  });

  it('persists lifecycle review, reviewer, message, and audit rows across reopen on the same SQLite file', () => {
    const dbPath = createTempDbPath();
    const createdAt = '2026-03-21T09:00:00.000Z';
    const claimedAt = '2026-03-21T09:05:00.000Z';
    const verdictAt = '2026-03-21T09:10:00.000Z';
    const requeueAt = '2026-03-21T09:11:00.000Z';
    const messageAt = '2026-03-21T09:12:00.000Z';
    const counterPatchAt = '2026-03-21T09:13:00.000Z';

    const firstOpen = openDatabase({ dbPath });

    try {
      const reviews = createReviewsRepository(firstOpen.db);
      const reviewers = createReviewersRepository(firstOpen.db);
      const messages = createMessagesRepository(firstOpen.db);
      const audit = createAuditRepository(firstOpen.db);

      reviews.insert({
        reviewId: 'rvw_bootstrap_001',
        title: 'Persist the lifecycle-aware SQLite broker runtime',
        description: 'Store durable review, discussion, and activity rows for the standalone broker.',
        diff: 'diff --git a/file.ts b/file.ts',
        affectedFiles: ['file.ts'],
        priority: 'high',
        authorId: 'agent-cari',
        createdAt,
        updatedAt: createdAt,
      });

      reviews.updateState({
        reviewId: 'rvw_bootstrap_001',
        status: 'submitted',
        claimedBy: 'agent-reviewer',
        claimedAt,
        incrementClaimGeneration: true,
        expectedClaimGeneration: 0,
        updatedAt: claimedAt,
        lastActivityAt: claimedAt,
      });

      reviews.recordVerdict({
        reviewId: 'rvw_bootstrap_001',
        status: 'changes_requested',
        verdict: 'changes_requested',
        reason: 'Add regression coverage before approval.',
        currentRound: 1,
        updatedAt: verdictAt,
        lastActivityAt: verdictAt,
      });

      reviews.updateState({
        reviewId: 'rvw_bootstrap_001',
        status: 'pending',
        claimedBy: null,
        claimedAt: null,
        currentRound: 2,
        updatedAt: requeueAt,
        lastActivityAt: requeueAt,
      });

      messages.insert({
        reviewId: 'rvw_bootstrap_001',
        actorId: 'agent-cari',
        authorRole: 'proposer',
        roundNumber: 2,
        body: 'Added the requested regression coverage and requeued the review.',
        createdAt: messageAt,
      });

      reviews.recordMessageActivity({
        reviewId: 'rvw_bootstrap_001',
        lastMessageAt: messageAt,
        currentRound: 2,
        updatedAt: messageAt,
        lastActivityAt: messageAt,
      });

      reviews.recordCounterPatchDecision({
        reviewId: 'rvw_bootstrap_001',
        counterPatchStatus: 'accepted',
        actorId: 'agent-reviewer',
        note: 'Counter-patch resolves the requested changes.',
        decidedAt: counterPatchAt,
        updatedAt: counterPatchAt,
        lastActivityAt: counterPatchAt,
      });

      reviewers.recordSpawned({
        reviewerId: 'reviewer_bootstrap_001',
        command: 'node',
        args: ['packages/review-broker-server/test/fixtures/reviewer-worker.mjs'],
        cwd: 'packages/review-broker-server',
        pid: 4321,
        startedAt: claimedAt,
        lastSeenAt: verdictAt,
        createdAt: claimedAt,
        updatedAt: verdictAt,
      });
      reviewers.markOffline({
        reviewerId: 'reviewer_bootstrap_001',
        offlineAt: counterPatchAt,
        offlineReason: 'reviewer_exit',
        exitCode: 0,
        exitSignal: null,
        lastSeenAt: counterPatchAt,
        updatedAt: counterPatchAt,
      });

      audit.append({
        reviewId: 'rvw_bootstrap_001',
        eventType: 'review.changes_requested',
        actorId: 'agent-reviewer',
        statusFrom: 'submitted',
        statusTo: 'changes_requested',
        createdAt: verdictAt,
        metadata: {
          reviewId: 'rvw_bootstrap_001',
          summary: 'Reviewer requested changes.',
          roundNumber: 1,
        },
      });
      audit.append({
        reviewId: 'rvw_bootstrap_001',
        eventType: 'review.message_added',
        actorId: 'agent-cari',
        statusFrom: 'pending',
        statusTo: 'pending',
        createdAt: messageAt,
        metadata: {
          reviewId: 'rvw_bootstrap_001',
          summary: 'Proposer added a round-two follow-up message.',
          roundNumber: 2,
          authorRole: 'proposer',
        },
      });
      audit.append({
        reviewId: 'rvw_bootstrap_001',
        eventType: 'review.counter_patch_accepted',
        actorId: 'agent-reviewer',
        statusFrom: 'pending',
        statusTo: 'pending',
        createdAt: counterPatchAt,
        metadata: {
          reviewId: 'rvw_bootstrap_001',
          summary: 'Reviewer accepted the counter-patch.',
          counterPatchStatus: 'accepted',
        },
      });
    } finally {
      firstOpen.close();
    }

    const secondOpen = openDatabase({ dbPath });

    try {
      const reviews = createReviewsRepository(secondOpen.db);
      const reviewers = createReviewersRepository(secondOpen.db);
      const messages = createMessagesRepository(secondOpen.db);
      const audit = createAuditRepository(secondOpen.db);
      const review = reviews.getById('rvw_bootstrap_001');
      const reviewer = reviewers.getById('reviewer_bootstrap_001');
      const counterPatch = reviews.getCounterPatchDecision('rvw_bootstrap_001');
      const discussion = messages.listForReview('rvw_bootstrap_001');
      const latestMessage = messages.getLatestForRound('rvw_bootstrap_001', 2);
      const activity = audit.listActivityForReview('rvw_bootstrap_001');
      const latestAuditEvent = audit.getLatestForReview('rvw_bootstrap_001');

      expect(review).toMatchObject({
        reviewId: 'rvw_bootstrap_001',
        status: 'pending',
        claimedBy: null,
        claimedAt: null,
        claimGeneration: 1,
        currentRound: 2,
        latestVerdict: 'changes_requested',
        verdictReason: 'Add regression coverage before approval.',
        counterPatchStatus: 'accepted',
        lastMessageAt: messageAt,
        lastActivityAt: counterPatchAt,
      });
      expect(reviewer).toMatchObject({
        reviewerId: 'reviewer_bootstrap_001',
        status: 'offline',
        currentReviewId: null,
        command: 'node',
        args: ['packages/review-broker-server/test/fixtures/reviewer-worker.mjs'],
        cwd: 'packages/review-broker-server',
        pid: null,
        startedAt: claimedAt,
        lastSeenAt: counterPatchAt,
        offlineAt: counterPatchAt,
        offlineReason: 'reviewer_exit',
        exitCode: 0,
        exitSignal: null,
      });
      expect(counterPatch).toEqual({
        reviewId: 'rvw_bootstrap_001',
        status: 'accepted',
        actorId: 'agent-reviewer',
        note: 'Counter-patch resolves the requested changes.',
        decidedAt: counterPatchAt,
      });
      expect(discussion).toEqual([
        {
          messageId: expect.any(Number),
          reviewId: 'rvw_bootstrap_001',
          actorId: 'agent-cari',
          authorRole: 'proposer',
          roundNumber: 2,
          body: 'Added the requested regression coverage and requeued the review.',
          createdAt: messageAt,
        },
      ]);
      expect(latestMessage).toMatchObject({
        reviewId: 'rvw_bootstrap_001',
        actorId: 'agent-cari',
        authorRole: 'proposer',
        roundNumber: 2,
        createdAt: messageAt,
      });
      expect(activity).toEqual([
        {
          auditEventId: expect.any(Number),
          reviewId: 'rvw_bootstrap_001',
          eventType: 'review.changes_requested',
          actorId: 'agent-reviewer',
          statusFrom: 'submitted',
          statusTo: 'changes_requested',
          errorCode: null,
          summary: 'Reviewer requested changes.',
          metadata: {
            reviewId: 'rvw_bootstrap_001',
            summary: 'Reviewer requested changes.',
            roundNumber: 1,
          },
          createdAt: verdictAt,
        },
        {
          auditEventId: expect.any(Number),
          reviewId: 'rvw_bootstrap_001',
          eventType: 'review.message_added',
          actorId: 'agent-cari',
          statusFrom: 'pending',
          statusTo: 'pending',
          errorCode: null,
          summary: 'Proposer added a round-two follow-up message.',
          metadata: {
            reviewId: 'rvw_bootstrap_001',
            summary: 'Proposer added a round-two follow-up message.',
            roundNumber: 2,
            authorRole: 'proposer',
          },
          createdAt: messageAt,
        },
        {
          auditEventId: expect.any(Number),
          reviewId: 'rvw_bootstrap_001',
          eventType: 'review.counter_patch_accepted',
          actorId: 'agent-reviewer',
          statusFrom: 'pending',
          statusTo: 'pending',
          errorCode: null,
          summary: 'Reviewer accepted the counter-patch.',
          metadata: {
            reviewId: 'rvw_bootstrap_001',
            summary: 'Reviewer accepted the counter-patch.',
            counterPatchStatus: 'accepted',
          },
          createdAt: counterPatchAt,
        },
      ]);
      expect(latestAuditEvent).toMatchObject({
        eventType: 'review.counter_patch_accepted',
        actorId: 'agent-reviewer',
      });
    } finally {
      secondOpen.close();
    }
  });
});

function createTempDbPath(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-server-'));
  tempDirectories.push(directory);
  return path.join(directory, 'broker.sqlite');
}
