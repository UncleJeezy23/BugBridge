import 'dotenv/config';
import express from 'express';
import { verifyWebhookSignature } from './webhook.js';

const app = express();
const port = Number(process.env.WEBHOOK_RECEIVER_PORT || 9797);
const secret = process.env.WEBHOOK_SECRET || 'bugbridge-demo-secret';
const toleranceMs = Number(process.env.WEBHOOK_TIMESTAMP_TOLERANCE_MS || 5 * 60 * 1000);
const events = [];
const seenDeliveries = new Set();

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'bugbridge-webhook-receiver', events: events.length });
});

app.get('/events', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, count: events.length, events: [...events].reverse() });
});

app.delete('/events', (_req, res) => {
  events.length = 0;
  seenDeliveries.clear();
  res.json({ ok: true, count: 0 });
});

app.post('/events', express.text({ type: '*/*', limit: '1mb' }), (req, res) => {
  const timestamp = req.get('X-BUG-Timestamp') || '';
  const signature = req.get('X-BUG-Signature-256') || '';
  const deliveryId = req.get('X-BUG-Delivery') || '';
  const eventName = req.get('X-BUG-Event') || '';
  const attempt = req.get('X-BUG-Attempt') || '1';
  const body = typeof req.body === 'string' ? req.body : '';

  const timestampMs = Date.parse(timestamp);
  const timestampFresh = Number.isFinite(timestampMs)
    && Math.abs(Date.now() - timestampMs) <= toleranceMs;
  if (!timestampFresh) {
    console.warn(`[receiver] rejected stale timestamp ${deliveryId || '(no delivery id)'}`);
    return res.status(401).json({ ok: false, error: 'Stale webhook timestamp' });
  }

  const verified = verifyWebhookSignature({ secret, timestamp, body, signature });
  if (!verified) {
    console.warn(`[receiver] rejected invalid signature ${deliveryId || '(no delivery id)'}`);
    return res.status(401).json({ ok: false, error: 'Invalid webhook signature' });
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
  }

  if (deliveryId && seenDeliveries.has(deliveryId)) {
    console.log(`[receiver] duplicate accepted ${deliveryId} attempt=${attempt}`);
    return res.status(202).json({ ok: true, verified: true, duplicate: true, deliveryId });
  }

  const received = {
    verified: true,
    event: eventName || payload.event,
    deliveryId: deliveryId || payload.deliveryId,
    attempt: Number(attempt) || 1,
    receivedAt: new Date().toISOString(),
    payload
  };
  if (received.deliveryId) seenDeliveries.add(received.deliveryId);
  events.push(received);
  if (events.length > 100) events.splice(0, events.length - 100);

  console.log(`[receiver] verified ${received.event} ${received.deliveryId}`);
  res.status(202).json({ ok: true, verified: true, deliveryId: received.deliveryId });
});

app.listen(port, () => {
  console.log(`BugBridge webhook receiver listening on http://localhost:${port}`);
  console.log(`Verified event feed: http://localhost:${port}/events`);
});
