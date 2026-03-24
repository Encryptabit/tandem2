import type Database from 'better-sqlite3';
import {
  ReviewDiscussionMessageSchema,
  type ReviewDiscussionMessage,
  type ReviewMessageAuthorRole,
} from 'review-broker-core';

interface MessageRow {
  message_id: number;
  review_id: string;
  author_id: string;
  author_role: ReviewMessageAuthorRole;
  round_number: number;
  body: string;
  created_at: string;
}

export interface StoredReviewMessage extends ReviewDiscussionMessage {
  roundNumber: number;
}

export interface InsertMessageInput {
  reviewId: string;
  actorId: string;
  authorRole: ReviewMessageAuthorRole;
  roundNumber: number;
  body: string;
  createdAt: string;
}

export interface ListMessagesOptions {
  roundNumber?: number;
  limit?: number;
}

export interface MessagesRepository {
  insert: (input: InsertMessageInput) => StoredReviewMessage;
  listForReview: (reviewId: string, options?: ListMessagesOptions) => StoredReviewMessage[];
  getLatestForReview: (reviewId: string) => StoredReviewMessage | null;
  getLatestForRound: (reviewId: string, roundNumber: number) => StoredReviewMessage | null;
}

const MESSAGE_SELECT_COLUMNS = `
  message_id,
  review_id,
  author_id,
  author_role,
  round_number,
  body,
  created_at
`;

export function createMessagesRepository(db: Database.Database): MessagesRepository {
  const insertStatement = db.prepare(`
    INSERT INTO messages (
      review_id,
      author_id,
      author_role,
      round_number,
      body,
      created_at
    ) VALUES (
      @reviewId,
      @actorId,
      @authorRole,
      @roundNumber,
      @body,
      @createdAt
    )
  `);

  const getByIdStatement = db.prepare<number[], MessageRow>(`
    SELECT
      ${MESSAGE_SELECT_COLUMNS}
    FROM messages
    WHERE message_id = ?
  `);

  function getLatestBySql(sql: string, params: Record<string, number | string>): StoredReviewMessage | null {
    const row = db.prepare<Record<string, number | string>, MessageRow>(sql).get(params);
    return row ? mapMessageRow(row) : null;
  }

  return {
    insert(input) {
      const result = insertStatement.run({
        reviewId: input.reviewId,
        actorId: input.actorId,
        authorRole: input.authorRole,
        roundNumber: input.roundNumber,
        body: input.body,
        createdAt: input.createdAt,
      });

      const message = getByIdStatement.get(Number(result.lastInsertRowid));

      if (!message) {
        throw new Error(`Inserted review message ${String(result.lastInsertRowid)} could not be reloaded.`);
      }

      return mapMessageRow(message);
    },

    listForReview(reviewId, options = {}) {
      const clauses = ['review_id = @reviewId'];
      const params: Record<string, number | string> = { reviewId };

      if (options.roundNumber !== undefined) {
        clauses.push('round_number = @roundNumber');
        params.roundNumber = options.roundNumber;
      }

      const limitClause = options.limit !== undefined ? 'LIMIT @limit' : '';
      if (options.limit !== undefined) {
        params.limit = options.limit;
      }

      const rows = db
        .prepare<Record<string, number | string>, MessageRow>(`
          SELECT
            ${MESSAGE_SELECT_COLUMNS}
          FROM messages
          WHERE ${clauses.join(' AND ')}
          ORDER BY created_at ASC, message_id ASC
          ${limitClause}
        `)
        .all(params);

      return rows.map((row) => mapMessageRow(row));
    },

    getLatestForReview(reviewId) {
      return getLatestBySql(
        `
          SELECT
            ${MESSAGE_SELECT_COLUMNS}
          FROM messages
          WHERE review_id = @reviewId
          ORDER BY created_at DESC, message_id DESC
          LIMIT 1
        `,
        { reviewId },
      );
    },

    getLatestForRound(reviewId, roundNumber) {
      return getLatestBySql(
        `
          SELECT
            ${MESSAGE_SELECT_COLUMNS}
          FROM messages
          WHERE review_id = @reviewId
            AND round_number = @roundNumber
          ORDER BY created_at DESC, message_id DESC
          LIMIT 1
        `,
        { reviewId, roundNumber },
      );
    },
  };
}

function mapMessageRow(row: MessageRow): StoredReviewMessage {
  const message = ReviewDiscussionMessageSchema.parse({
    messageId: row.message_id,
    reviewId: row.review_id,
    actorId: row.author_id,
    authorRole: row.author_role,
    body: row.body,
    createdAt: row.created_at,
  });

  return {
    ...message,
    roundNumber: row.round_number,
  };
}
