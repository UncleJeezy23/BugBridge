import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import { ADMIN, ADMIN_STORAGE_STATE, BASE_URL, RECEIVER_URL, WEBHOOK_SECRET } from './support/env';

/**
 * BugBridge Playwright configuration.
 *
 * By default Playwright starts the backend and the signed-webhook receiver itself,
 * pointed at the PostgreSQL database in DATABASE_URL. Set BASE_URL to run the suite
 * against an already-running stack (for example `docker compose up`) instead.
 */
const externalStack = Boolean(process.env.BASE_URL);
const backendDir = path.resolve(__dirname, '../backend');
const databaseUrl = process.env.DATABASE_URL || 'postgresql://bugbridge:bugbridge@localhost:5432/bugbridge';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }], ['github']]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/
    },
    {
      name: 'api',
      testMatch: /api\/.*\.spec\.ts/
    },
    {
      name: 'ui',
      testMatch: /ui\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: ADMIN_STORAGE_STATE
      }
    }
  ],
  webServer: externalStack
    ? undefined
    : [
        {
          name: 'webhook-receiver',
          command: 'node src/webhook-receiver.js',
          cwd: backendDir,
          url: `${RECEIVER_URL}/health`,
          reuseExistingServer: !process.env.CI,
          env: {
            WEBHOOK_RECEIVER_PORT: new URL(RECEIVER_URL).port,
            WEBHOOK_SECRET
          }
        },
        {
          name: 'bugbridge',
          command: 'npm run migrate && npm start',
          cwd: backendDir,
          url: `${BASE_URL}/health`,
          timeout: 60_000,
          reuseExistingServer: !process.env.CI,
          env: {
            PORT: new URL(BASE_URL).port,
            PUBLIC_BASE_URL: BASE_URL,
            STORAGE_ROOT: path.join(os.tmpdir(), 'bugbridge-e2e-storage'),
            DATABASE_URL: databaseUrl,
            DATABASE_SSL: 'false',
            IDENTITY_MODE: 'local_account',
            ALLOWED_IDENTITY_DOMAIN: 'example.com',
            ENFORCE_IDENTITY_DOMAIN: 'false',
            LOCAL_AUTH_SECURE_COOKIE: 'false',
            BOOTSTRAP_ADMIN_EMAIL: ADMIN.email,
            BOOTSTRAP_ADMIN_NAME: ADMIN.name,
            LOCAL_AUTH_BOOTSTRAP_PASSWORD: ADMIN.password,
            WEBHOOK_URL: `${RECEIVER_URL}/events`,
            WEBHOOK_SECRET,
            WEBHOOK_MAX_ATTEMPTS: '3'
          }
        }
      ]
});
