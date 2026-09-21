# BugBridge — Identity + Access Control

## Purpose

BugBridge separates **identity** from **authorization**.

```text
Identity provider
      |
      v
Verified user identity
      |
      v
BugBridge authorization whitelist
      |
 Reviewer / Admin
```

Authentication alone does not grant dashboard access. A user must also have a `bugbridge_access` row with a Reviewer or Admin role.

There is no public self-registration route.

## Roles

### Employee / Reporter

Not a stored dashboard role. The Chrome extension can submit Bug/Suggestion reports without Reviewer/Admin dashboard access.

### Reviewer

Can access the dashboard, search/filter tickets, view context/screenshots, change status, add internal notes, assign/transfer/unassign tickets, use work queues, and manage their own display name/job title.

### Admin

Includes Reviewer capabilities plus access management, invitations, role changes, account-state review, and audit history. The final active Admin cannot be removed or demoted.

## Identity modes

```text
IDENTITY_MODE=disabled
IDENTITY_MODE=demo
IDENTITY_MODE=local_account
IDENTITY_MODE=upstream_header
```

`disabled` is a local-development bypass. `demo` provides a fixed synthetic identity. `local_account` provides invitation-only demo accounts stored in PostgreSQL. `upstream_header` is an adapter boundary for a trusted authenticated gateway.

A production deployment can replace the identity adapter with OIDC, JWT, server-session, or SSO integration without changing the authorization model.

## Local-account properties

- invitation-only; no self-signup
- one-time expiring invitation tokens
- passwords hashed with Node `scrypt`
- random per-password salts
- opaque random session tokens
- only invitation/session token hashes persisted
- HttpOnly `SameSite=Lax` session cookie
- password changes revoke previous sessions
- reset-invite acceptance revokes previous sessions
- access removal cascades local credentials/invites/sessions

## Email-domain enforcement

Portfolio/demo configuration uses synthetic addresses:

```text
ALLOWED_IDENTITY_DOMAIN=example.com
ENFORCE_IDENTITY_DOMAIN=false
```

A real organization can enable enforcement and set its approved domain or replace the rule with issuer/claim validation in its identity adapter.

## Admin invitation workflow

1. Admin adds an email and assigns Reviewer/Admin.
2. The service creates a one-time invitation.
3. SMTP sends the link when configured; otherwise the Admin UI exposes the direct demo link.
4. User sets display name, job title, and password.
5. Account becomes active and receives a session.
6. User can log in/out through `/login.html`.

## API

```text
GET  /api/v1/auth/config
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/auth/invite/:token
POST /api/v1/auth/invite/:token/accept
GET  /api/v1/session
GET  /api/v1/me
PATCH /api/v1/me
PATCH /api/v1/me/password

GET    /api/v1/access
POST   /api/v1/access
POST   /api/v1/access/:email/invite
PATCH  /api/v1/access/:email
DELETE /api/v1/access/:email
GET    /api/v1/audit
```

Protected ticket operations require Reviewer/Admin access. Employee report submission remains separate so extension reporting stays frictionless.

## Security boundary

The portfolio branch is configured for synthetic demo accounts only. The local password provider is test/demo infrastructure, not a production identity recommendation. Production-grade password authentication would require additional controls including TLS/Secure cookies, origin restrictions, CSRF review, rate limiting, password recovery, secret management, monitoring, and automated auth tests.
