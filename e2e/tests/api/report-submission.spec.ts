import { test, expect } from '@playwright/test';
import { TINY_PNG, adminClient, uniqueTag } from '../../support/api';

const validReport = () => ({
  type: 'Bug',
  intent: `Submit a report ${uniqueTag()}`,
  problem: 'The save button does nothing.',
  impact: 'Blocks my work'
});

test.describe('Employee report submission (public endpoint)', () => {
  test('accepts a valid bug report and returns a dated BUG ID', async ({ request }) => {
    const response = await request.post('/api/v1/reports', { multipart: validReport() });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.reportId).toMatch(/^BUG-\d{8}-[0-9A-F]{6}$/);
    expect(body.dashboardUrl).toBe(`/#${body.reportId}`);
    expect(body.webhookConfigured).toBe(true);
    expect(body.emailSent).toBe(false);
  });

  test('accepts the Suggestion type', async ({ request }) => {
    const response = await request.post('/api/v1/reports', {
      multipart: { ...validReport(), type: 'Suggestion' }
    });
    expect(response.status()).toBe(201);
  });

  test('stores trimmed fields and starts every report as Open and unassigned', async ({ request }) => {
    const intent = `  Padded intent ${uniqueTag()}  `;
    const created = await request.post('/api/v1/reports', { multipart: { ...validReport(), intent } });
    const { reportId } = await created.json();

    const admin = await adminClient();
    const response = await admin.get(`/api/v1/reports/${reportId}`);
    expect(response.status()).toBe(200);
    const { report } = await response.json();
    expect(report).toMatchObject({
      id: reportId,
      type: 'Bug',
      status: 'Open',
      intent: intent.trim(),
      assignedToEmail: null,
      screenshotStored: false,
      screenshotUrl: null,
      notes: []
    });
    await admin.dispose();
  });

  const invalidCases: Array<[string, Record<string, string>, string]> = [
    ['unknown type', { type: 'Feature' }, 'type must be Bug or Suggestion'],
    ['missing intent', { intent: '' }, 'intent is required'],
    ['whitespace-only intent', { intent: '    ' }, 'intent is required'],
    ['intent over 1000 characters', { intent: 'x'.repeat(1001) }, 'intent is required'],
    ['missing problem', { problem: '' }, 'problem is required'],
    ['problem over 4000 characters', { problem: 'x'.repeat(4001) }, 'problem is required'],
    ['missing impact', { impact: '' }, 'impact is required'],
    ['impact over 200 characters', { impact: 'x'.repeat(201) }, 'impact is required']
  ];

  for (const [name, override, error] of invalidCases) {
    test(`rejects ${name} with 400`, async ({ request }) => {
      const response = await request.post('/api/v1/reports', { multipart: { ...validReport(), ...override } });
      expect(response.status()).toBe(400);
      expect((await response.json()).error).toBe(error);
    });
  }

  test('accepts boundary lengths: 1000-character intent, 4000-character problem, 200-character impact', async ({ request }) => {
    const response = await request.post('/api/v1/reports', {
      multipart: { type: 'Bug', intent: 'i'.repeat(1000), problem: 'p'.repeat(4000), impact: 'm'.repeat(200) }
    });
    expect(response.status()).toBe(201);
  });

  test('stores a PNG screenshot that reviewers can retrieve, but anonymous users cannot', async ({ request }) => {
    const response = await request.post('/api/v1/reports', {
      multipart: {
        ...validReport(),
        screenshot: { name: 'capture.png', mimeType: 'image/png', buffer: TINY_PNG }
      }
    });
    expect(response.status()).toBe(201);
    const { reportId } = await response.json();

    const anonymous = await request.get(`/api/v1/reports/${reportId}/screenshot`);
    expect(anonymous.status()).toBe(401);

    const admin = await adminClient();
    const { report } = await (await admin.get(`/api/v1/reports/${reportId}`)).json();
    expect(report.screenshotStored).toBe(true);
    expect(report.screenshotUrl).toBe(`/api/v1/reports/${reportId}/screenshot`);

    const image = await admin.get(report.screenshotUrl);
    expect(image.status()).toBe(200);
    expect(Buffer.compare(await image.body(), TINY_PNG)).toBe(0);
    await admin.dispose();
  });

  test('rejects a screenshot that is not PNG or JPEG', async ({ request }) => {
    const response = await request.post('/api/v1/reports', {
      multipart: {
        ...validReport(),
        screenshot: { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') }
      }
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('Screenshot must be a PNG or JPEG image.');
  });

  test('returns 404 for the screenshot of a report that has none', async () => {
    const admin = await adminClient();
    const created = await admin.post('/api/v1/reports', { multipart: validReport() });
    const { reportId } = await created.json();
    const response = await admin.get(`/api/v1/reports/${reportId}/screenshot`);
    expect(response.status()).toBe(404);
    await admin.dispose();
  });
});
