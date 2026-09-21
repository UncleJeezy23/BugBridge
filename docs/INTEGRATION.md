# BugBridge — Integration Guide

## Goal

BugBridge keeps the Chrome extension, reviewer dashboard, storage, authentication, and outbound integrations behind stable boundaries so the application can run locally or on a cloud host without being tied to one provider.

This portfolio branch uses synthetic identities and generic configuration only.

## Current milestone

**v0.6.7 — Expanded QA workflow**

Core integration surfaces:

```text
/api/v1
/api/docs
/api/openapi.json
```

## Extension connection

The extension stores a configurable backend base URL and submits reports to:

```text
<base-url>/api/v1/reports
```

Employee submission remains separate from Reviewer/Admin dashboard authorization so reporting stays low-friction.

## Persistence and migrations

The backend supports lightweight file mode when `DATABASE_URL` is blank and PostgreSQL mode for shared/multi-user use.

Current migrations:

```text
001_initial.sql
002_access_control.sql
003_profiles_and_assignment.sql
004_local_accounts.sql
005_ticket_activity.sql
```

Hosted startup should apply migrations before starting the server:

```text
npm run migrate && npm start
```

## Activity and webhooks

Persisted ticket activity currently includes:

```text
report.created
report.status_changed
report.assignee_changed
report.note_added
```

The same event names are available for optional HMAC-SHA256 signed outbound webhooks. Ticket persistence does not depend on webhook delivery.

## Identity boundary

Supported identity modes:

```text
IDENTITY_MODE=disabled
IDENTITY_MODE=demo
IDENTITY_MODE=local_account
IDENTITY_MODE=upstream_header
```

`local_account` is useful for a portfolio/demo deployment with invitation-only synthetic accounts. `upstream_header` represents an integration boundary for a trusted authenticated gateway. A production implementation can replace the identity adapter with OIDC/JWT/session/SSO logic while retaining the same authorization and workflow data.

There is no public self-registration route.

## Assignment workflow

Reviewer/Admin users can assign, transfer, and unassign tickets through:

```text
GET   /api/v1/collaborators
PATCH /api/v1/reports/:id/assignee
```

The dashboard provides All Queue, My Tickets, Unassigned Queue, Needs Retest, and Assign to me workflows.

## Railway deployment

For the portfolio demo, Railway should use `backend` as the service root. The included `backend/railway.json` runs migrations before application startup and checks `/health`.

Recommended hosted services:

```text
Node/Express web service
Managed PostgreSQL
Persistent volume mounted for screenshots/files
```

Important hosted variables:

```text
PORT=8787
PUBLIC_BASE_URL=<public HTTPS URL>
DATABASE_URL=<managed PostgreSQL URL>
DATABASE_SSL=false
STORAGE_ROOT=/data
IDENTITY_MODE=local_account
ALLOWED_IDENTITY_DOMAIN=example.com
ENFORCE_IDENTITY_DOMAIN=false
LOCAL_AUTH_SECURE_COOKIE=true
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_NAME=Portfolio Demo Admin
LOCAL_AUTH_BOOTSTRAP_PASSWORD=<hosting secret>
```

SMTP and webhook configuration are optional.

## Security boundary

Secrets must be injected through the deployment environment and never committed. The public demo should contain only synthetic accounts, tickets, URLs, screenshots, and email addresses.

The local password provider is demo/test infrastructure. Any real production deployment retaining cookie/password authentication would require production-grade origin restrictions, CSRF review, rate limiting, TLS/Secure cookies, recovery policy, secret management, monitoring, and automated authentication tests.
