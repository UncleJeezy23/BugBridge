# BugBridge — QA Test Suite

This folder contains the active release-validation checklist for the portfolio demo.

## Canonical test pass

Use:

```text
INTERNAL_FEATURE_TEST_PASS.md
```

This is the current feature-based release gate for v0.6.7. It covers startup, authentication, access control, employee reporting, Chrome extension behavior, dashboard workflows, search/filtering, all six ticket states, assignment, notes, persisted activity, webhooks, multi-user behavior, API documentation, portfolio safety, and accessibility regression.

The goal is a practical internal QA pass that can be completed before a public deployment without requiring an external test-management platform.

## Automated smoke coverage

The backend also includes an automated smoke test:

```bash
cd backend
npm run smoke
```

Use the smoke test for fast deployment validation, then complete the critical manual sections in `INTERNAL_FEATURE_TEST_PASS.md` before treating a build as release-ready.

## Historical test plans

Earlier milestone-specific plans were removed from this branch after their relevant coverage was consolidated into `INTERNAL_FEATURE_TEST_PASS.md`. They remain available in Git history if regression archaeology is ever needed.

This keeps the public portfolio branch focused on the current product rather than exposing multiple stale QA plans that describe superseded workflows.
