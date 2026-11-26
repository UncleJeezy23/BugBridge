import { APIRequestContext, expect, request } from '@playwright/test';
import crypto from 'node:crypto';
import { ADMIN, BASE_URL, RECEIVER_URL } from './env';

export type ReportInput = {
  type?: string;
  intent?: string;
  problem?: string;
  impact?: string;
  url?: string;
  pageTitle?: string;
  browser?: string;
};

/** Unique tag so parallel tests never collide on shared data. */
export function uniqueTag(prefix = 'e2e'): string {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

export function uniqueEmail(prefix = 'reviewer'): string {
  return `${uniqueTag(prefix)}@example.com`;
}

/** A 1x1 transparent PNG, enough to exercise screenshot upload and retrieval. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

/** An unauthenticated client, the same position as an employee using the Chrome extension. */
export async function anonymousClient(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: BASE_URL });
}

/** Logs in through the real login endpoint; the context keeps the session cookie. */
export async function loggedInClient(email: string, password: string): Promise<APIRequestContext> {
  const client = await request.newContext({ baseURL: BASE_URL });
  const response = await client.post('/api/v1/auth/login', { data: { email, password } });
  expect(response.status(), `login for ${email}`).toBe(200);
  return client;
}

export async function adminClient(): Promise<APIRequestContext> {
  return loggedInClient(ADMIN.email, ADMIN.password);
}

/** Submits a report the way the extension does (multipart form) and returns its ID. */
export async function createReport(client: APIRequestContext, input: ReportInput = {}): Promise<string> {
  const tag = uniqueTag('report');
  const response = await client.post('/api/v1/reports', {
    multipart: {
      type: input.type ?? 'Bug',
      intent: input.intent ?? `Automated test report ${tag}`,
      problem: input.problem ?? 'Synthetic defect created by the Playwright suite.',
      impact: input.impact ?? 'Minor issue',
      url: input.url ?? 'https://example.com/demo',
      pageTitle: input.pageTitle ?? 'Synthetic Demo Page',
      browser: input.browser ?? 'Playwright'
    }
  });
  expect(response.status(), await response.text()).toBe(201);
  const body = await response.json();
  return body.reportId as string;
}

export type Account = { email: string; password: string; displayName: string; client: APIRequestContext };

/**
 * Creates a fully activated account the same way a real user gets one:
 * an Admin grants access, then the user accepts the one-time invitation.
 */
export async function createAccount(
  admin: APIRequestContext,
  role: 'Reviewer' | 'Admin' = 'Reviewer'
): Promise<Account> {
  const email = uniqueEmail(role.toLowerCase());
  const displayName = `E2E ${role} ${email.slice(0, 18)}`;
  const password = `pw-${crypto.randomBytes(8).toString('hex')}`;

  const grant = await admin.post('/api/v1/access', { data: { email, role, displayName } });
  expect(grant.status(), await grant.text()).toBe(201);
  const { invite } = await grant.json();
  const token = new URL(invite.inviteUrl).searchParams.get('token');
  expect(token, 'invite URL contains a token').toBeTruthy();

  const client = await request.newContext({ baseURL: BASE_URL });
  const accept = await client.post(`/api/v1/auth/invite/${encodeURIComponent(token!)}/accept`, {
    data: { displayName, jobTitle: 'QA', password }
  });
  expect(accept.status(), await accept.text()).toBe(201);

  return { email, password, displayName, client };
}

export type ReceivedEvent = {
  verified: boolean;
  event: string;
  deliveryId: string;
  attempt: number;
  payload: { event: string; deliveryId: string; data: Record<string, any> };
};

/** Reads the verified-event feed from the demo webhook receiver. */
export async function receivedEvents(): Promise<ReceivedEvent[]> {
  const client = await request.newContext({ baseURL: RECEIVER_URL });
  try {
    const response = await client.get('/events');
    expect(response.ok()).toBeTruthy();
    return (await response.json()).events as ReceivedEvent[];
  } finally {
    await client.dispose();
  }
}

/** Extracts the report ID from any BugBridge webhook payload shape. */
export function eventReportId(event: ReceivedEvent): string | undefined {
  const data = event.payload?.data || {};
  return data.reportId || data.report?.id;
}
