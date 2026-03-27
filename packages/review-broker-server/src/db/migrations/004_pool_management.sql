ALTER TABLE reviewers ADD COLUMN session_token TEXT;
ALTER TABLE reviewers ADD COLUMN draining_at TEXT;
CREATE INDEX IF NOT EXISTS idx_reviewers_session_token ON reviewers(session_token) WHERE session_token IS NOT NULL;
