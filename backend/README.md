# BugBridge Backend + Dashboard

Node/Express backend and shared reviewer dashboard for the BugBridge portfolio demo.

## Current capabilities

- versioned REST API under `/api/v1`
- PostgreSQL persistence with versioned migrations
- file-store fallback for lightweight local development
- six-state QA workflow
- persisted activity history
- Reviewer/Admin authorization
- invitation-only demo accounts
- profiles and ticket assignment
- internal notes
- screenshot storage/review
- signed outbound webhooks
- Swagger/OpenAPI documentation
- Railway-compatible deployment

## Key endpoints

```text
GET    /health
GET    /api/v1/reports
POST   /api/v1/reports
GET    /api/v1/reports/:id
GET    /api/v1/reports/:id/activity
GET    /api/v1/reports/:id/screenshot
PATCH  /api/v1/reports/:id/status
PATCH  /api/v1/reports/:id/assignee
POST   /api/v1/reports/:id/notes
GET    /api/v1/collaborators
GET    /api/v1/session
GET    /api/v1/me
PATCH  /api/v1/me
GET    /api/v1/access
POST   /api/v1/access
PATCH  /api/v1/access/:email
DELETE /api/v1/access/:email
```

Interactive documentation:

```text
/api/docs
```

## Run locally

```powershell
cd backend
npm install
Copy-Item .env.example .env
npm run dev
```

Then open:

```text
http://localhost:8787/
http://localhost:8787/health
http://localhost:8787/api/docs
```

## PostgreSQL + migrations

Recommended for shared/demo deployments. Set `DATABASE_URL`; then run:

```bash
npm run migrate
npm start
```

Current migrations:

```text
001_initial.sql
002_access_control.sql
003_profiles_and_assignment.sql
004_local_accounts.sql
005_ticket_activity.sql
```

## Storage

Set `STORAGE_ROOT` to a persistent directory for screenshots/files. For a hosted volume:

```text
STORAGE_ROOT=/data
```

## Railway

Use `backend` as the Railway service root. `backend/railway.json` configures:

```text
npm run migrate && npm start
```

and the `/health` deployment health check.

A hosted demo should use managed PostgreSQL, HTTPS, `LOCAL_AUTH_SECURE_COOKIE=true`, and synthetic data only.

## Portfolio safety

This branch is deliberately generic. Do not add real customer data, employee identities, internal URLs, credentials, or proprietary screenshots. Secrets belong in environment variables and `.env` files remain ignored by Git.
