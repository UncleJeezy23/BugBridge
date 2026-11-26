import { test, expect } from '@playwright/test';
import { adminClient, createAccount, createReport, uniqueEmail } from '../../support/api';
import { ADMIN } from '../../support/env';

test.describe('Role-based access control', () => {
  test('reviewers can use the dashboard API but not admin endpoints', async () => {
    const admin = await adminClient();
    const reviewer = await createAccount(admin, 'Reviewer');
    const reportId = await createReport(reviewer.client);

    expect((await reviewer.client.get('/api/v1/reports')).status()).toBe(200);
    expect((await reviewer.client.get(`/api/v1/reports/${reportId}`)).status()).toBe(200);
    expect((await reviewer.client.get('/api/v1/collaborators')).status()).toBe(200);

    expect((await reviewer.client.get('/api/v1/access')).status()).toBe(403);
    expect((await reviewer.client.get('/api/v1/audit')).status()).toBe(403);
    const escalate = await reviewer.client.patch(`/api/v1/access/${encodeURIComponent(reviewer.email)}`, {
      data: { role: 'Admin' }
    });
    expect(escalate.status(), 'a reviewer must not be able to promote themselves').toBe(403);
    const grant = await reviewer.client.post('/api/v1/access', {
      data: { email: uniqueEmail(), role: 'Admin' }
    });
    expect(grant.status()).toBe(403);

    await Promise.all([admin.dispose(), reviewer.client.dispose()]);
  });

  test('removing a user revokes their access immediately, even with a live session', async () => {
    const admin = await adminClient();
    const reviewer = await createAccount(admin, 'Reviewer');
    expect((await reviewer.client.get('/api/v1/reports')).status()).toBe(200);

    const removed = await admin.delete(`/api/v1/access/${encodeURIComponent(reviewer.email)}`);
    expect(removed.status()).toBe(200);

    const after = await reviewer.client.get('/api/v1/reports');
    expect([401, 403]).toContain(after.status());
    await Promise.all([admin.dispose(), reviewer.client.dispose()]);
  });

  test('granting access validates email, role and duplicates', async () => {
    const admin = await adminClient();

    const badEmail = await admin.post('/api/v1/access', { data: { email: 'not-an-email', role: 'Reviewer' } });
    expect(badEmail.status()).toBe(400);

    const badRole = await admin.post('/api/v1/access', { data: { email: uniqueEmail(), role: 'Owner' } });
    expect(badRole.status()).toBe(400);
    expect((await badRole.json()).error).toBe('role must be Reviewer or Admin');

    const email = uniqueEmail();
    expect((await admin.post('/api/v1/access', { data: { email, role: 'Reviewer' } })).status()).toBe(201);
    const duplicate = await admin.post('/api/v1/access', { data: { email: email.toUpperCase(), role: 'Reviewer' } });
    expect(duplicate.status()).toBe(409);

    await admin.dispose();
  });

  test('admin actions are written to the audit log', async () => {
    const admin = await adminClient();
    const email = uniqueEmail('audited');
    await admin.post('/api/v1/access', { data: { email, role: 'Reviewer' } });

    const audit = await (await admin.get('/api/v1/audit?limit=200')).json();
    const grant = audit.events.find(
      (event: any) => event.action === 'access.granted' && event.targetEmail === email
    );
    expect(grant, 'access.granted audit event for the new user').toBeTruthy();
    await admin.dispose();
  });
});

test.describe('Role changes and final-admin protection', () => {
  // Serial: these tests temporarily change how many Admins exist, so they must not overlap.
  test.describe.configure({ mode: 'serial' });

  test('admins can change a user role, and the new role takes effect', async () => {
    const admin = await adminClient();
    const reviewer = await createAccount(admin, 'Reviewer');
    expect((await reviewer.client.get('/api/v1/access')).status()).toBe(403);

    const promote = await admin.patch(`/api/v1/access/${encodeURIComponent(reviewer.email)}`, {
      data: { role: 'Admin' }
    });
    expect(promote.status()).toBe(200);
    expect((await promote.json()).user.role).toBe('Admin');
    expect((await reviewer.client.get('/api/v1/access')).status()).toBe(200);

    // Demote again so the bootstrap account is the only Admin for the next test.
    await admin.patch(`/api/v1/access/${encodeURIComponent(reviewer.email)}`, { data: { role: 'Reviewer' } });
    await Promise.all([admin.dispose(), reviewer.client.dispose()]);
  });

  test('the last remaining admin cannot be demoted or removed', async () => {
    const admin = await adminClient();
    const { users } = await (await admin.get('/api/v1/access')).json();
    const admins = users.filter((user: any) => user.role === 'Admin');
    test.skip(admins.length !== 1, `Precondition: exactly one Admin (found ${admins.length}); reset the test database.`);

    const target = encodeURIComponent(ADMIN.email);
    const demote = await admin.patch(`/api/v1/access/${target}`, { data: { role: 'Reviewer' } });
    expect(demote.status()).toBe(409);
    expect((await demote.json()).error).toBe('The final active admin cannot be demoted.');

    const remove = await admin.delete(`/api/v1/access/${target}`);
    expect(remove.status()).toBe(409);

    expect((await admin.get('/api/v1/access')).status()).toBe(200);
    await admin.dispose();
  });
});
