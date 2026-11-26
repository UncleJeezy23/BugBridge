# BugBridge end-to-end test suite

Automated regression suite for BugBridge, written in **Playwright + TypeScript**. It covers the
REST API and the reviewer dashboard against a real PostgreSQL database and a real signed-webhook
receiver, and runs on every pull request in GitHub Actions.

It complements the existing `backend/scripts/smoke-test.js` deployment check and the manual
release gate in `tests/INTERNAL_FEATURE_TEST_PASS.md`.

## What it covers

| Area | Spec | Highlights |
|---|---|---|
| Health and API docs | `tests/api/health.spec.ts` | Version matches `backend/package.json`, OpenAPI is served, auth config is not cached |
| Report submission | `tests/api/report-submission.spec.ts` | BUG ID format, trimming, every required-field rule, boundary lengths, PNG upload and retrieval, non-image rejection |
| Authentication | `tests/api/auth.spec.ts` | Cookie flags, no account enumeration, server-side logout, stolen-cookie replay, one-time invites, password policy |
| Access control | `tests/api/access-control.spec.ts` | Reviewer vs Admin permissions, self-promotion blocked, instant revocation, audit log, final-admin protection |
| Ticket workflow | `tests/api/ticket-workflow.spec.ts` | All six statuses, reopen, invalid statuses, no-op changes, 404s, notes, assignment, activity history |
| Webhooks | `tests/api/webhooks.spec.ts` | Every event type is delivered and verified, no private fields leak, bad signatures, stale timestamps and duplicate retries |
| Login UI | `tests/ui/login.spec.ts` | Redirect to login and back to the requested ticket, error messages, open-redirect guard, logout, role-based links |
| Dashboard UI | `tests/ui/dashboard.spec.ts` | Deep links, status changes that persist after reload, notes, search, assign to me |

### Design

- **Page Object Model** in `pages/` keeps selectors in one place.
- **API helpers** in `support/api.ts` create data through the same endpoints real users hit,
  including activating reviewer accounts through the real invitation flow.
- **Isolation:** every test creates its own uniquely tagged tickets and users, so tests run
  fully in parallel without cleaning the database between them.
- **Auth once:** a setup project logs in through the UI and shares the session with UI tests.
- **CI:** traces, screenshots and video are kept for failed tests; the HTML report is uploaded
  as a build artifact.

## Running locally

You need Node 22 and a throwaway PostgreSQL database:

```bash
docker run -d --name bugbridge-e2e-db -p 5432:5432 \
  -e POSTGRES_DB=bugbridge -e POSTGRES_USER=bugbridge -e POSTGRES_PASSWORD=bugbridge \
  postgres:16-alpine

cd backend && npm ci && cd ..
cd e2e && npm install && npx playwright install chromium
DATABASE_URL=postgresql://bugbridge:bugbridge@localhost:5432/bugbridge npx playwright test
```

Playwright starts the backend and the webhook receiver for you. To test an already-running
stack instead, set `BASE_URL` (and `RECEIVER_URL`, `WEBHOOK_SECRET`, `E2E_ADMIN_EMAIL`,
`E2E_ADMIN_PASSWORD` to match it).

Useful commands:

```bash
npm run test:api        # API tests only
npm run test:ui         # UI tests only
npx playwright test --ui
npm run report          # open the last HTML report
```

Use a dedicated database: the suite creates synthetic `@example.com` users and tickets.

## What is deliberately not automated

- **Chrome extension capture** (screenshots, tab context). Extension automation in CI is slow
  and brittle; the API contract it depends on is covered by the submission tests, and the
  capture itself stays in the manual pass.
- **Email delivery.** SMTP is optional and external; tests assert the API reports
  `emailSent: false` when it is not configured rather than standing up a mail server.
- **Invitation expiry.** Expiring a token needs clock control or direct database edits; it is
  covered manually until the backend exposes a test clock.
- **Visual and accessibility review.** Layout and screen-reader checks stay in the manual
  pass; automated snapshots would be noisy for a UI still changing.
