CREATE TABLE IF NOT EXISTS bugbridge_access (
  email TEXT PRIMARY KEY,
  display_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('Reviewer', 'Admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bugbridge_access_role ON bugbridge_access(role);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_email TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor_email ON audit_events(actor_email);
