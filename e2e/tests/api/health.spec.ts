import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const backendVersion = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../backend/package.json'), 'utf8')
).version;

test.describe('Health and API documentation', () => {
  test('health reports ok, PostgreSQL storage and the current version', async ({ request }) => {
    const response = await request.get('/health');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      service: 'bugbridge-backend',
      version: backendVersion,
      ticketStorage: 'postgres',
      identityMode: 'local_account',
      webhooks: 'configured'
    });
  });

  test('OpenAPI document is served and covers the report endpoints', async ({ request }) => {
    const response = await request.get('/api/openapi.json');
    expect(response.status()).toBe(200);
    const spec = await response.json();
    expect(spec.openapi).toMatch(/^3\./);
    const paths = Object.keys(spec.paths || {});
    expect(paths.some((p) => p.includes('/reports'))).toBeTruthy();
  });

  test('auth config advertises local accounts and is not cached', async ({ request }) => {
    const response = await request.get('/api/v1/auth/config');
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(await response.json()).toMatchObject({ ok: true, mode: 'local_account', localAccountEnabled: true });
  });
});
