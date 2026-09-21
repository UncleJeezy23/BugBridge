CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('Bug', 'Suggestion')),
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In Review', 'Resolved')),
  intent TEXT NOT NULL,
  problem TEXT NOT NULL,
  impact TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  page_title TEXT NOT NULL DEFAULT '',
  browser TEXT NOT NULL DEFAULT '',
  os TEXT NOT NULL DEFAULT '',
  viewport TEXT NOT NULL DEFAULT '',
  screen TEXT NOT NULL DEFAULT '',
  client_timestamp TIMESTAMPTZ,
  screenshot_stored BOOLEAN NOT NULL DEFAULT FALSE,
  screenshot_filename TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status_updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reports_created_at_idx ON reports (created_at DESC);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports (status);
CREATE INDEX IF NOT EXISTS reports_type_idx ON reports (type);
CREATE INDEX IF NOT EXISTS reports_impact_idx ON reports (impact);
CREATE INDEX IF NOT EXISTS notes_report_id_idx ON notes (report_id, created_at);
