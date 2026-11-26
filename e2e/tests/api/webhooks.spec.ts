import { test, expect, request as playwrightRequest, APIRequestContext } from '@playwright/test';
import crypto from 'node:crypto';
import { adminClient, createReport, eventReportId, receivedEvents } from '../../support/api';
import { RECEIVER_URL, WEBHOOK_SECRET } from '../../support/env';

/** Same algorithm as backend/src/webhook.js: HMAC-SHA256 over `${timestamp}.${body}`. */
function sign(timestamp: string, body: string, secret = WEBHOOK_SECRET): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex')}`;
}

async function eventsFor(reportId: string, eventName: string) {
  return (await receivedEvents()).filter((event) => event.event === eventName && eventReportId(event) === reportId);
}

test.describe('Outbound webhooks (BugBridge -> receiver)', () => {
  let admin: APIRequestContext;
  test.beforeAll(async () => { admin = await adminClient(); });
  test.afterAll(async () => { await admin.dispose(); });

  test('report.created is delivered, signed and verified', async () => {
    const id = await createReport(admin);
    await expect.poll(async () => (await eventsFor(id, 'report.created')).length, { timeout: 10_000 }).toBe(1);

    const [event] = await eventsFor(id, 'report.created');
    expect(event.verified).toBe(true);
    expect(event.deliveryId).toMatch(/^[0-9a-f-]{36}$/);
    expect(event.payload).toMatchObject({ version: '1.0', event: 'report.created' });
    expect(event.payload.data.report.status).toBe('Open');
  });

  test('webhook payloads never leak the private screenshot filename', async () => {
    const id = await createReport(admin);
    await expect.poll(async () => (await eventsFor(id, 'report.created')).length, { timeout: 10_000 }).toBe(1);
    const [event] = await eventsFor(id, 'report.created');
    expect(event.payload.data.report).not.toHaveProperty('screenshotFilename');
  });

  test('status, note and assignee changes each emit one event with before/after values', async () => {
    const id = await createReport(admin);
    const { access } = await (await admin.get('/api/v1/me')).json();

    await admin.patch(`/api/v1/reports/${id}/status`, { data: { status: 'In Review' } });
    await admin.post(`/api/v1/reports/${id}/notes`, { data: { text: 'webhook note' } });
    await admin.patch(`/api/v1/reports/${id}/assignee`, { data: { assigneeEmail: access.email } });

    await expect.poll(async () => (await eventsFor(id, 'report.status_changed')).length, { timeout: 10_000 }).toBe(1);
    await expect.poll(async () => (await eventsFor(id, 'report.note_added')).length, { timeout: 10_000 }).toBe(1);
    await expect.poll(async () => (await eventsFor(id, 'report.assignee_changed')).length, { timeout: 10_000 }).toBe(1);

    const [status] = await eventsFor(id, 'report.status_changed');
    expect(status.payload.data).toMatchObject({ previousStatus: 'Open', status: 'In Review' });
    const [note] = await eventsFor(id, 'report.note_added');
    expect(note.payload.data.note.text).toBe('webhook note');
  });

  test('a no-op status change does not emit an event', async () => {
    const id = await createReport(admin);
    await admin.patch(`/api/v1/reports/${id}/status`, { data: { status: 'Open' } });
    // Wait for the creation event so we know deliveries for this report have flushed.
    await expect.poll(async () => (await eventsFor(id, 'report.created')).length, { timeout: 10_000 }).toBe(1);
    expect(await eventsFor(id, 'report.status_changed')).toHaveLength(0);
  });
});

test.describe('Webhook receiver signature verification', () => {
  let receiver: APIRequestContext;
  test.beforeAll(async () => { receiver = await playwrightRequest.newContext({ baseURL: RECEIVER_URL }); });
  test.afterAll(async () => { await receiver.dispose(); });

  function delivery(overrides: { timestamp?: string; signature?: string; deliveryId?: string } = {}) {
    const deliveryId = overrides.deliveryId ?? crypto.randomUUID();
    const timestamp = overrides.timestamp ?? new Date().toISOString();
    const body = JSON.stringify({ version: '1.0', event: 'report.created', deliveryId, occurredAt: timestamp, data: {} });
    return {
      deliveryId,
      send: () =>
        receiver.post('/events', {
          data: body,
          headers: {
            'Content-Type': 'application/json',
            'X-BUG-Event': 'report.created',
            'X-BUG-Delivery': deliveryId,
            'X-BUG-Timestamp': timestamp,
            'X-BUG-Signature-256': overrides.signature ?? sign(timestamp, body)
          }
        })
    };
  }

  test('accepts a correctly signed delivery', async () => {
    const response = await delivery().send();
    expect(response.status()).toBe(202);
    expect(await response.json()).toMatchObject({ ok: true, verified: true });
  });

  test('rejects a delivery signed with the wrong secret', async () => {
    const timestamp = new Date().toISOString();
    const response = await delivery({ timestamp, signature: sign(timestamp, '{}', 'wrong-secret') }).send();
    expect(response.status()).toBe(401);
    expect((await response.json()).error).toBe('Invalid webhook signature');
  });

  test('rejects a replayed delivery with a stale timestamp', async () => {
    const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const response = await delivery({ timestamp: stale }).send();
    expect(response.status()).toBe(401);
    expect((await response.json()).error).toBe('Stale webhook timestamp');
  });

  test('accepts a retried delivery once and flags the duplicate', async () => {
    const first = delivery();
    expect((await first.send()).status()).toBe(202);
    const retry = await first.send();
    expect(retry.status()).toBe(202);
    expect((await retry.json()).duplicate).toBe(true);

    const stored = (await receivedEvents()).filter((event) => event.deliveryId === first.deliveryId);
    expect(stored).toHaveLength(1);
  });
});
