import pg from 'pg';

const { Pool } = pg;

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function allowedDomain() {
  return String(process.env.ALLOWED_IDENTITY_DOMAIN || 'example.com').trim().toLowerCase();
}

function domainEnforced() {
  return String(process.env.ENFORCE_IDENTITY_DOMAIN ?? 'true').trim().toLowerCase() !== 'false';
}

function isValidEmailShape(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isAllowedCompanyEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized || !isValidEmailShape(normalized)) return false;
  if (!domainEnforced()) return true;
  const domain = allowedDomain();
  return Boolean(domain && normalized.endsWith(`@${domain}`));
}

function poolOptions(databaseUrl) {
  const useSsl = String(process.env.DATABASE_SSL || '').toLowerCase() === 'true';
  return {
    connectionString: databaseUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined
  };
}

function cleanProfileText(value, max, label, { required = false } = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (required && !text) {
    throw Object.assign(new Error(`${label} is required.`), { status: 400 });
  }
  if (text.length > max) {
    throw Object.assign(new Error(`${label} must be ${max} characters or fewer.`), { status: 400 });
  }
  return text || null;
}

export function createIdentityProvider() {
  const mode = String(process.env.IDENTITY_MODE || 'disabled').trim().toLowerCase();
  const emailHeader = String(process.env.IDENTITY_EMAIL_HEADER || 'x-authenticated-email').toLowerCase();
  const nameHeader = String(process.env.IDENTITY_NAME_HEADER || 'x-authenticated-name').toLowerCase();
  const idHeader = String(process.env.IDENTITY_ID_HEADER || 'x-authenticated-user-id').toLowerCase();

  function resolve(req) {
    if (mode === 'disabled') {
      return {
        authenticated: true,
        bypass: true,
        source: 'disabled',
        email: 'local-dev@bugbridge.local',
        name: 'Local Development',
        userId: 'local-dev'
      };
    }

    if (mode === 'demo') {
      const email = normalizeEmail(process.env.DEMO_IDENTITY_EMAIL || 'admin@example.com');
      return {
        authenticated: Boolean(email),
        bypass: false,
        source: 'demo',
        email,
        name: process.env.DEMO_IDENTITY_NAME?.trim() || 'Portfolio Demo Admin',
        userId: email
      };
    }

    if (mode === 'local_account') {
      return { authenticated: false, bypass: false, source: 'local_account', email: '', name: '', userId: '' };
    }

    if (mode === 'upstream_header') {
      const email = normalizeEmail(req.get(emailHeader));
      if (!email) {
        return { authenticated: false, bypass: false, source: 'upstream_header', email: '', name: '', userId: '' };
      }
      return {
        authenticated: true,
        bypass: false,
        source: 'upstream_header',
        email,
        name: req.get(nameHeader)?.trim() || email,
        userId: req.get(idHeader)?.trim() || email
      };
    }

    throw new Error(`Unsupported IDENTITY_MODE: ${mode}`);
  }

  return { mode, resolve };
}

