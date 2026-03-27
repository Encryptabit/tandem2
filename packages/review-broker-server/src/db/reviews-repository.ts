import type Database from 'better-sqlite3';
import {
  ReviewRecordSchema,
  ReviewSummarySchema,
  type CounterPatchStatus,
  type ReviewPriority,
  type ReviewRecord,
  type ReviewStatus,
  type ReviewSummary,
  type ReviewVerdict,
} from 'review-broker-core';

interface ReviewRow {
  review_id: string;
  title: string;
  description: string;
  diff: string;
  affected_files_json: string;
  status: ReviewStatus;
  priority: ReviewPriority;
  author_id: string;
  claimed_by: string | null;
  claimed_at: string | null;
  claim_generation: number;
  current_round: number | null;
  latest_verdict: ReviewVerdict | null;
  verdict_reason: string | null;
  counter_patch_status: CounterPatchStatus | null;
  counter_patch_decision_actor_id: string | null;
  counter_patch_decision_note: string | null;
  counter_patch_decided_at: string | null;
  last_message_at: string | null;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CounterPatchDecisionRecord {
  reviewId: string;
  status: CounterPatchStatus;
  actorId: string | null;
  note: string | null;
  decidedAt: string | null;
}

export interface InsertReviewInput {
  reviewId: string;
  title: string;
  description: string;
  diff: string;
  affectedFiles: string[];
  status?: ReviewStatus;
  priority: ReviewPriority;
  authorId: string;
  claimedBy?: string | null;
  claimedAt?: string | null;
  claimGeneration?: number;
  currentRound?: number;
  latestVerdict?: ReviewVerdict | null;
  verdictReason?: string | null;
  counterPatchStatus?: CounterPatchStatus;
  counterPatchDecisionActorId?: string | null;
  counterPatchDecisionNote?: string | null;
  counterPatchDecidedAt?: string | null;
  lastMessageAt?: string | null;
  lastActivityAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListReviewsOptions {
  status?: ReviewStatus;
  limit?: number;
}

export interface UpdateReviewStateInput {
  reviewId: string;
  updatedAt: string;
  status?: ReviewStatus;
  claimedBy?: string | null;
  claimedAt?: string | null;
  expectedClaimGeneration?: number;
  expectedStatus?: ReviewStatus;
  expectedClaimedBy?: string | null;
  incrementClaimGeneration?: boolean;
  currentRound?: number;
  latestVerdict?: ReviewVerdict | null;
  verdictReason?: string | null;
  counterPatchStatus?: CounterPatchStatus;
  counterPatchDecisionActorId?: string | null;
  counterPatchDecisionNote?: string | null;
  counterPatchDecidedAt?: string | null;
  lastMessageAt?: string | null;
  lastActivityAt?: string | null;
}

export interface RecordVerdictInput {
  reviewId: string;
  updatedAt: string;
  verdict: ReviewVerdict;
  reason: string;
  status?: ReviewStatus;
  currentRound?: number;
  lastActivityAt?: string | null;
}

export interface RecordCounterPatchDecisionInput {
  reviewId: string;
  updatedAt: string;
  counterPatchStatus: CounterPatchStatus;
  actorId?: string | null;
  note?: string | null;
  decidedAt: string;
  lastActivityAt?: string | null;
}

export interface RecordMessageActivityInput {
  reviewId: string;
  updatedAt: string;
  lastMessageAt: string;
  lastActivityAt?: string | null;
  currentRound?: number;
}

export interface ReviewsRepository {
  insert: (input: InsertReviewInput) => ReviewRecord;
  getById: (reviewId: string) => ReviewRecord | null;
  list: (options?: ListReviewsOptions) => ReviewSummary[];
  countByStatus: (status: ReviewStatus) => number;
  updateState: (input: UpdateReviewStateInput) => ReviewRecord | null;
  recordVerdict: (input: RecordVerdictInput) => ReviewRecord | null;
  recordCounterPatchDecision: (input: RecordCounterPatchDecisionInput) => ReviewRecord | null;
  recordMessageActivity: (input: RecordMessageActivityInput) => ReviewRecord | null;
  getCounterPatchDecision: (reviewId: string) => CounterPatchDecisionRecord | null;
}

const REVIEW_SELECT_COLUMNS = `
  review_id,
  title,
  description,
  diff,
  affected_files_json,
  status,
  priority,
  author_id,
  claimed_by,
  claimed_at,
  claim_generation,
  current_round,
  latest_verdict,
  verdict_reason,
  counter_patch_status,
  counter_patch_decision_actor_id,
  counter_patch_decision_note,
  counter_patch_decided_at,
  last_message_at,
  last_activity_at,
  created_at,
  updated_at
`;

export function createReviewsRepository(db: Database.Database): ReviewsRepository {
  const insertStatement = db.prepare(`
    INSERT INTO reviews (
      review_id,
      title,
      description,
      diff,
      affected_files_json,
      status,
      priority,
      author_id,
      claimed_by,
      claimed_at,
      claim_generation,
      current_round,
      latest_verdict,
      verdict_reason,
      counter_patch_status,
      counter_patch_decision_actor_id,
      counter_patch_decision_note,
      counter_patch_decided_at,
      last_message_at,
      last_activity_at,
      created_at,
      updated_at
    ) VALUES (
      @reviewId,
      @title,
      @description,
      @diff,
      @affectedFilesJson,
      @status,
      @priority,
      @authorId,
      @claimedBy,
      @claimedAt,
      @claimGeneration,
      @currentRound,
      @latestVerdict,
      @verdictReason,
      @counterPatchStatus,
      @counterPatchDecisionActorId,
      @counterPatchDecisionNote,
      @counterPatchDecidedAt,
      @lastMessageAt,
      @lastActivityAt,
      @createdAt,
      @updatedAt
    )
  `);

  const getByIdStatement = db.prepare<string[], ReviewRow>(`
    SELECT
      ${REVIEW_SELECT_COLUMNS}
    FROM reviews
    WHERE review_id = ?
  `);

  function getById(reviewId: string): ReviewRecord | null {
    const row = getByIdStatement.get(reviewId);
    return row ? mapReviewRow(row) : null;
  }

  function updateAndReload(input: UpdateReviewStateInput): ReviewRecord | null {
    const assignments = ['updated_at = @updatedAt'];
    const params: Record<string, string | number | null> = {
      reviewId: input.reviewId,
      updatedAt: input.updatedAt,
    };

    if (input.status !== undefined) {
      assignments.push('status = @status');
      params.status = input.status;
    }

    if ('claimedBy' in input) {
      assignments.push('claimed_by = @claimedBy');
      params.claimedBy = input.claimedBy ?? null;
    }

    if ('claimedAt' in input) {
      assignments.push('claimed_at = @claimedAt');
      params.claimedAt = input.claimedAt ?? null;
    }

    if (input.incrementClaimGeneration) {
      assignments.push('claim_generation = claim_generation + 1');
    }

    if (input.currentRound !== undefined) {
      assignments.push('current_round = @currentRound');
      params.currentRound = input.currentRound;
    }

    if ('latestVerdict' in input) {
      assignments.push('latest_verdict = @latestVerdict');
      params.latestVerdict = input.latestVerdict ?? null;
    }

    if ('verdictReason' in input) {
      assignments.push('verdict_reason = @verdictReason');
      params.verdictReason = input.verdictReason ?? null;
    }

    if (input.counterPatchStatus !== undefined) {
      assignments.push('counter_patch_status = @counterPatchStatus');
      params.counterPatchStatus = input.counterPatchStatus;
    }

    if ('counterPatchDecisionActorId' in input) {
      assignments.push('counter_patch_decision_actor_id = @counterPatchDecisionActorId');
      params.counterPatchDecisionActorId = input.counterPatchDecisionActorId ?? null;
    }

    if ('counterPatchDecisionNote' in input) {
      assignments.push('counter_patch_decision_note = @counterPatchDecisionNote');
      params.counterPatchDecisionNote = input.counterPatchDecisionNote ?? null;
    }

    if ('counterPatchDecidedAt' in input) {
      assignments.push('counter_patch_decided_at = @counterPatchDecidedAt');
      params.counterPatchDecidedAt = input.counterPatchDecidedAt ?? null;
    }

    if ('lastMessageAt' in input) {
      assignments.push('last_message_at = @lastMessageAt');
      params.lastMessageAt = input.lastMessageAt ?? null;
    }

    if ('lastActivityAt' in input) {
      assignments.push('last_activity_at = @lastActivityAt');
      params.lastActivityAt = input.lastActivityAt ?? null;
    }

    let sql = `UPDATE reviews SET ${assignments.join(', ')} WHERE review_id = @reviewId`;

    if (input.expectedClaimGeneration !== undefined) {
      sql += ' AND claim_generation = @expectedClaimGeneration';
      params.expectedClaimGeneration = input.expectedClaimGeneration;
    }

    if (input.expectedStatus !== undefined) {
      sql += ' AND status = @expectedStatus';
      params.expectedStatus = input.expectedStatus;
    }

    if ('expectedClaimedBy' in input) {
      sql += ' AND claimed_by IS @expectedClaimedBy';
      params.expectedClaimedBy = input.expectedClaimedBy ?? null;
    }

    const result = db.prepare(sql).run(params);

    if (result.changes === 0) {
      return null;
    }

    return getById(input.reviewId);
  }

  return {
    insert(input) {
      insertStatement.run({
        reviewId: input.reviewId,
        title: input.title,
        description: input.description,
        diff: input.diff,
        affectedFilesJson: JSON.stringify(input.affectedFiles),
        status: input.status ?? 'pending',
        priority: input.priority,
        authorId: input.authorId,
        claimedBy: input.claimedBy ?? null,
        claimedAt: input.claimedAt ?? null,
        claimGeneration: input.claimGeneration ?? 0,
        currentRound: input.currentRound ?? 1,
        latestVerdict: input.latestVerdict ?? null,
        verdictReason: input.verdictReason ?? null,
        counterPatchStatus: input.counterPatchStatus ?? 'none',
        counterPatchDecisionActorId: input.counterPatchDecisionActorId ?? null,
        counterPatchDecisionNote: input.counterPatchDecisionNote ?? null,
        counterPatchDecidedAt: input.counterPatchDecidedAt ?? null,
        lastMessageAt: input.lastMessageAt ?? null,
        lastActivityAt: input.lastActivityAt ?? input.updatedAt,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      });

      const review = getById(input.reviewId);

      if (!review) {
        throw new Error(`Inserted review ${input.reviewId} could not be reloaded.`);
      }

      return review;
    },

    getById,

    list(options = {}) {
      const clauses: string[] = [];
      const params: Record<string, ReviewStatus | number> = {};

      if (options.status) {
        clauses.push('status = @status');
        params.status = options.status;
      }

      const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const limitClause = options.limit ? 'LIMIT @limit' : '';

      if (options.limit) {
        params.limit = options.limit;
      }

      const rows = db
        .prepare<unknown[], ReviewRow>(`
          SELECT
            ${REVIEW_SELECT_COLUMNS}
          FROM reviews
          ${whereClause}
          ORDER BY created_at DESC, review_id DESC
          ${limitClause}
        `)
        .all(params);

      return rows.map((row) => mapReviewSummaryRow(row));
    },

    countByStatus(status) {
      const row = db
        .prepare<{ status: ReviewStatus }, { count: number }>(`
          SELECT COUNT(*) as count FROM reviews WHERE status = @status
        `)
        .get({ status });

      return row?.count ?? 0;
    },

    updateState(input) {
      return updateAndReload(input);
    },

    recordVerdict(input) {
      return updateAndReload({
        reviewId: input.reviewId,
        updatedAt: input.updatedAt,
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.currentRound !== undefined ? { currentRound: input.currentRound } : {}),
        latestVerdict: input.verdict,
        verdictReason: input.reason,
        lastActivityAt: input.lastActivityAt ?? input.updatedAt,
      });
    },

    recordCounterPatchDecision(input) {
      return updateAndReload({
        reviewId: input.reviewId,
        updatedAt: input.updatedAt,
        counterPatchStatus: input.counterPatchStatus,
        counterPatchDecisionActorId: input.actorId ?? null,
        counterPatchDecisionNote: input.note ?? null,
        counterPatchDecidedAt: input.decidedAt,
        lastActivityAt: input.lastActivityAt ?? input.updatedAt,
      });
    },

    recordMessageActivity(input) {
      return updateAndReload({
        reviewId: input.reviewId,
        updatedAt: input.updatedAt,
        ...(input.currentRound !== undefined ? { currentRound: input.currentRound } : {}),
        lastMessageAt: input.lastMessageAt,
        lastActivityAt: input.lastActivityAt ?? input.updatedAt,
      });
    },

    getCounterPatchDecision(reviewId) {
      const row = getByIdStatement.get(reviewId);
      return row ? mapCounterPatchDecisionRow(row) : null;
    },
  };
}

function mapReviewRow(row: ReviewRow): ReviewRecord {
  return ReviewRecordSchema.parse({
    reviewId: row.review_id,
    title: row.title,
    description: row.description,
    diff: row.diff,
    affectedFiles: parseAffectedFiles(row.affected_files_json),
    status: row.status,
    priority: row.priority,
    authorId: row.author_id,
    claimedBy: row.claimed_by,
    claimedAt: row.claimed_at,
    claimGeneration: row.claim_generation,
    currentRound: row.current_round ?? 1,
    latestVerdict: row.latest_verdict,
    verdictReason: row.verdict_reason,
    counterPatchStatus: row.counter_patch_status ?? 'none',
    lastMessageAt: row.last_message_at,
    lastActivityAt: row.last_activity_at ?? row.updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapReviewSummaryRow(row: ReviewRow): ReviewSummary {
  return ReviewSummarySchema.parse({
    reviewId: row.review_id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    authorId: row.author_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    claimedBy: row.claimed_by,
    claimedAt: row.claimed_at,
    claimGeneration: row.claim_generation,
    currentRound: row.current_round ?? 1,
    latestVerdict: row.latest_verdict,
    verdictReason: row.verdict_reason,
    counterPatchStatus: row.counter_patch_status ?? 'none',
    lastMessageAt: row.last_message_at,
    lastActivityAt: row.last_activity_at ?? row.updated_at,
  });
}

function mapCounterPatchDecisionRow(row: ReviewRow): CounterPatchDecisionRecord {
  return {
    reviewId: row.review_id,
    status: row.counter_patch_status ?? 'none',
    actorId: row.counter_patch_decision_actor_id,
    note: row.counter_patch_decision_note,
    decidedAt: row.counter_patch_decided_at,
  };
}

function parseAffectedFiles(rawValue: string): string[] {
  const parsed = JSON.parse(rawValue) as unknown;

  return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
}
