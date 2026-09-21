# BugBridge — Portfolio Demo

BugBridge is a full-stack internal bug and product-feedback system built to reduce the friction between employees reporting software problems and QA/development teams investigating them.

This repository is a **portfolio-safe demo**. It uses generic branding, synthetic data, and demo-only identities. It contains no customer data, employee data, internal URLs, credentials, or company-specific deployment details.

## What it demonstrates

The project combines a Chrome extension, Node/Express API, PostgreSQL persistence, role-based access, workflow tooling, activity history, signed webhooks, Docker, and cloud deployment.

The employee-facing extension captures the current page, browser/OS context, viewport, timestamp, optional screenshot, issue type, impact, intent, and problem description. The reviewer dashboard provides search, filtering, assignment, internal notes, retest queues, status changes, account management, and persisted ticket history.

## QA workflow

Supported states:

```text
Open
Needs Info
In Review
In Development
Ready for Retest
Resolved
```

The workflow intentionally supports rework and reopening. Examples:

```text
In Review -> Needs Info -> In Review
Ready for Retest -> In Development
Resolved -> Open
```

Actual status changes are persisted in ticket activity and can emit signed `report.status_changed` webhooks.

## Collaboration and access

The dashboard supports:

- Reviewer and Admin roles
- deny-by-default access control
- invitation-only local demo accounts
- self-service display name/job title editing
- assignment, transfer, unassignment, and **Assign to me**
- All, My Tickets, Unassigned, and Needs Retest queues
- protection against removing/demoting the final Admin
- account/access audit history

The portfolio deployment uses synthetic accounts only. There is no public self-registration route.

## Persisted activity history

Each ticket can record:

```text
report.created
report.status_changed
report.assignee_changed
report.note_added
```

PostgreSQL mutations and their activity records are written transactionally. Legacy data is only backfilled when history can be reconstructed truthfully from stored timestamps, notes, or assignment data.

Reviewer/Admin API:

```text
GET /api/v1/reports/:id/activity
```

## Architecture

```text
Chrome Extension
      |
      v
Node / Express REST API
      |
      +---- PostgreSQL
      |       - tickets
      |       - notes
      |       - users/access
      |       - auth sessions/invites
      |       - activity history
      |
      +---- Screenshot/file storage
      |
      +---- Signed outbound webhooks
      |
      +---- Static reviewer/admin dashboard
```

Core technology:

- JavaScript / Node.js
- Express 5
- PostgreSQL
- REST + OpenAPI
- Docker
- Chrome Extension Manifest V3
- HMAC-SHA256 webhooks
- scrypt password hashing for demo accounts
- Railway-compatible deployment

For the deeper design rationale and deployment boundaries, see `docs/ARCHITECTURE.md` and `docs/INTEGRATION.md`.

## Testing strategy

The release candidate uses a repository-native feature test pass instead of requiring an external test-management platform. The checklist is organized around the actual product surface: startup/health, authentication, access and invitations, employee reporting, Chrome extension behavior, dashboard/search/filtering, workflow states, assignment, notes, activity, webhooks, multi-user behavior, API documentation, portfolio safety, accessibility, and final release gating.

Manual release checklist:

```text
tests/INTERNAL_FEATURE_TEST_PASS.md
```

Automated deployment smoke coverage:

```bash
cd backend
npm run smoke
```

Synthetic demo data:

```bash
cd backend
npm run seed:demo
```

The final portfolio release requires both the automated smoke pass and a short manual critical-path pass against the deployed environment.

## Local development

Backend:

```bash
cd backend
npm install
npm run dev
```

Docker demo:

```bash
docker compose up --build -d
```

Stop without deleting persistent data:

```bash
docker compose down
```

Do not use `docker compose down -v` unless you intentionally want to delete the demo database and stored files.

Useful local URLs:

```text
http://localhost:8787/login.html
http://localhost:8787/
http://localhost:8787/account.html
http://localhost:8787/access.html
http://localhost:8787/api/docs
http://localhost:8787/health
```

## Configuration

Use `backend/.env.example` as the reference. Secrets belong in environment variables and are never committed.

For hosted local-account mode, the important settings are:

```text
DATABASE_URL=<managed PostgreSQL URL>
IDENTITY_MODE=local_account
ENFORCE_IDENTITY_DOMAIN=false
LOCAL_AUTH_SECURE_COOKIE=true
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_NAME=Portfolio Demo Admin
LOCAL_AUTH_BOOTSTRAP_PASSWORD=<secret supplied in hosting environment>
PUBLIC_BASE_URL=<deployed HTTPS URL>
```

SMTP and outbound webhooks are optional for the public demo.

## Railway deployment

The repository contains `backend/railway.json`. Railway should use `backend` as the service root. Startup runs migrations before starting the application:

```text
npm run migrate && npm start
```

The deployment health check is:

```text
/health
```

A PostgreSQL service and persistent file volume are recommended for the hosted demo.

## Repository structure

```text
bugbridge/
├── extension/
├── backend/
│   ├── migrations/
│   ├── public/
│   ├── scripts/
│   └── src/
├── docs/
├── tests/
├── docker-compose.yml
└── README.md
```

## Documentation

- `docs/ARCHITECTURE.md` — current system architecture and hosted deployment model
- `docs/INTEGRATION.md` — API and replaceable integration boundaries
- `docs/ACCESS_CONTROL.md` — Reviewer/Admin access model and identity boundary
- `docs/LOCAL_AUTH_TESTING.md` — invitation-only demo account behavior
- `docs/COLLABORATION.md` — profiles, assignment, and work queues
- `docs/TICKET_ACTIVITY.md` — persisted ticket history
- `docs/WORKFLOW_STATES.md` — six-state QA workflow
- `docs/WEBHOOKS.md` — signed webhook contract
- `docs/PORTFOLIO_DEMO.md` — portfolio deployment/release guide
- `docs/ROADMAP.md` — release status and deferred work
- `tests/INTERNAL_FEATURE_TEST_PASS.md` — canonical manual release test pass

## Security / portfolio boundary

This public repository is intentionally separated from any work-integrated deployment. Public demonstrations should use only synthetic tickets, synthetic users, and non-sensitive screenshots.

The local email/password account system is demo/test infrastructure rather than a claim of production identity architecture. The code keeps authentication behind a replaceable identity-provider boundary so a real deployment can use an organization's existing SSO or trusted gateway instead.

## Current release

**v0.6.7 portfolio release**

Implemented foundations include employee reporting, shared PostgreSQL ticketing, six-state QA workflow, assignment, profiles, access control, invitation-only demo accounts, persisted activity, signed webhooks, Docker, OpenAPI, automated smoke coverage, synthetic demo data, and Railway deployment configuration.

Validation includes automated smoke coverage, a feature-based manual test pass, dependency auditing, and portfolio-safety checks.
