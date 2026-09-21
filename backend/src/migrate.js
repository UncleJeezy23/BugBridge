import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.log('DATABASE_URL not set; skipping PostgreSQL migrations.');
  process.exit(0);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '..', 'migrations');
const useSsl = String(process.env.DATABASE_SSL || '').toLowerCase() === 'true';
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined
});

const client = await pool.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await fs.readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const filename of files) {
    const alreadyApplied = await client.query(
      'SELECT 1 FROM schema_migrations WHERE filename = $1',
      [filename]
    );
    if (alreadyApplied.rowCount) continue;

    const sql = await fs.readFile(path.join(migrationsDir, filename), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [filename]
      );
      await client.query('COMMIT');
      console.log(`Applied migration ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  console.log('PostgreSQL migrations are up to date.');
} finally {
  client.release();
  await pool.end();
}
