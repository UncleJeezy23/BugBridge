import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

export function createScreenshotStore({ uploadDir, env = process.env, client } = {}) {
  const kind = env.SCREENSHOT_STORAGE || 'local';
  if (!['local', 'r2'].includes(kind)) throw new Error('SCREENSHOT_STORAGE must be local or r2.');
  if (kind === 'r2') {
    for (const key of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) {
      if (!env[key]?.trim()) throw new Error(`${key} is required for R2 screenshot storage.`);
    }
    if (new URL(env.R2_ENDPOINT).protocol !== 'https:') throw new Error('R2_ENDPOINT must use HTTPS.');
    client ||= new S3Client({
      region: 'auto', endpoint: env.R2_ENDPOINT,
      credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
      requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED'
    });
  }
  function validateKey(key) {
    if (!key || key !== path.basename(key) || key === '.' || key === '..') throw new Error('Invalid screenshot key.');
    return key;
  }
  return {
    kind,
    async save(file) {
      const key = `${crypto.randomUUID()}${file.mimetype === 'image/jpeg' ? '.jpg' : '.png'}`;
      if (kind === 'r2') {
        await client.send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, Body: file.buffer, ContentType: file.mimetype }));
      } else {
        await fs.mkdir(uploadDir, { recursive: true });
        await fs.writeFile(path.join(uploadDir, key), file.buffer);
      }
      return key;
    },
    async read(key) {
      validateKey(key);
      if (kind === 'local') return fs.readFile(path.join(uploadDir, key));
      const response = await client.send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
      return Buffer.from(await response.Body.transformToByteArray());
    },
    async remove(key) {
      validateKey(key);
      if (kind === 'local') return fs.rm(path.join(uploadDir, key), { force: true });
      await client.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
    }
  };
}
