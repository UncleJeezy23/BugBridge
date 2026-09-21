# BugBridge — Portfolio Demo

This branch exists to demonstrate the application publicly without exposing organization-specific information.

## Data boundary

Use only synthetic data in this deployment:

- synthetic user accounts
- synthetic tickets and notes
- `example.com` / `example.org` URLs and email addresses
- screenshots created specifically for the demo
- hosting secrets stored only in Railway/environment variables

Do not add real customer information, employee identities, internal URLs, proprietary screenshots, API keys, SMTP passwords, or production credentials.

## Suggested synthetic personas

```text
admin@example.com      Portfolio Demo Admin      Admin
reviewer@example.com   Alex Rivera               Reviewer
developer@example.com  Jordan Lee                Reviewer
```

The Admin password should remain private. If a recruiter-facing shared login is offered, use a Reviewer account rather than publishing Admin credentials.

## Synthetic demo data

The backend includes a synthetic seed command:

```bash
npm run seed:demo
```

Set `BASE_URL` to the running deployment before executing it. The script creates fabricated Bug/Suggestion tickets using example-domain URLs and synthetic environment information.

The seed data exists to make the reviewer workflow immediately demonstrable without using any real work or customer information.

## Automated deployment smoke test

The backend also includes:

```bash
npm run smoke
```

With only `BASE_URL`, the smoke test verifies service health and public report submission.

For authenticated workflow coverage, also provide `SMOKE_EMAIL` and `SMOKE_PASSWORD` through the local shell/environment. Do not put those values in Git. The authenticated path verifies login, authorization, ticket retrieval, workflow status transitions, and persisted activity.

## Manual feature pass

The canonical manual release gate is:

```text
tests/INTERNAL_FEATURE_TEST_PASS.md
```

It is organized by feature rather than by historical milestone and covers startup, authentication, invitations/access, extension behavior, report submission, dashboard/filtering, all six workflow states, assignment, notes, activity, webhooks, multi-user behavior, API documentation, public-safety checks, and accessibility regressions.

## Railway target

Recommended topology:

```text
GitHub portfolio source
        |
        v
Railway Node/Express service
        |
        +--> Managed PostgreSQL
        +--> Persistent /data volume
        |
        v
Railway HTTPS domain
```

Service root:

```text
backend
```

Startup:

```text
npm run migrate && npm start
```

Health check:

```text
/health
```

Recommended hosted variables:

```text
PUBLIC_BASE_URL=<Railway HTTPS URL>
STORAGE_ROOT=/data
DATABASE_URL=<Railway PostgreSQL reference>
DATABASE_SSL=false
IDENTITY_MODE=local_account
ALLOWED_IDENTITY_DOMAIN=example.com
ENFORCE_IDENTITY_DOMAIN=false
LOCAL_AUTH_SESSION_HOURS=12
LOCAL_AUTH_INVITE_HOURS=48
LOCAL_AUTH_SECURE_COOKIE=true
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_NAME=Portfolio Demo Admin
LOCAL_AUTH_BOOTSTRAP_PASSWORD=<private hosting secret>
```

SMTP and outbound webhooks are optional for the portfolio deployment.

## Release sequence

Before sharing the URL publicly:

1. Deploy the sanitized portfolio source only.
2. Run all database migrations, including `006_expand_report_statuses.sql`.
3. Confirm `/health` reports `ok: true`, version `0.6.7`, and PostgreSQL storage.
4. Verify the private bootstrap Admin login.
5. Create at least one synthetic Reviewer account.
6. Run `npm run seed:demo` against the hosted URL.
7. Run the authenticated smoke test.
8. Execute the manual critical-path portions of `tests/INTERNAL_FEATURE_TEST_PASS.md`.
9. Perform a second-browser multi-user spot check.
10. Verify activity and screenshots survive service restart when persistence is configured.
11. Review the public repository/source one final time for sensitive or organization-specific data.
12. Capture portfolio screenshots only after the synthetic dataset is stable.
13. Add the live URL and screenshots to the public README.
14. Tag the release only after the release gate passes.

## Source visibility warning

GitHub visibility is repository-wide, not branch-specific. If an integrated/work branch must remain private, publish this sanitized branch to a separate public portfolio repository rather than changing the original repository to public.

## Release boundary

The public portfolio deployment is a demonstration environment, not an organizational production system. The invitation/password adapter is suitable for controlled demo testing, while a real production rollout should use organization-approved identity, security controls, storage, monitoring, and deployment governance.
