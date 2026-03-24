CREATE TABLE IF NOT EXISTS reviewers (
  reviewer_id TEXT PRIMARY KEY,
  command TEXT NOT NULL,
  args_json TEXT NOT NULL DEFAULT '[]',
  cwd TEXT,
  pid INTEGER,
  started_at TEXT,
  last_seen_at TEXT,
  offline_at TEXT,
  offline_reason TEXT,
  exit_code INTEGER,
  exit_signal TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reviewers_updated_at
  ON reviewers(updated_at DESC, reviewer_id ASC);

CREATE INDEX IF NOT EXISTS idx_reviewers_offline_at
  ON reviewers(offline_at DESC, reviewer_id ASC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reviewers_pid_active
  ON reviewers(pid)
  WHERE pid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reviews_claimed_by_status_updated_at
  ON reviews(claimed_by, status, updated_at DESC, review_id DESC);
