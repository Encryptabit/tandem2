ALTER TABLE reviews ADD COLUMN current_round INTEGER NOT NULL DEFAULT 1;
ALTER TABLE reviews ADD COLUMN latest_verdict TEXT;
ALTER TABLE reviews ADD COLUMN verdict_reason TEXT;
ALTER TABLE reviews ADD COLUMN counter_patch_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE reviews ADD COLUMN counter_patch_decision_actor_id TEXT;
ALTER TABLE reviews ADD COLUMN counter_patch_decision_note TEXT;
ALTER TABLE reviews ADD COLUMN counter_patch_decided_at TEXT;
ALTER TABLE reviews ADD COLUMN last_message_at TEXT;
ALTER TABLE reviews ADD COLUMN last_activity_at TEXT;

ALTER TABLE messages ADD COLUMN author_role TEXT NOT NULL DEFAULT 'system';
ALTER TABLE messages ADD COLUMN round_number INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_messages_review_round_created_at
  ON messages(review_id, round_number, created_at ASC, message_id ASC);
