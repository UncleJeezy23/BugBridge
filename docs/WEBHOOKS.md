# BugBridge — Signed Webhooks

BugBridge can push committed ticket activity to an external HTTPS endpoint without coupling the Chrome extension or dashboard to a specific vendor.

## Configuration

```text
WEBHOOK_URL=https://hooks.example.com/bugbridge-events
WEBHOOK_SECRET=<strong random shared secret>
WEBHOOK_TIMEOUT_MS=5000
WEBHOOK_MAX_ATTEMPTS=3
WEBHOOK_EVENTS=report.created,report.status_changed,report.note_added,report.assignee_changed
```

If `WEBHOOK_URL` or `WEBHOOK_SECRET` is missing, webhook delivery is disabled and ticket operations continue normally.

## Events

```text
report.created
report.status_changed
report.note_added
report.assignee_changed
```

Ticket creation, status changes, internal notes, and assignment changes are committed before webhook delivery is attempted. Delivery is asynchronous so a slow or unavailable integration does not block the reporting or review workflow.

## HTTP request

Each event is sent as an HTTP `POST` with JSON.

```text
Content-Type: application/json
User-Agent: BugBridge/0.6.7
X-BUG-Event: report.created
X-BUG-Delivery: <UUID>
X-BUG-Timestamp: <ISO-8601 timestamp>
X-BUG-Signature-256: sha256=<hex digest>
X-BUG-Attempt: 1
```

Envelope:

```json
{
  "version": "1.0",
  "event": "report.created",
  "deliveryId": "a4ea7e70-9c92-4af5-bdcb-7f091e4480a0",
  "occurredAt": "2026-09-01T22:15:00.000Z",
  "data": {}
}
```

## Signature verification

The signature is HMAC-SHA256 over the exact timestamp and raw HTTP body:

```text
signed_content = X-BUG-Timestamp + "." + raw_request_body
signature = "sha256=" + HMAC_SHA256(WEBHOOK_SECRET, signed_content)
```

Node.js verification example:

```js
import crypto from 'node:crypto';

function verify(secret, timestamp, rawBody, receivedSignature) {
  const expected = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex')}`;

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(receivedSignature || '');
  return expectedBuffer.length === receivedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}
```

Consumers should verify the signature before parsing or trusting the payload.

## Replay and duplicate protection

Consumers should:

1. Reject timestamps outside an acceptable window, such as five minutes.
2. Store `X-BUG-Delivery` / `deliveryId` values and treat repeat deliveries as duplicates.
3. Return a `2xx` response for a previously processed delivery ID rather than processing it twice.

BugBridge retries failed deliveries with the same delivery ID and payload. `X-BUG-Attempt` increases for each attempt.

The current retry mechanism is in-process rather than a durable message queue. A production deployment requiring guaranteed eventual delivery should use a persistent outbox/queue or equivalent managed integration infrastructure.

## Event-specific data

### `report.created`

```json
{
  "report": { "...": "current report data" }
}
```

### `report.status_changed`

```json
{
  "reportId": "BUG-20260901-A1B2C3",
  "previousStatus": "In Development",
  "status": "Ready for Retest",
  "actor": "reviewer@example.com",
  "report": { "...": "current report data" }
}
```

All six supported workflow states may appear as previous/current values.

### `report.note_added`

```json
{
  "reportId": "BUG-20260901-A1B2C3",
  "actor": "reviewer@example.com",
  "note": {
    "id": "uuid",
    "author": "Demo Reviewer",
    "text": "Reproduced on the latest build.",
    "createdAt": "2026-09-01T22:20:00.000Z"
  },
  "report": { "...": "current report data" }
}
```

### `report.assignee_changed`

```json
{
  "reportId": "BUG-20260901-A1B2C3",
  "previousAssignee": {
    "email": "developer@example.com",
    "displayName": "Demo Developer"
  },
  "assignee": {
    "email": "reviewer@example.com",
    "displayName": "Demo Reviewer",
    "jobTitle": "QA Analyst"
  },
  "actor": "admin@example.com",
  "report": { "...": "current report data" }
}
```

When a ticket is unassigned, `assignee` is `null`.

## Local verification demo

The Docker Compose environment includes a webhook receiver that verifies signatures and deduplicates delivery IDs.

```bash
docker compose up --build
```

Then create or modify a ticket and visit:

```text
http://localhost:9797/events
```

Verified requests appear with values similar to:

```json
{
  "verified": true,
  "event": "report.assignee_changed",
  "deliveryId": "..."
}
```

The local demo secret in `docker-compose.yml` is intentionally non-production. Hosted environments should inject a strong secret through deployment configuration rather than source control.

## QA coverage

Webhook release checks are maintained in:

```text
tests/INTERNAL_FEATURE_TEST_PASS.md
```

The pass verifies delivery, payload values, HMAC-SHA256 validation, retry identity, and the requirement that webhook outages never block ticket persistence or mutation.
