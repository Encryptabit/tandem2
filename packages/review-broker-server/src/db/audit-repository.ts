import type Database from 'better-sqlite3';
import { ReviewActivityEntrySchema, type AuditEventType, type ReviewActivityEntry, type ReviewStatus } from 'review-broker-core';

interface AuditEventRow {
  audit_event_id: number;
  review_id: string | null;
  event_type: AuditEventType;
  actor_id: string | null;
  status_from: ReviewStatus | null;
  status_to: ReviewStatus | null;
  error_code: string | null;
  metadata_json: string;
  created_at: string;
}

export interface AuditEventRecord {
  auditEventId: number;
  reviewId: string | null;
  eventType: AuditEventType;
  actorId: string | null;
  statusFrom: ReviewStatus | null;
  statusTo: ReviewStatus | null;
  errorCode: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AppendAuditEventInput {
  reviewId?: string | null;
  eventType: AuditEventType;
  actorId?: string | null;
  statusFrom?: ReviewStatus | null;
  statusTo?: ReviewStatus | null;
  errorCode?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ListActivityOptions {
  limit?: number;
}

export interface AuditRepository {
  append: (input: AppendAuditEventInput) => AuditEventRecord;
  listForReview: (reviewId: string) => AuditEventRecord[];
  listActivityForReview: (reviewId: string, options?: ListActivityOptions) => ReviewActivityEntry[];
  getLatestForReview: (reviewId: string) => AuditEventRecord | null;
}

const AUDIT_SELECT_COLUMNS = `
  audit_event_id,
  review_id,
  event_type,
  actor_id,
  status_from,
  status_to,
  error_code,
  metadata_json,
  created_at
`;

export function createAuditRepository(db: Database.Database): AuditRepository {
  const insertStatement = db.prepare(`
    INSERT INTO audit_events (
      review_id,
      event_type,
      actor_id,
      status_from,
      status_to,
      error_code,
      metadata_json,
      created_at
    ) VALUES (
      @reviewId,
      @eventType,
      @actorId,
      @statusFrom,
      @statusTo,
      @errorCode,
      @metadataJson,
      @createdAt
    )
  `);

  const getByIdStatement = db.prepare<number[], AuditEventRow>(`
    SELECT
      ${AUDIT_SELECT_COLUMNS}
    FROM audit_events
    WHERE audit_event_id = ?
  `);

  return {
    append(input) {
      const result = insertStatement.run({
        reviewId: input.reviewId ?? null,
        eventType: input.eventType,
        actorId: input.actorId ?? null,
        statusFrom: input.statusFrom ?? null,
        statusTo: input.statusTo ?? null,
        errorCode: input.errorCode ?? null,
        metadataJson: JSON.stringify(input.metadata ?? {}),
        createdAt: input.createdAt,
      });

      const auditEvent = getByIdStatement.get(Number(result.lastInsertRowid));

      if (!auditEvent) {
        throw new Error(`Inserted audit event ${String(result.lastInsertRowid)} could not be reloaded.`);
      }

      return mapAuditEventRow(auditEvent);
    },

    listForReview(reviewId) {
      const rows = db
        .prepare<string[], AuditEventRow>(`
          SELECT
            ${AUDIT_SELECT_COLUMNS}
          FROM audit_events
          WHERE review_id = ?
          ORDER BY created_at ASC, audit_event_id ASC
        `)
        .all(reviewId);

      return rows.map((row) => mapAuditEventRow(row));
    },

    listActivityForReview(reviewId, options = {}) {
      const params: Record<string, number | string> = { reviewId };

      const rows = options.limit
        ? db
            .prepare<Record<string, number | string>, AuditEventRow>(`
              SELECT
                ${AUDIT_SELECT_COLUMNS}
              FROM (
                SELECT
                  ${AUDIT_SELECT_COLUMNS}
                FROM audit_events
                WHERE review_id = @reviewId
                ORDER BY created_at DESC, audit_event_id DESC
                LIMIT @limit
              )
              ORDER BY created_at ASC, audit_event_id ASC
            `)
            .all({ ...params, limit: options.limit })
        : db
            .prepare<Record<string, number | string>, AuditEventRow>(`
              SELECT
                ${AUDIT_SELECT_COLUMNS}
              FROM audit_events
              WHERE review_id = @reviewId
              ORDER BY created_at ASC, audit_event_id ASC
            `)
            .all(params);

      return rows
        .map((row) => mapActivityRow(row))
        .filter((entry): entry is ReviewActivityEntry => entry !== null);
    },

    getLatestForReview(reviewId) {
      const row = db
        .prepare<string[], AuditEventRow>(`
          SELECT
            ${AUDIT_SELECT_COLUMNS}
          FROM audit_events
          WHERE review_id = ?
          ORDER BY created_at DESC, audit_event_id DESC
          LIMIT 1
        `)
        .get(reviewId);

      return row ? mapAuditEventRow(row) : null;
    },
  };
}

function mapAuditEventRow(row: AuditEventRow): AuditEventRecord {
  return {
    auditEventId: row.audit_event_id,
    reviewId: row.review_id,
    eventType: row.event_type,
    actorId: row.actor_id,
    statusFrom: row.status_from,
    statusTo: row.status_to,
    errorCode: row.error_code,
    metadata: parseMetadata(row.metadata_json),
    createdAt: row.created_at,
  };
}

function mapActivityRow(row: AuditEventRow): ReviewActivityEntry | null {
  if (!row.review_id) {
    return null;
  }

  const metadata = parseMetadata(row.metadata_json);
  const summary = typeof metadata.summary === 'string' && metadata.summary.trim().length > 0 ? metadata.summary : null;

  return ReviewActivityEntrySchema.parse({
    auditEventId: row.audit_event_id,
    reviewId: row.review_id,
    eventType: row.event_type,
    actorId: row.actor_id,
    statusFrom: row.status_from,
    statusTo: row.status_to,
    errorCode: row.error_code,
    summary,
    metadata,
    createdAt: row.created_at,
  });
}

function parseMetadata(rawValue: string): Record<string, unknown> {
  const parsed = JSON.parse(rawValue) as unknown;
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}