export function createAccessService({ databaseUrl = process.env.DATABASE_URL?.trim() } = {}) {
  if (!databaseUrl) {
    return {
      kind: 'unavailable',
      async close() {},
      async bootstrapAdmin() { return null; },
      async getAccess() { return null; },
      async listAccess() { return []; },
      async listAssignableUsers() { return []; },
      async listAudit() { return []; },
      async addAccess() { throw new Error('Access management requires PostgreSQL.'); },
      async updateAccess() { throw new Error('Access management requires PostgreSQL.'); },
      async updateOwnProfile() { throw new Error('Profile management requires PostgreSQL.'); },
      async removeAccess() { throw new Error('Access management requires PostgreSQL.'); }
    };
  }

  const pool = new Pool(poolOptions(databaseUrl));

  async function recordAudit(client, { actorEmail, action, targetEmail = null, metadata = {} }) {
    await client.query(
      `INSERT INTO audit_events (actor_email, action, target_email, metadata)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [normalizeEmail(actorEmail) || 'system', action, normalizeEmail(targetEmail) || null, JSON.stringify(metadata)]
    );
  }

  async function adminCount(client = pool) {
    const result = await client.query(`SELECT COUNT(*)::int AS count FROM bugbridge_access WHERE role = 'Admin'`);
    return result.rows[0]?.count || 0;
  }

  return {
    kind: 'postgres',

    async close() {
      await pool.end();
    },

    async bootstrapAdmin(email, displayName = 'Bootstrap Admin') {
      const normalized = normalizeEmail(email);
      if (!normalized) return null;
      if (!isAllowedCompanyEmail(normalized)) {
        const message = domainEnforced()
          ? `BOOTSTRAP_ADMIN_EMAIL must use @${allowedDomain()}`
          : 'BOOTSTRAP_ADMIN_EMAIL must be a valid email address.';
        throw new Error(message);
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const existing = await client.query('SELECT COUNT(*)::int AS count FROM bugbridge_access');
        if ((existing.rows[0]?.count || 0) > 0) {
          await client.query('COMMIT');
          return null;
        }

        await client.query(
          `INSERT INTO bugbridge_access (email, display_name, role, created_by, updated_by)
           VALUES ($1, $2, 'Admin', 'system', 'system')`,
          [normalized, displayName]
        );
        await recordAudit(client, {
          actorEmail: 'system',
          action: 'access.bootstrap_admin',
          targetEmail: normalized,
          metadata: { role: 'Admin' }
        });
        await client.query('COMMIT');
        return this.getAccess(normalized);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async getAccess(email) {
      const normalized = normalizeEmail(email);
      if (!normalized) return null;
      const result = await pool.query(
        `SELECT email, display_name AS "displayName", job_title AS "jobTitle", role,
                created_at AS "createdAt", created_by AS "createdBy",
                updated_at AS "updatedAt", updated_by AS "updatedBy"
         FROM bugbridge_access WHERE email = $1`,
        [normalized]
      );
      return result.rows[0] || null;
    },

    async listAccess() {
      const result = await pool.query(
        `SELECT email, display_name AS "displayName", job_title AS "jobTitle", role,
                created_at AS "createdAt", created_by AS "createdBy",
                updated_at AS "updatedAt", updated_by AS "updatedBy"
         FROM bugbridge_access
         ORDER BY CASE WHEN role = 'Admin' THEN 0 ELSE 1 END, COALESCE(display_name, email), email`
      );
      return result.rows;
    },

    async listAssignableUsers() {
      const result = await pool.query(
        `SELECT email, display_name AS "displayName", job_title AS "jobTitle", role
         FROM bugbridge_access
         WHERE role IN ('Reviewer', 'Admin')
         ORDER BY COALESCE(display_name, email), email`
      );
      return result.rows;
    },

    async listAudit(limit = 100) {
      const safeLimit = Math.max(1, Math.min(250, Number(limit) || 100));
      const result = await pool.query(
        `SELECT id, actor_email AS "actorEmail", action, target_email AS "targetEmail",
                metadata, created_at AS "createdAt"
         FROM audit_events
         ORDER BY created_at DESC
         LIMIT $1`,
        [safeLimit]
      );
      return result.rows;
    },

    async addAccess({ email, displayName = '', jobTitle = '', role, actorEmail }) {
      const normalized = normalizeEmail(email);
      if (!isAllowedCompanyEmail(normalized)) {
        const message = domainEnforced()
          ? `Access can only be granted to @${allowedDomain()} addresses.`
          : 'Enter a valid email address.';
        throw Object.assign(new Error(message), { status: 400 });
      }
      if (!['Reviewer', 'Admin'].includes(role)) {
        throw Object.assign(new Error('role must be Reviewer or Admin'), { status: 400 });
      }
      const cleanName = cleanProfileText(displayName, 120, 'Display name');
      const cleanTitle = cleanProfileText(jobTitle, 160, 'Job title');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(
          `INSERT INTO bugbridge_access (email, display_name, job_title, role, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, $5)
           ON CONFLICT (email) DO NOTHING
           RETURNING email`,
          [normalized, cleanName, cleanTitle, role, normalizeEmail(actorEmail)]
        );
        if (!result.rowCount) {
          throw Object.assign(new Error('That user already has dashboard access.'), { status: 409 });
        }
        await recordAudit(client, {
          actorEmail,
          action: 'access.granted',
          targetEmail: normalized,
          metadata: { role, displayName: cleanName, jobTitle: cleanTitle }
        });
        await client.query('COMMIT');
        return this.getAccess(normalized);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async updateAccess(email, { role, displayName, jobTitle, actorEmail }) {
      const normalized = normalizeEmail(email);
      if (!['Reviewer', 'Admin'].includes(role)) {
        throw Object.assign(new Error('role must be Reviewer or Admin'), { status: 400 });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const currentResult = await client.query('SELECT * FROM bugbridge_access WHERE email = $1 FOR UPDATE', [normalized]);
        const current = currentResult.rows[0];
        if (!current) {
          await client.query('ROLLBACK');
          return null;
        }

        if (current.role === 'Admin' && role !== 'Admin' && await adminCount(client) <= 1) {
          throw Object.assign(new Error('The final active admin cannot be demoted.'), { status: 409 });
        }

        const nextName = displayName === undefined
          ? current.display_name
          : cleanProfileText(displayName, 120, 'Display name');
        const nextTitle = jobTitle === undefined
          ? current.job_title
          : cleanProfileText(jobTitle, 160, 'Job title');

        await client.query(
          `UPDATE bugbridge_access
           SET role = $2, display_name = $3, job_title = $4, updated_at = NOW(), updated_by = $5
           WHERE email = $1`,
          [normalized, role, nextName, nextTitle, normalizeEmail(actorEmail)]
        );
        await recordAudit(client, {
          actorEmail,
          action: 'access.updated',
          targetEmail: normalized,
          metadata: {
            fromRole: current.role,
            toRole: role,
            displayName: nextName,
            jobTitle: nextTitle
          }
        });
        await client.query('COMMIT');
        return this.getAccess(normalized);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async updateOwnProfile(email, { displayName, jobTitle }) {
      const normalized = normalizeEmail(email);
      const cleanName = cleanProfileText(displayName, 120, 'Display name', { required: true });
      const cleanTitle = cleanProfileText(jobTitle, 160, 'Job title');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const currentResult = await client.query('SELECT * FROM bugbridge_access WHERE email = $1 FOR UPDATE', [normalized]);
        const current = currentResult.rows[0];
        if (!current) {
          await client.query('ROLLBACK');
          return null;
        }

        await client.query(
          `UPDATE bugbridge_access
           SET display_name = $2, job_title = $3, updated_at = NOW(), updated_by = $1
           WHERE email = $1`,
          [normalized, cleanName, cleanTitle]
        );
        await recordAudit(client, {
          actorEmail: normalized,
          action: 'profile.updated',
          targetEmail: normalized,
          metadata: {
            previousDisplayName: current.display_name,
            displayName: cleanName,
            previousJobTitle: current.job_title,
            jobTitle: cleanTitle
          }
        });
        await client.query('COMMIT');
        return this.getAccess(normalized);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async removeAccess(email, { actorEmail }) {
      const normalized = normalizeEmail(email);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const currentResult = await client.query('SELECT * FROM bugbridge_access WHERE email = $1 FOR UPDATE', [normalized]);
        const current = currentResult.rows[0];
        if (!current) {
          await client.query('ROLLBACK');
          return false;
        }

        if (current.role === 'Admin' && await adminCount(client) <= 1) {
          throw Object.assign(new Error('The final active admin cannot be removed.'), { status: 409 });
        }

        await client.query('DELETE FROM bugbridge_access WHERE email = $1', [normalized]);
        await recordAudit(client, {
          actorEmail,
          action: 'access.revoked',
          targetEmail: normalized,
          metadata: { previousRole: current.role }
        });
        await client.query('COMMIT');
        return true;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  };
}

export function companyEmailAllowed(email) {
  return isAllowedCompanyEmail(email);
}

export function identityDomainEnforced() {
  return domainEnforced();
}
