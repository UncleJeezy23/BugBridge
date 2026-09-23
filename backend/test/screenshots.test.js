import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createScreenshotStore } from '../src/screenshots.js';

const file = { buffer: Buffer.from('screenshot bytes'), mimetype: 'image/png' };
const r2 = { SCREENSHOT_STORAGE: 'r2', R2_ENDPOINT: 'https://test.r2.cloudflarestorage.com',
  R2_BUCKET: 'test', R2_ACCESS_KEY_ID: 'test', R2_SECRET_ACCESS_KEY: 'test' };

test('local screenshots survive new store instances and support deletion', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bugbridge-'));
  try {
    const store = createScreenshotStore({ uploadDir: dir, env: {} });
    const key = await store.save(file);
    const restarted = createScreenshotStore({ uploadDir: dir, env: {} });
    assert.deepEqual(await restarted.read(key), file.buffer);
    await assert.rejects(restarted.read('../private'));
    await restarted.remove(key);
    await assert.rejects(restarted.read(key), { code: 'ENOENT' });
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('R2 roundtrip uses private object operations without public URLs', async () => {
  const objects = new Map();
  const client = { async send(command) {
    const { Bucket, Key, Body } = command.input;
    assert.equal(Bucket, 'test');
    assert.equal(command.input.ACL, undefined);
    if (command.constructor.name === 'PutObjectCommand') objects.set(Key, Body);
    if (command.constructor.name === 'GetObjectCommand') return { Body: { async transformToByteArray() { return objects.get(Key); } } };
    if (command.constructor.name === 'DeleteObjectCommand') objects.delete(Key);
    return {};
  } };
  const store = createScreenshotStore({ env: r2, client });
  const key = await store.save(file);
  assert.deepEqual(await createScreenshotStore({ env: r2, client }).read(key), file.buffer);
  await store.remove(key);
  assert.equal(objects.size, 0);
});

test('R2 configuration and service errors never fall back to temporary disk', async () => {
  assert.throws(() => createScreenshotStore({ env: { SCREENSHOT_STORAGE: 'r2' } }), /R2_ENDPOINT/);
  assert.throws(() => createScreenshotStore({ env: { ...r2, R2_ENDPOINT: 'http://insecure' } }), /HTTPS/);
  const store = createScreenshotStore({ env: r2, client: { async send() { throw new Error('unavailable'); } } });
  await assert.rejects(store.save(file), /unavailable/);
  await assert.rejects(store.read('safe.png'), /unavailable/);
});
