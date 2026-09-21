import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const scryptAsync = (password, salt, length, options) => new Promise((resolve, reject) => {
  crypto.scrypt(password, salt, length, options, (error, derivedKey) => {
    if (error) reject(error);
    else resolve(derivedKey);
  });
});

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function poolOptions(databaseUrl) {
  const useSsl = String(process.env.DATABASE_SSL || '').toLowerCase() === 'true';
  return {
    connectionString: databaseUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined
  };
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function parseCookies(header = '') {
  return Object.fromEntries(
    String(header)
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        if (index === -1) return [part, ''];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 10) {
    throw Object.assign(new Error('Password must be at least 10 characters.'), { status: 400 });
  }
  if (password.length > 200) {
    throw Object.assign(new Error('Password is too long.'), { status: 400 });
  }
}

async function hashPassword(password) {
  validatePassword(password);
  const salt = crypto.randomBytes(16);
  const N = 16384;
  const r = 8;
  const p = 1;
  const derived = await scryptAsync(password, salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || typeof encoded !== 'string') return false;
  const [scheme, nText, rText, pText, saltText, hashText] = encoded.split('$');
  if (scheme !== 'scrypt' || !saltText || !hashText) return false;
  const N = Number(nText);
  const r = Number(rText);
  const p = Number(pText);
  if (![N, r, p].every(Number.isFinite)) return false;
  const salt = Buffer.from(saltText, 'base64');
  const expected = Buffer.from(hashText, 'base64');
  const actual = await scryptAsync(password, salt, expected.length, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function cleanText(value, max, label, { required = false } = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (required && !text) throw Object.assign(new Error(`${label} is required.`), { status: 400 });
  if (text.length > max) throw Object.assign(new Error(`${label} must be ${max} characters or fewer.`), { status: 400 });
  return text || null;
}

export function createLocalAuthService({ databaseUrl = process.env.DATABASE_URL?.trim() } = {}) {
  if (!databaseUrl) {
    return {
      kind: 'unavailable',
      async close() {},
      async bootstrapAccount() { return null; },
      async resolveRequest() { return { authenticated: false, source: 'local_account', email: '', name: '', userId: '' }; },
      async createInvite() { throw new Error('Local accounts require PostgreSQL.'); },
      async acceptInvite() { throw new Error('Local accounts require PostgreSQL.'); },
      async login() { throw new Error('Local accounts require PostgreSQL.'); },
      async logout() {},
      async changePassword() { throw new Error('Local accounts require PostgreSQL.'); },
      async listAccountStates() { return {}; },
      sessionCookieName: 'bugbridge_session'
    };
  }

  const pool = new Pool(poolOptions(databaseUrl));
  const sessionCookieName = String(process.env.LOCAL_AUTH_COOKIE_NAME || 'bugbridge_session').trim();
  const sessionHours = Math.max(1, Math.min(24 * 30, Number(process.env.LOCAL_AUTH_SESSION_HOURS || 12)));
  const inviteHours = Math.max(1, Math.min(24 * 14, Number(process.env.LOCAL_AUTH_INVITE_HOURS || 48)));

  async function recordAudit(client, { actorEmail, action, targetEmail, metadata = {} }) {
    await client.query(
      `INSERT INTO audit_events (actor_email, action, target_email, metadata)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [normalizeEmail(actorEmail) || 'system', action, normalizeEmail(targetEmail) || null, JSON.stringify(metadata)]
    );
  }

  async function createSession(email, client = pool) {
    const token = crypto.randomBytes(32).toString('base64url');
    const hash = tokenHash(token);
    const expiresAt = new Date(Date.now() + sessionHours * 60 * 60 * 1000);
    await client.query(
      `INSERT INTO auth_sessions (token_hash, email, expires_at)
       VALUES ($1, $2, $3)`,
      [hash, normalizeEmail(email), expiresAt.toISOString()]
    );
    return { token, expiresAt };
  }

  return {
    kind: 'postgres',
    sessionCookieName,

    async close() {
      await pool.end();
    },

    async bootstrapAccount(email, password) {
      const normalized = normalizeEmail(email);
      if (!normalized || !password) return null;
      const exists = await pool.query('SELECT email FROM bugbridge_access WHERE email = $1', [normalized]);
      if (!exists.rowCount) return null;
      const current = await pool.query('SELECT email FROM local_accounts WHERE email = $1', [normalized]);
      if (current.rowCount) return null;
      const passwordHash = await hashPassword(password);
      await pool.query(
        `INSERT INTO local_accounts (email, password_hash, activated_at, password_updated_at)
         VALUES ($1, $2, NOW(), NOW())`,
        [normalized, passwordHash]
      );
      await pool.query(
        `INSERT INTO audit_events (actor_email, action, target_email, metadata)
         VALUES ('system', 'account.bootstrap_local', $1, '{}'::jsonb)`,
        [normalized]
      );
      return { email: normalized };
    },

    async resolveRequest(req) {
      const cookies = parseCookies(req.headers?.cookie || '');
      const token = cookies[sessionCookieName];
      if (!token) return { authenticated: false, source: 'local_account', email: '', name: '', userId: '' };
      const hash = tokenHash(token);
      const result = await pool.query(
        `SELECT s.email, a.display_name
         FROM auth_sessions s
         JOIN bugbridge_access a ON a.email = s.email
         WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
        [hash]
      );
      if (!result.rowCount) return { authenticated: false, source: 'local_account', email: '', name: '', userId: '' };
      const row = result.rows[0];
      void pool.query('UPDATE auth_sessions SET last_seen_at = NOW() WHERE token_hash = $1', [hash]).catch(() => {});
      return {
        authenticated: true,
        bypass: false,
        source: 'local_account',
        email: row.email,
        name: row.display_name || row.email,
        userId: row.email
      };
    },

    async createInvite({ email, actorEmail, baseUrl }) {
      const normalized = normalizeEmail(email);
      const access = await pool.query('SELECT email, role FROM bugbridge_access WHERE email = $1', [normalized]);
      if (!access.rowCount) throw Object.assign(new Error('BugBridge access entry not found.'), { status: 404 });
      const token = crypto.randomBytes(32).toString('base64url');
      const hash = tokenHash(token);
      const expiresAt = new Date(Date.now() + inviteHours * 60 * 60 * 1000);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM account_invites WHERE email = $1 AND accepted_at IS NULL', [normalized]);
        await client.query(
          `INSERT INTO account_invites (token_hash, email, created_by, expires_at)
           VALUES ($1, $2, $3, $4)`,
          [hash, normalized, normalizeEmail(actorEmail), expiresAt.toISOString()]
        );
        await recordAudit(client, {
          actorEmail,
          action: 'account.invite_created',
          targetEmail: normalized,
          metadata: { expiresAt: expiresAt.toISOString() }
        });
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      const origin = String(baseUrl || '').replace(/\/$/, '');
      return {
        email: normalized,
        role: access.rows[0].role,
        token,
        inviteUrl: `${origin}/invite.html?token=${encodeURIComponent(token)}`,
        expiresAt: expiresAt.toISOString()
      };
    },

    async markInviteSent(token) {
      await pool.query('UPDATE account_invites SET sent_at = NOW() WHERE token_hash = $1', [tokenHash(token)]);
    },

    async inspectInvite(token) {
      const result = await pool.query(
        `SELECT i.email, i.expires_at AS "expiresAt", i.accepted_at AS "acceptedAt",
                a.role, a.display_name AS "displayName", a.job_title AS "jobTitle"
         FROM account_invites i
         JOIN bugbridge_access a ON a.email = i.email
         WHERE i.token_hash = $1`,
        [tokenHash(String(token || ''))]
      );
      if (!result.rowCount) return null;
      const invite = result.rows[0];
      return {
        ...invite,
        expired: new Date(invite.expiresAt).getTime() <= Date.now(),
        accepted: Boolean(invite.acceptedAt)
      };
    },

    async acceptInvite({ token, displayName, jobTitle, password }) {
      const cleanName = cleanText(displayName, 120, 'Display name', { required: true });
      const cleanTitle = cleanText(jobTitle, 160, 'Job title');
      const passwordHash = await hashPassword(password);
      const hash = tokenHash(String(token || ''));
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const inviteResult = await client.query(
          `SELECT * FROM account_invites
           WHERE token_hash = $1 FOR UPDATE`,
          [hash]
        );
        const invite = inviteResult.rows[0];
        if (!invite || invite.accepted_at || new Date(invite.expires_at).getTime() <= Date.now()) {
          throw Object.assign(new Error('This invitation is invalid, expired, or already used.'), { status: 400 });
        }
        await client.query(
          `UPDATE bugbridge_access
           SET display_name = $2, job_title = $3, updated_at = NOW(), updated_by = $1
           WHERE email = $1`,
          [invite.email, cleanName, cleanTitle]
        );
        await client.query(
          `INSERT INTO local_accounts (email, password_hash, activated_at, password_updated_at)
           VALUES ($1, $2, NOW(), NOW())
           ON CONFLICT (email) DO UPDATE
           SET password_hash = EXCLUDED.password_hash,
               activated_at = COALESCE(local_accounts.activated_at, NOW()),
               password_updated_at = NOW()`,
          [invite.email, passwordHash]
        );
        await client.query('DELETE FROM auth_sessions WHERE email = $1', [invite.email]);
        await client.query('UPDATE account_invites SET accepted_at = NOW() WHERE token_hash = $1', [hash]);
        await recordAudit(client, {
          actorEmail: invite.email,
          action: 'account.activated',
          targetEmail: invite.email,
          metadata: { displayName: cleanName, jobTitle: cleanTitle, priorSessionsRevoked: true }
        });
        const session = await createSession(invite.email, client);
        await client.query('COMMIT');
        return { email: invite.email, session };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async login(email, password) {
      const normalized = normalizeEmail(email);
      const result = await pool.query(
        `SELECT l.email, l.password_hash
         FROM local_accounts l
         JOIN bugbridge_access a ON a.email = l.email
         WHERE l.email = $1`,
        [normalized]
      );
      const row = result.rows[0];
      if (!row || !(await verifyPassword(password, row.password_hash))) {
        throw Object.assign(new Error('Invalid email or password.'), { status: 401 });
      }
      const session = await createSession(normalized);
      await pool.query('UPDATE local_accounts SET last_login_at = NOW() WHERE email = $1', [normalized]);
      return { email: normalized, session };
    },

    async logoutFromRequest(req) {
      const cookies = parseCookies(req.headers?.cookie || '');
      const token = cookies[sessionCookieName];
      if (!token) return;
      await pool.query('DELETE FROM auth_sessions WHERE token_hash = $1', [tokenHash(token)]);
    },

    async changePassword(email, currentPassword, newPassword) {
      const normalized = normalizeEmail(email);
      const result = await pool.query('SELECT password_hash FROM local_accounts WHERE email = $1', [normalized]);
      const current = result.rows[0]?.password_hash;
      if (!current || !(await verifyPassword(currentPassword, current))) {
        throw Object.assign(new Error('Current password is incorrect.'), { status: 400 });
      }
      const nextHash = await hashPassword(newPassword);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE local_accounts SET password_hash = $2, password_updated_at = NOW() WHERE email = $1`,
          [normalized, nextHash]
        );
        await client.query('DELETE FROM auth_sessions WHERE email = $1', [normalized]);
        await recordAudit(client, {
          actorEmail: normalized,
          action: 'account.password_changed',
          targetEmail: normalized
        });
        const session = await createSession(normalized, client);
        await client.query('COMMIT');
        return { session };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async listAccountStates() {
      const result = await pool.query(
        `SELECT a.email,
                CASE WHEN l.email IS NOT NULL THEN 'Active'
                     WHEN EXISTS (
                       SELECT 1 FROM account_invites i
                       WHERE i.email = a.email AND i.accepted_at IS NULL AND i.expires_at > NOW()
                     ) THEN 'Invited'
                     ELSE 'Not invited' END AS status,
                l.activated_at AS "activatedAt",
                l.last_login_at AS "lastLoginAt"
         FROM bugbridge_access a
         LEFT JOIN local_accounts l ON l.email = a.email`
      );
      return Object.fromEntries(result.rows.map((row) => [row.email, row]));
    }
  };
}
