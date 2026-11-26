import path from 'node:path';

/** Shared, synthetic-only test configuration. Never point these at real accounts. */
export const BASE_URL = (process.env.BASE_URL || 'http://localhost:8787').replace(/\/$/, '');
export const RECEIVER_URL = (process.env.RECEIVER_URL || 'http://localhost:9797').replace(/\/$/, '');
export const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'bugbridge-e2e-secret';

export const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL || 'admin@example.com',
  name: process.env.E2E_ADMIN_NAME || 'E2E Admin',
  password: process.env.E2E_ADMIN_PASSWORD || 'e2e-admin-password-123'
};

/** Saved admin session shared by the UI tests (written by tests/auth.setup.ts). */
export const ADMIN_STORAGE_STATE = path.join(__dirname, '..', '.auth', 'admin.json');

export const STATUSES = [
  'Open',
  'Needs Info',
  'In Review',
  'In Development',
  'Ready for Retest',
  'Resolved'
] as const;

export type Status = (typeof STATUSES)[number];
