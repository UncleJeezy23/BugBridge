CREATE TABLE IF NOT EXISTS ticket_events (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_email TEXT,
  actor_name TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_events_report_created
  ON ticket_events(report_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_ticket_events_type
  ON ticket_events(event_type);

-- Backfill only activity that can be reconstructed truthfully from existing persisted data.
INSERT INTO ticket_events (id, report_id, event_type, actor_email, actor_name, metadata, created_at)
SELECT
  'backfill-created-' || r.id,
  r.id,
  'report.created',
  NULL,
  'Employee reporter',
  jsonb_build_object(
    'type', r.type,
    'impact', r.impact,
    'backfilled', true
  ),
  r.created_at
FROM reports r
ON CONFLICT (id) DO NOTHING;

INSERT INTO ticket_events (id, report_id, event_type, actor_email, actor_name, metadata, created_at)
SELECT
  'backfill-note-' || n.id,
  n.report_id,
  'report.note_added',
  NULL,
  n.author,
  jsonb_build_object(
    'noteId', n.id,
    'text', n.text,
    'backfilled', true
  ),
  n.created_at
FROM notes n
ON CONFLICT (id) DO NOTHING;

INSERT INTO ticket_events (id, report_id, event_type, actor_email, actor_name, metadata, created_at)
SELECT
  'backfill-status-' || r.id,
  r.id,
  'report.status_changed',
  NULL,
  'Historical activity',
  jsonb_build_object(
    'previousStatus', NULL,
    'status', r.status,
    'backfilled', true
  ),
  r.status_updated_at
FROM reports r
WHERE r.status_updated_at IS NOT NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO ticket_events (id, report_id, event_type, actor_email, actor_name, metadata, created_at)
SELECT
  'backfill-assignment-' || r.id,
  r.id,
  'report.assignee_changed',
  r.assigned_by,
  COALESCE(actor.display_name, r.assigned_by, 'Historical activity'),
  jsonb_build_object(
    'previousAssignee', NULL,
    'assignee', jsonb_build_object(
      'email', r.assigned_to_email,
      'displayName', COALESCE(assignee.display_name, r.assigned_to_email),
      'jobTitle', assignee.job_title
    ),
    'backfilled', true
  ),
  r.assigned_at
FROM reports r
LEFT JOIN bugbridge_access assignee ON assignee.email = r.assigned_to_email
LEFT JOIN bugbridge_access actor ON actor.email = r.assigned_by
WHERE r.assigned_to_email IS NOT NULL
  AND r.assigned_at IS NOT NULL
ON CONFLICT (id) DO NOTHING;
