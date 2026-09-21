# BugBridge — Collaboration Workflow

BugBridge supports a multi-user reviewer/developer workflow built around explicit access, profiles, assignment, and shared ticket ownership.

## User profiles

Authorized Reviewers and Admins can open:

```text
/account.html
```

The account page shows:

- account email
- BugBridge role
- identity source
- date access was granted
- display name
- job title

Users may edit their own `displayName` and `jobTitle` through:

```text
GET   /api/v1/me
PATCH /api/v1/me
```

They cannot change their own email or Reviewer/Admin role. Role changes remain Admin-only.

Profile updates are recorded in `audit_events`.

## Ticket assignment and transfer

Every report can be:

- unassigned
- assigned to an active Reviewer
- assigned to an active Admin
- transferred from one authorized user to another

Assignable users are retrieved through:

```text
GET /api/v1/collaborators
```

Assignments are changed through:

```text
PATCH /api/v1/reports/:id/assignee
```

Example:

```json
{
  "assigneeEmail": "developer@example.com"
}
```

To unassign:

```json
{
  "assigneeEmail": null
}
```

The ticket stores:

```text
assigned_to_email
assigned_at
assigned_by
```

The dashboard displays assignee information on ticket cards and ticket details and includes an Assignee filter.

If a Reviewer/Admin loses BugBridge access, the PostgreSQL foreign key clears active ticket assignments to that access entry while persisted activity history remains available.

## Work queues

The dashboard provides four shortcuts:

```text
All queue
My tickets
Unassigned queue
Needs retest
```

`My tickets` filters to the current authenticated user. `Unassigned queue` isolates tickets with no owner. `Needs retest` filters to tickets in `Ready for Retest`.

The `Assign to me` action assigns the current ticket to the logged-in Reviewer/Admin without requiring the assignee dropdown.

## Assignment activity and webhooks

Assignment changes create persisted:

```text
report.assignee_changed
```

activity events containing actor and assignment metadata.

When outbound webhooks are enabled, assignment changes use the same event name and the shared signed-webhook HMAC, retry, timestamp, and delivery-ID contract.

No-op assignment changes should not create duplicate activity or duplicate webhook events.

## Chrome extension reporting boundary

Employee-facing report submission remains separate from Reviewer/Admin dashboard authorization. The extension can submit a Bug or Suggestion without granting the reporter dashboard access.

The submitted report preview is rendered as a read-only report block and the popup owns vertical scrolling, avoiding a nested report scrollbar.

## Database schema

Migration:

```text
003_profiles_and_assignment.sql
```

adds:

```text
bugbridge_access.job_title
reports.assigned_to_email
reports.assigned_at
reports.assigned_by
```

Migration:

```text
005_ticket_activity.sql
```

adds persisted assignment activity along with the rest of the ticket event timeline.

## Release validation

Current collaboration coverage is maintained in:

```text
tests/INTERNAL_FEATURE_TEST_PASS.md
```

The most important collaboration checks are assignment, transfer, unassignment, `Assign to me`, My Tickets, Unassigned Queue, Assigned By metadata, access removal, multi-user visibility, no-op behavior, activity persistence, and restart persistence.
