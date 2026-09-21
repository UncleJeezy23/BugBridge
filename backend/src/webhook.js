import crypto from 'node:crypto';

const DEFAULT_EVENTS = new Set([
  'report.created',
  'report.status_changed',
  'report.note_added',
  'report.assignee_changed'
]);

function configuredEvents(value) {
  if (!value?.trim()) return DEFAULT_EVENTS;
  return new Set(value.split(',').map((item) => item.trim()).filter(Boolean));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function computeWebhookSignature(secret, timestamp, body) {
  return `sha256=${crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`, 'utf8')
    .digest('hex')}`;
}

export function verifyWebhookSignature({ secret, timestamp, body, signature }) {
  if (!secret || !timestamp || !body || !signature) return false;
  const expected = computeWebhookSignature(secret, timestamp, body);
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function createWebhookDispatcher({
  url = process.env.WEBHOOK_URL?.trim(),
  secret = process.env.WEBHOOK_SECRET?.trim(),
  timeoutMs = Number(process.env.WEBHOOK_TIMEOUT_MS || 5000),
  maxAttempts = Number(process.env.WEBHOOK_MAX_ATTEMPTS || 3),
  events = configuredEvents(process.env.WEBHOOK_EVENTS)
} = {}) {
  const enabled = Boolean(url && secret);
  const attempts = Math.min(5, Math.max(1, Number.isFinite(maxAttempts) ? maxAttempts : 3));

  if ((url && !secret) || (!url && secret)) {
    console.warn('[webhook] Both WEBHOOK_URL and WEBHOOK_SECRET are required. Webhooks disabled.');
  }

  async function send(event, data) {
    if (!enabled || !events.has(event)) {
      return { sent: false, reason: enabled ? 'Event not configured' : 'Webhook not configured' };
    }

    const occurredAt = new Date().toISOString();
    const deliveryId = crypto.randomUUID();
    const envelope = {
      version: '1.0',
      event,
      deliveryId,
      occurredAt,
      data
    };
    const body = JSON.stringify(envelope);
    const signature = computeWebhookSignature(secret, occurredAt, body);
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(500, timeoutMs));

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'BugBridge/0.6.7',
            'X-BUG-Event': event,
            'X-BUG-Delivery': deliveryId,
            'X-BUG-Timestamp': occurredAt,
            'X-BUG-Signature-256': signature,
            'X-BUG-Attempt': String(attempt)
          },
          body,
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Webhook receiver returned HTTP ${response.status}`);
        }

        console.log(`[webhook] delivered ${event} ${deliveryId} attempt=${attempt}`);
        return { sent: true, deliveryId, status: response.status, attempt };
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          const delayMs = 250 * (2 ** (attempt - 1));
          console.warn(`[webhook] ${event} ${deliveryId} attempt=${attempt} failed; retrying in ${delayMs}ms`);
          await wait(delayMs);
        }
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError || new Error('Webhook delivery failed');
  }

  function dispatch(event, data) {
    if (!enabled || !events.has(event)) return;
    void send(event, data).catch((error) => {
      console.error(`[webhook] delivery failed for ${event}:`, error.message);
    });
  }

  return {
    enabled,
    events: [...events],
    dispatch,
    send
  };
}
