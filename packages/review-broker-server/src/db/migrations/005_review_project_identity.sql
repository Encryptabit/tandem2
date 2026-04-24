ALTER TABLE reviews ADD COLUMN workspace_root TEXT;
ALTER TABLE reviews ADD COLUMN project_name TEXT;

CREATE INDEX IF NOT EXISTS idx_reviews_project_updated_at
  ON reviews(project_name, updated_at DESC);
