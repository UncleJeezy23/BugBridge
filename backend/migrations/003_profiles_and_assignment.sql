ALTER TABLE bugbridge_access
  ADD COLUMN IF NOT EXISTS job_title TEXT;

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS assigned_to_email TEXT REFERENCES bugbridge_access(email) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_by TEXT;

CREATE INDEX IF NOT EXISTS idx_reports_assigned_to_email ON reports(assigned_to_email);
