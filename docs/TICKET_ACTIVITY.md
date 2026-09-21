# BugBridge — Ticket Activity Timeline

The ticket activity timeline provides a persisted chronological history of meaningful ticket workflow changes.

It is intentionally separate from the Admin access/account audit log: `audit_events` records platform and access administration, while `ticket_events` records work performed on a specific report.

## Event types

Current ticket activity events:

```text
report.created
report.status_changed
report.assignee_changed
report.note_added
```

The event model is intentionally extensible so future workflow events, such as priority changes, can be added without redesigning the table.

## Database

Migration:

```text
005_ticket_activity.sql
```

adds the `ticket_events` table.

Each event stores:

```text
id
report_id
event_type
actor_email
actor_name
metadata (JSONB)
created_at
```

Actor identity is stored as a snapshot so historical activity remains understandable even if a user later changes their profile or loses access.

## Transactional behavior

In PostgreSQL mode, creation, status, assignment, and note activity is persisted with the corresponding ticket mutation. This prevents a successful workflow change from silently losing its history record because of a separate write failure.

## Existing-ticket backfill

Migration 005 backfills only history that can be reconstructed from previously persisted data:

- ticket creation
- existing internal notes
- the last known status change when `status_updated_at` exists
- the stored assignment when `assigned_at` exists

Backfilled records include:

```json
{
  "backfilled": true
}
```

The UI labels those records **Historical**. The migration does not invent intermediate transitions that were never recorded.

## API

Reviewer/Admin endpoint:

```text
GET /api/v1/reports/:id/activity
```

Example response:

```json
{
  "ok": true,
  "reportId": "BUG-20260901-A1B2C3",
  "events": [
    {
      "id": "uuid",
      "reportId": "BUG-20260901-A1B2C3",
      "type": "report.status_changed",
      "actorEmail": "reviewer@example.com",
      "actorName": "Demo Reviewer",
      "metadata": {
        "previousStatus": "In Development",
        "status": "Ready for Retest"
      },
      "createdAt": "2026-09-01T22:00:00.000Z"
    }
  ]
}
```

## Dashboard behavior

Ticket detail includes an **Activity** section ahead of Internal Notes. The timeline updates when the selected ticket changes and refreshes periodically while the page is visible, allowing activity from another reviewer to appear without a full page reload.

Representative timeline entries include:

```text
Ticket submitted
Bug · Makes work difficult
Employee reporter

Status changed
In Development → Ready for Retest
Demo Developer

Ticket transferred
Demo Developer → Demo Reviewer
Demo Admin

Internal note added
Retest passed in the latest build.
Demo Reviewer
```

## Workflow integration

All six current workflow states can appear in status-change metadata:

```text
Open
Needs Info
In Review
In Development
Ready for Retest
Resolved
```

Selecting the current status again is treated as a no-op and should not create duplicate activity.

Assignment no-ops follow the same principle.

## QA coverage

Canonical release coverage lives in:

```text
tests/INTERNAL_FEATURE_TEST_PASS.md
```

The activity-specific checks verify that creation/status/assignment/note events are written correctly, actors are attributed correctly, no-op changes do not create duplicates, backfilled events are marked truthfully, activity survives restart, and updates become visible across authenticated browser sessions.
