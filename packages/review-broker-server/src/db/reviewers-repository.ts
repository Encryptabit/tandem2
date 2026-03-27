import type Database from 'better-sqlite3';
import { ReviewerRecordSchema, type ReviewerOfflineReason, type ReviewerRecord, type ReviewerStatus } from 'review-broker-core';

interface ReviewerRow {
  reviewer_id: string;
  command: string;
  args_json: string;
  cwd: string | null;
  pid: number | null;
  started_at: string | null;
  last_seen_at: string | null;
  offline_at: string | null;
  offline_reason: ReviewerOfflineReason | null;
  exit_code: number | null;
  exit_signal: string | null;
  session_token: string | null;
  draining_at: string | null;
  created_at: string;
  updated_at: string;
  current_review_id: string | null;
  status: ReviewerStatus;
}

export interface RecordReviewerSpawnedInput {
  reviewerId: string;
  command: string;
  args: string[];
  cwd?: string | null;
  pid: number;
  startedAt: string;
  lastSeenAt?: string | null;
  sessionToken?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecordReviewerSpawnFailureInput {
  reviewerId: string;
  command: string;
  args: string[];
  cwd?: string | null;
  offlineAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarkReviewerOfflineInput {
  reviewerId: string;
  offlineAt: string;
  offlineReason: ReviewerOfflineReason;
  exitCode?: number | null;
  exitSignal?: string | null;
  lastSeenAt?: string | null;
  updatedAt: string;
}

export interface TouchReviewerInput {
  reviewerId: string;
  lastSeenAt: string;
  updatedAt: string;
}

export interface MarkReviewerDrainingInput {
  reviewerId: string;
  drainingAt: string;
  updatedAt: string;
}

export interface ListReviewersOptions {
  status?: ReviewerStatus;
  limit?: number;
}

export interface ReviewersRepository {
  recordSpawned: (input: RecordReviewerSpawnedInput) => ReviewerRecord;
  recordSpawnFailure: (input: RecordReviewerSpawnFailureInput) => ReviewerRecord;
  markOffline: (input: MarkReviewerOfflineInput) => ReviewerRecord | null;
  markDraining: (input: MarkReviewerDrainingInput) => ReviewerRecord | null;
  touch: (input: TouchReviewerInput) => ReviewerRecord | null;
  getById: (reviewerId: string) => ReviewerRecord | null;
  list: (options?: ListReviewersOptions) => ReviewerRecord[];
}

const REVIEWER_SELECT_COLUMNS = `
  reviewer_id,
  command,
  args_json,
  cwd,
  pid,
  started_at,
  last_seen_at,
  offline_at,
  offline_reason,
  exit_code,
  exit_signal,
  session_token,
  draining_at,
  created_at,
  updated_at,
  current_review_id,
  status
`;

const REVIEWER_STATE_CTE = `
  FROM (
    SELECT
      reviewers.reviewer_id,
      reviewers.command,
      reviewers.args_json,
      reviewers.cwd,
      reviewers.pid,
      reviewers.started_at,
      reviewers.last_seen_at,
      reviewers.offline_at,
      reviewers.offline_reason,
      reviewers.exit_code,
      reviewers.exit_signal,
      reviewers.session_token,
      reviewers.draining_at,
      reviewers.created_at,
      reviewers.updated_at,
      (
        SELECT reviews.review_id
        FROM reviews
        WHERE reviews.claimed_by = reviewers.reviewer_id
          AND reviews.status IN ('claimed', 'submitted')
        ORDER BY reviews.updated_at DESC, reviews.review_id DESC
        LIMIT 1
      ) AS current_review_id,
      CASE
        WHEN reviewers.pid IS NULL OR reviewers.offline_at IS NOT NULL THEN 'offline'
        WHEN reviewers.draining_at IS NOT NULL THEN 'draining'
        WHEN EXISTS (
          SELECT 1
          FROM reviews
          WHERE reviews.claimed_by = reviewers.reviewer_id
            AND reviews.status IN ('claimed', 'submitted')
          LIMIT 1
        ) THEN 'assigned'
        ELSE 'idle'
      END AS status
    FROM reviewers
  ) reviewer_state
`;

export function createReviewersRepository(db: Database.Database): ReviewersRepository {
  const recordSpawnedStatement = db.prepare(`
    INSERT INTO reviewers (
      reviewer_id,
      command,
      args_json,
      cwd,
      pid,
      started_at,
      last_seen_at,
      offline_at,
      offline_reason,
      exit_code,
      exit_signal,
      session_token,
      created_at,
      updated_at
    ) VALUES (
      @reviewerId,
      @command,
      @argsJson,
      @cwd,
      @pid,
      @startedAt,
      @lastSeenAt,
      NULL,
      NULL,
      NULL,
      NULL,
      @sessionToken,
      @createdAt,
      @updatedAt
    )
    ON CONFLICT(reviewer_id) DO UPDATE SET
      command = excluded.command,
      args_json = excluded.args_json,
      cwd = excluded.cwd,
      pid = excluded.pid,
      started_at = excluded.started_at,
      last_seen_at = excluded.last_seen_at,
      offline_at = NULL,
      offline_reason = NULL,
      exit_code = NULL,
      exit_signal = NULL,
      session_token = excluded.session_token,
      updated_at = excluded.updated_at
  `);

  const recordSpawnFailureStatement = db.prepare(`
    INSERT INTO reviewers (
      reviewer_id,
      command,
      args_json,
      cwd,
      pid,
      started_at,
      last_seen_at,
      offline_at,
      offline_reason,
      exit_code,
      exit_signal,
      created_at,
      updated_at
    ) VALUES (
      @reviewerId,
      @command,
      @argsJson,
      @cwd,
      NULL,
      NULL,
      NULL,
      @offlineAt,
      'spawn_failed',
      NULL,
      NULL,
      @createdAt,
      @updatedAt
    )
    ON CONFLICT(reviewer_id) DO UPDATE SET
      command = excluded.command,
      args_json = excluded.args_json,
      cwd = excluded.cwd,
      pid = NULL,
      started_at = NULL,
      last_seen_at = NULL,
      offline_at = excluded.offline_at,
      offline_reason = 'spawn_failed',
      exit_code = NULL,
      exit_signal = NULL,
      updated_at = excluded.updated_at
  `);

  const getByIdStatement = db.prepare<string[], ReviewerRow>(`
    SELECT
      ${REVIEWER_SELECT_COLUMNS}
    ${REVIEWER_STATE_CTE}
    WHERE reviewer_id = ?
  `);

  function getById(reviewerId: string): ReviewerRecord | null {
    const row = getByIdStatement.get(reviewerId);
    return row ? mapReviewerRow(row) : null;
  }

  return {
    recordSpawned(input) {
      recordSpawnedStatement.run({
        reviewerId: input.reviewerId,
        command: input.command,
        argsJson: JSON.stringify(input.args),
        cwd: input.cwd ?? null,
        pid: input.pid,
        startedAt: input.startedAt,
        lastSeenAt: input.lastSeenAt ?? input.startedAt,
        sessionToken: input.sessionToken ?? null,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      });

      const reviewer = getById(input.reviewerId);

      if (!reviewer) {
        throw new Error(`Persisted reviewer ${input.reviewerId} could not be reloaded after spawn.`);
      }

      return reviewer;
    },

    recordSpawnFailure(input) {
      recordSpawnFailureStatement.run({
        reviewerId: input.reviewerId,
        command: input.command,
        argsJson: JSON.stringify(input.args),
        cwd: input.cwd ?? null,
        offlineAt: input.offlineAt,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      });

      const reviewer = getById(input.reviewerId);

      if (!reviewer) {
        throw new Error(`Persisted reviewer ${input.reviewerId} could not be reloaded after spawn failure.`);
      }

      return reviewer;
    },

    markOffline(input) {
      const result = db
        .prepare(`
          UPDATE reviewers
          SET
            pid = NULL,
            last_seen_at = @lastSeenAt,
            offline_at = @offlineAt,
            offline_reason = @offlineReason,
            exit_code = @exitCode,
            exit_signal = @exitSignal,
            updated_at = @updatedAt
          WHERE reviewer_id = @reviewerId
        `)
        .run({
          reviewerId: input.reviewerId,
          lastSeenAt: input.lastSeenAt ?? input.offlineAt,
          offlineAt: input.offlineAt,
          offlineReason: input.offlineReason,
          exitCode: input.exitCode ?? null,
          exitSignal: input.exitSignal ?? null,
          updatedAt: input.updatedAt,
        });

      if (result.changes === 0) {
        return null;
      }

      return getById(input.reviewerId);
    },

    markDraining(input) {
      const result = db
        .prepare(`
          UPDATE reviewers
          SET
            draining_at = @drainingAt,
            updated_at = @updatedAt
          WHERE reviewer_id = @reviewerId
        `)
        .run({
          reviewerId: input.reviewerId,
          drainingAt: input.drainingAt,
          updatedAt: input.updatedAt,
        });

      if (result.changes === 0) {
        return null;
      }

      return getById(input.reviewerId);
    },

    touch(input) {
      const result = db
        .prepare(`
          UPDATE reviewers
          SET
            last_seen_at = @lastSeenAt,
            updated_at = @updatedAt
          WHERE reviewer_id = @reviewerId
        `)
        .run({
          reviewerId: input.reviewerId,
          lastSeenAt: input.lastSeenAt,
          updatedAt: input.updatedAt,
        });

      if (result.changes === 0) {
        return null;
      }

      return getById(input.reviewerId);
    },

    getById,

    list(options = {}) {
      const params: Record<string, number | ReviewerStatus> = {};
      const whereClause = options.status ? 'WHERE status = @status' : '';
      const limitClause = options.limit ? 'LIMIT @limit' : '';

      if (options.status) {
        params.status = options.status;
      }

      if (options.limit) {
        params.limit = options.limit;
      }

      const rows = db
        .prepare<Record<string, number | ReviewerStatus>, ReviewerRow>(`
          SELECT
            ${REVIEWER_SELECT_COLUMNS}
          ${REVIEWER_STATE_CTE}
          ${whereClause}
          ORDER BY updated_at DESC, reviewer_id DESC
          ${limitClause}
        `)
        .all(params);

      return rows.map((row) => mapReviewerRow(row));
    },
  };
}

function mapReviewerRow(row: ReviewerRow): ReviewerRecord {
  return ReviewerRecordSchema.parse({
    reviewerId: row.reviewer_id,
    status: row.status,
    currentReviewId: row.current_review_id,
    command: row.command,
    args: parseArgs(row.args_json),
    cwd: row.cwd,
    pid: row.pid,
    startedAt: row.started_at,
    lastSeenAt: row.last_seen_at,
    offlineAt: row.offline_at,
    offlineReason: row.offline_reason,
    exitCode: row.exit_code,
    exitSignal: row.exit_signal,
    sessionToken: row.session_token,
    drainingAt: row.draining_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function parseArgs(rawValue: string): string[] {
  const parsed = JSON.parse(rawValue) as unknown;
  return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
}
