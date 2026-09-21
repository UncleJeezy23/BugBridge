# BugBridge — Expanded QA Workflow

## v0.6.7 purpose

v0.6.7 expands ticket status from the original three-state model into a lightweight QA/development lifecycle without introducing a heavyweight issue-tracker state machine.

Supported states:

```text
Open
Needs Info
In Review
In Development
Ready for Retest
Resolved
```

The API validator, dashboard controls, summary filters, work-queue shortcuts, activity history, webhook payloads, and PostgreSQL status constraint all use this expanded set.

## Database compatibility

Existing PostgreSQL databases created by `001_initial.sql` originally allowed only:

```text
Open
In Review
Resolved
```

Migration:

```text
006_expand_report_statuses.sql
```

replaces the original `reports_status_check` constraint with one that permits all six v0.6.7 workflow states.

This migration must run before exercising the expanded workflow against PostgreSQL. The Railway deployment configuration runs migrations before application startup.

## Intended meaning

### Open

Newly submitted or reopened work that has not yet entered active review/development.

### Needs Info

The team cannot continue until additional information, clarification, reproduction details, access, or another dependency is provided.

### In Review

A Reviewer/QA user is triaging, reproducing, investigating, or validating the report.

### In Development

The issue or improvement is actively being implemented/fixed by development.

### Ready for Retest

Development work is believed complete and the ticket is waiting for QA/reviewer validation.

### Resolved

The ticket is complete, verified, closed, or otherwise no longer requires active work.

## Transition policy

v0.6.7 intentionally does **not** enforce a rigid transition graph.

Reviewers can move a ticket between any supported states. This allows the workflow to be validated in practice before adding restrictions that may create unnecessary friction.

Examples of useful transitions include:

```text
Open -> In Review
Open -> Needs Info
In Review -> In Development
In Review -> Needs Info
Needs Info -> In Review
In Development -> Ready for Retest
Ready for Retest -> In Development
Ready for Retest -> Resolved
Resolved -> Open
```

Every actual status change creates a persisted `report.status_changed` ticket activity event containing the previous and new values. Selecting the current status again should not create duplicate activity.

## Dashboard behavior

The dashboard summary includes counters/filters for all six statuses plus All.

The work-queue bar includes:

```text
All queue
My tickets
Unassigned queue
Needs retest
```

**Needs retest** is a shortcut for:

```text
Status = Ready for Retest
Assignee = All
```

The ordinary status summary buttons remain available for all other workflow states.

## Webhook behavior

Status transitions continue to use:

```text
report.status_changed
```

The event payload contains the exact previous/current strings, including the expanded states. No new webhook event type is required merely because the allowed status values expanded.

## Release QA

The canonical release validation is maintained in:

```text
tests/INTERNAL_FEATURE_TEST_PASS.md
```

For workflow-specific validation, exercise the complete lifecycle at least once:

```text
Open
-> Needs Info
-> In Review
-> In Development
-> Ready for Retest
-> Resolved
-> Open
```

Verify status persistence, summary counts, filtering, activity history, reverse/rework transitions, and the Needs Retest queue. When webhooks are configured, also verify each real transition emits one matching `report.status_changed` event and that no-op changes emit none.

## Future workflow candidates

After release validation, possible additions include:

- internal Priority separate from employee-reported Impact
- Recently Updated queue
- optional Assigned by Me view
- optimistic concurrency/version checks for simultaneous edits
- activity filtering/collapse for long-lived tickets
