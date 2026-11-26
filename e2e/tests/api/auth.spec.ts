import { test, expect, request as playwrightRequest } from '@playwright/test';
import { adminClient, createAccount, loggedInClient } from '../../support/api';
import { ADMIN, BASE_URL } from '../../support/env';

test.describe('Authentication and sessions', () => {
  test('protected endpoints return 401 without a session', async ({ request }) => {
    for (const endpoint of ['/api/v1/reports', '/api/v1/me', '/api/v1/collaborators', '/api/v1/access', '/api/v1/audit']) {
      const response = await request.get(endpoint);
      expect(response.status(), endpoint).toBe(401);
    }
  });

  test('session endpoint tells the dashboard to send anonymous users to login', async ({ request }) => {
    const response = await request.get('/api/v1/session');
    expect(response.status()).toBe(401);
    expect(await response.json()).toMatchObject({
      authenticated: false,
      loginRequired: true,
      loginUrl: '/login.html'
    });
  });

  test('login sets an HttpOnly, SameSite=Lax session cookie', async ({ request }) => {
    const response = await request.post('/api/v1/auth/login', {
      data: { email: ADMIN.email, password: ADMIN.password }
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, email: ADMIN.email });
    const cookie = response.headers()['set-cookie'] || '';
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  test('login is case-insensitive on email', async () => {
    const client = await loggedInClient(ADMIN.email.toUpperCase(), ADMIN.password);
    const session = await client.get('/api/v1/session');
    expect((await session.json()).identity.email).toBe(ADMIN.email);
    await client.dispose();
  });

  test('wrong password and unknown account return the same 401 message', async ({ request }) => {
    const wrongPassword = await request.post('/api/v1/auth/login', {
      data: { email: ADMIN.email, password: 'definitely-not-the-password' }
    });
    const unknownUser = await request.post('/api/v1/auth/login', {
      data: { email: 'nobody@example.com', password: 'definitely-not-the-password' }
    });
    expect(wrongPassword.status()).toBe(401);
    expect(unknownUser.status()).toBe(401);
    // Identical messages prevent account enumeration.
    expect((await wrongPassword.json()).error).toBe((await unknownUser.json()).error);
  });

  test('logout invalidates the session server-side', async () => {
    const client = await adminClient();
    expect((await client.get('/api/v1/me')).status()).toBe(200);

    const logout = await client.post('/api/v1/auth/logout');
    expect(logout.status()).toBe(200);
    expect((await client.get('/api/v1/me')).status()).toBe(401);
    await client.dispose();
  });

  test('a stolen cookie stops working after its owner logs out', async () => {
    const client = await adminClient();
    const { cookies } = await client.storageState();
    const replay = await playwrightRequest.newContext({
      baseURL: BASE_URL,
      storageState: { cookies, origins: [] }
    });
    expect((await replay.get('/api/v1/me')).status()).toBe(200);

    await client.post('/api/v1/auth/logout');
    expect((await replay.get('/api/v1/me')).status()).toBe(401);
    await Promise.all([client.dispose(), replay.dispose()]);
  });
});

test.describe('Invitations', () => {
  test('a new reviewer can activate an account from an invitation and log in', async () => {
    const admin = await adminClient();
    const reviewer = await createAccount(admin, 'Reviewer');

    const session = await (await reviewer.client.get('/api/v1/session')).json();
    expect(session).toMatchObject({ authenticated: true, authorized: true });
    expect(session.access.role).toBe('Reviewer');

    const fresh = await loggedInClient(reviewer.email, reviewer.password);
    expect((await fresh.get('/api/v1/me')).status()).toBe(200);
    await Promise.all([admin.dispose(), reviewer.client.dispose(), fresh.dispose()]);
  });

  test('an invitation token can only be used once', async ({ request }) => {
    const admin = await adminClient();
    const email = `once-${Date.now()}@example.com`;
    const grant = await admin.post('/api/v1/access', { data: { email, role: 'Reviewer', displayName: 'Once' } });
    const token = new URL((await grant.json()).invite.inviteUrl).searchParams.get('token')!;

    const data = { displayName: 'Once', password: 'first-password-123' };
    expect((await request.post(`/api/v1/auth/invite/${token}/accept`, { data })).status()).toBe(201);

    const reuse = await request.post(`/api/v1/auth/invite/${token}/accept`, {
      data: { ...data, password: 'attacker-password-123' }
    });
    expect(reuse.status()).toBe(400);
    expect((await reuse.json()).error).toMatch(/invalid, expired, or already used/);
    await admin.dispose();
  });

  test('rejects passwords shorter than 10 characters', async ({ request }) => {
    const admin = await adminClient();
    const email = `shortpw-${Date.now()}@example.com`;
    const grant = await admin.post('/api/v1/access', { data: { email, role: 'Reviewer', displayName: 'Short' } });
    const token = new URL((await grant.json()).invite.inviteUrl).searchParams.get('token')!;

    const response = await request.post(`/api/v1/auth/invite/${token}/accept`, {
      data: { displayName: 'Short', password: '123456789' }
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('Password must be at least 10 characters.');
    await admin.dispose();
  });

  test('an unknown invitation token returns 404 when inspected', async ({ request }) => {
    const response = await request.get('/api/v1/auth/invite/not-a-real-token');
    expect(response.status()).toBe(404);
  });
});
