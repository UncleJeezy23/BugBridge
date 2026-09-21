-- Expand the reports.status constraint for the v0.6.7 QA workflow.
-- Existing databases created by 001_initial.sql still carry the original
-- Open / In Review / Resolved CHECK constraint.

ALTER TABLE reports
  DROP CONSTRAINT IF EXISTS reports_status_check;

ALTER TABLE reports
  ADD CONSTRAINT reports_status_check
  CHECK (status IN (
    'Open',
    'Needs Info',
    'In Review',
    'In Development',
    'Ready for Retest',
    'Resolved'
  ));
