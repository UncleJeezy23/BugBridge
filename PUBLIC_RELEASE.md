# Public Portfolio Release

This branch is the sanitized source candidate for the public portfolio repository.

## Public-safe boundary

The public release must contain only generic product terminology and synthetic data. It must not contain organization-specific branding, employee/customer information, internal domains or URLs, proprietary screenshots, credentials, API keys, SMTP secrets, production configuration, or work-integrated deployment details.

## Intended use

This source is intended to demonstrate full-stack and QA engineering work on a browser-based bug/feedback workflow, including:

- Chrome Manifest V3 issue capture
- Node/Express REST API
- PostgreSQL persistence and migrations
- Reviewer/Admin role-based access
- invitation-only demo accounts
- assignment and work queues
- six-state QA workflow
- persisted ticket activity
- internal notes
- signed HMAC webhooks
- Docker and Railway-compatible deployment
- automated smoke testing and feature-based manual QA

## Synthetic-only examples

Use identities such as `admin@example.com`, `reviewer@example.com`, and `developer@example.com`. Use fabricated tickets, URLs, environment information, notes, and screenshots.

## Publication gate

Before mirroring this branch into a separate public GitHub repository:

1. Run the automated smoke test.
2. Complete the critical sections of `tests/INTERNAL_FEATURE_TEST_PASS.md`.
3. Search source and docs for organization-specific names, domains, URLs, and identities.
4. Verify `.gitignore` excludes secrets, local environment files, databases, uploads, logs, and generated artifacts.
5. Confirm the deployed demo contains only synthetic data.
6. Publish this sanitized tree to a separate public repository; do not change the private integrated repository to public.
