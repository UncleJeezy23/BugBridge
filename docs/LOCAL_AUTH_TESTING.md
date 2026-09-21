# BugBridge — Local Account Testing

## Purpose

`local_account` mode provides multiple independent invitation-only accounts for development, QA, and portfolio demonstrations.

It is not intended to be a production identity recommendation. The application keeps identity behind a replaceable provider boundary so a real deployment can use an organization's existing SSO/session/OIDC/JWT integration.

## Flow

```text
Admin adds email
      |
      v
One-time invitation
      |
      +--> SMTP when configured
      +--> direct demo link when SMTP is unavailable
      |
      v
User sets display name + job title + password
      |
      v
Account activated
      |
      v
Login / logout / My Account
```

There is no public self-registration endpoint.

## Docker portfolio mode

```text
IDENTITY_MODE=local_account
ALLOWED_IDENTITY_DOMAIN=example.com
ENFORCE_IDENTITY_DOMAIN=false
```

Synthetic demo addresses should be used only.

## Bootstrap Admin

Default portfolio example:

```text
admin@example.com
```

Choose the initial password outside Git in a root `.env` file:

```text
LOCAL_AUTH_BOOTSTRAP_PASSWORD=<choose-a-local-test-password>
```

`.env` is ignored by Git. Never commit passwords or hosting credentials.

## Invite lifecycle

Default expiration:

```text
LOCAL_AUTH_INVITE_HOURS=48
```

Creating/resending an invite invalidates any previous unused invitation for that email. An invite can be accepted once. A reset invite for an active demo account replaces local test credentials/profile and revokes prior sessions when accepted.

## Password storage

Passwords are stored as Node `scrypt` hashes with random salts. Minimum password length is 10 characters.

## Sessions

Successful activation/login creates an opaque random session token. Only its SHA-256 hash is stored in PostgreSQL; the raw token is held in an HttpOnly `SameSite=Lax` cookie.

Default lifetime:

```text
LOCAL_AUTH_SESSION_HOURS=12
```

Hosted HTTPS demos should set:

```text
LOCAL_AUTH_SECURE_COOKIE=true
```

## SMTP

Optional invitation/report delivery:

```text
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=BugBridge <noreply@example.com>
```

If SMTP is absent, the Admin page can still expose the generated one-time invite URL for controlled testing.

## PUBLIC_BASE_URL

Invitation links use `PUBLIC_BASE_URL`. Local default:

```text
http://localhost:8787
```

Hosted demos should set it to the generated HTTPS service URL.

## API

```text
GET  /api/v1/auth/config
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/auth/invite/:token
POST /api/v1/auth/invite/:token/accept
PATCH /api/v1/me/password
POST /api/v1/access/:email/invite
```

## Database migration

`004_local_accounts.sql` adds:

```text
local_accounts
account_invites
auth_sessions
```

## Security boundary

This mode is appropriate for controlled development and synthetic portfolio demos. Any real internet-facing production use of password authentication would need production-grade origin restrictions, CSRF review, rate limiting, TLS/Secure cookies, password recovery, secret management, monitoring, and automated authentication tests.
