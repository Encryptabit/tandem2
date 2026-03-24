CREATE TABLE IF NOT EXISTS reviews (
  review_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  diff TEXT NOT NULL,
  affected_files_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  author_id TEXT NOT NULL,
  claimed_by TEXT,
  claimed_at TEXT,
  claim_generation INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reviews_status_updated_at
  ON reviews(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  message_id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (review_id) REFERENCES reviews(review_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_review_created_at
  ON messages(review_id, created_at ASC);

CREATE TABLE IF NOT EXISTS audit_events (
  audit_event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id TEXT,
  event_type TEXT NOT NULL,
  actor_id TEXT,
  status_from TEXT,
  status_to TEXT,
  error_code TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (review_id) REFERENCES reviews(review_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_audit_events_review_created_at
  ON audit_events(review_id, created_at DESC);
