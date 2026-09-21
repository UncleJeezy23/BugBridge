# BugBridge — Architecture

BugBridge is structured as a portable internal QA/development feedback system with a lightweight employee reporting surface and a richer reviewer/developer workflow.

## System overview

```text
Employee
   |
   v
Chrome Extension
   |  Bug / Suggestion
   |  Page + browser context
   |  Optional screenshot
   v
Versioned REST API (/api/v1)
   |
   +--> PostgreSQL
   |      - reports
   |      - notes
   |      - access / profiles
   |      - local demo accounts
   |      - invitations / sessions
   |      - ticket activity
   |
   +--> Screenshot storage
   |
   +--> Optional signed webhooks
   |
   v
Reviewer / Admin Dashboard
   |  Search + filters
   |  Assignment / transfer
   |  Six-state workflow
   |  Needs Retest queue
   |  Internal notes
   |  Persisted activity timeline
   v
QA / Development collaboration
```

## Front-end surfaces

### Chrome extension

The Manifest V3 extension is optimized for low-friction reporting. It captures:

- Bug or Suggestion type
- user intent
- problem or improvement description
- impact
- full page URL and title
- browser / operating system context
- viewport and screen dimensions
- client timestamp
- optional screenshot

The backend URL is configurable so the same extension can point to local, test, or hosted environments without rewriting submission logic.

### Reviewer/Admin dashboard

The dashboard is served by the backend as static assets and consumes the same `/api/v1` API used by integrations.

Current workflow states:

```text
Open
Needs Info
In Review
In Development
Ready for Retest
Resolved
```

The workflow remains intentionally flexible, supporting rework and reopening rather than enforcing a rigid state graph.

## Backend

The backend is a Node.js / Express service responsible for:

- report validation
- BUG ticket ID generation
- PostgreSQL persistence
- screenshot storage
- authentication and authorization boundaries
- ticket assignment and notes
- activity history
- optional SMTP delivery
- optional signed outbound webhooks
- OpenAPI / Swagger documentation

API routes are versioned under:

```text
/api/v1
```

The service also exposes:

```text
/health
/api/docs
/api/openapi.json
```

## Data layer

PostgreSQL is the shared multi-user data store. Versioned SQL migrations are applied before hosted service startup.

Current migrations:

```text
001_initial.sql
002_access_control.sql
003_profiles_and_assignment.sql
004_local_accounts.sql
005_ticket_activity.sql
006_expand_report_statuses.sql
```

Migration 006 updates the original report-status constraint so all six workflow states are valid in PostgreSQL.

The repository layer also retains a lightweight local file fallback when `DATABASE_URL` is not configured.

## Authentication and authorization

Identity and authorization are separated deliberately.

```text
Identity provider
      |
      v
Verified identity
      |
      v
BugBridge access list
      |
 Reviewer / Admin
```

Supported identity modes include local development bypass, fixed demo identity, invitation-only local demo accounts, and a trusted upstream-header adapter boundary.

The public portfolio environment uses only synthetic demo identities. A real organizational deployment can replace the identity adapter without changing ticket workflow, profiles, assignments, or activity history.

## Ticket activity

Meaningful workflow mutations persist as ticket events:

```text
report.created
report.status_changed
report.assignee_changed
report.note_added
```

In PostgreSQL mode, ticket mutations and their corresponding activity events are written transactionally where applicable. Actor name/email snapshots preserve historical context even if a user's profile or access later changes.

## Webhooks

Outbound webhooks are optional and provider-neutral. They use HMAC-SHA256 signatures, stable delivery IDs, timestamps, configurable subscriptions, and retry attempts.

Webhook delivery is asynchronous and independent from ticket persistence, so integration outages do not block or erase ticket workflow changes.

## Deployment model

The portfolio demo is designed to run as:

```text
GitHub
   |
   v
Railway application service
   |
   +--> Railway PostgreSQL
   +--> persistent screenshot volume
   v
Public HTTPS demo URL
```

The service root is `backend/`. Railway runs migrations before starting the Express server and checks `/health` during deployment.

The architecture is provider-neutral: Docker, standard environment variables, PostgreSQL, REST, and filesystem/object-storage boundaries keep the application portable.

## Security boundaries

The portfolio branch contains only generic branding, synthetic identities, synthetic tickets, and non-sensitive examples.

Secrets are environment-only and excluded from Git. The invitation/password implementation is intentionally treated as demo/test infrastructure rather than a production identity recommendation. Production hardening would include organization-approved identity, restricted origins, rate limiting, CSRF/session review, secure cookies, managed secrets, durable attachment storage, monitoring, and automated security regression coverage.
