import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

function normalizeActivityEvent(event) {
  return {
    id: event.id || crypto.randomUUID(),
    reportId: event.reportId,
    type: event.type,
    actorEmail: event.actorEmail || null,
    actorName: event.actorName || null,
    metadata: event.metadata && typeof event.metadata === 'object' ? event.metadata : {},
    createdAt: event.createdAt || new Date().toISOString()
  };
}

function createActivityEvent(reportId, type, { actor = {}, metadata = {}, createdAt } = {}) {
  return normalizeActivityEvent({
    id: crypto.randomUUID(),
    reportId,
    type,
    actorEmail: actor.email || null,
    actorName: actor.name || actor.email || null,
    metadata,
    createdAt: createdAt || new Date().toISOString()
  });
}

function normalizeReport(report) {
  return {
    ...report,
    status: report.status || 'Open',
    notes: Array.isArray(report.notes) ? report.notes : [],
    activity: Array.isArray(report.activity) ? report.activity.map(normalizeActivityEvent) : [],
    assignedToEmail: report.assignedToEmail || report.assignedTo?.email || null,
    assignedTo: report.assignedTo || (report.assignedToEmail ? { email: report.assignedToEmail } : null),
    assignedAt: report.assignedAt || null,
    assignedBy: report.assignedBy || null,
    updatedAt: report.updatedAt || report.statusUpdatedAt || report.createdAt || new Date().toISOString()
  };
}

function legacyActivity(report) {
  const events = [
    normalizeActivityEvent({
      id: `legacy-created-${report.id}`,
      reportId: report.id,
      type: 'report.created',
      actorName: 'Employee reporter',
      metadata: { type: report.type, impact: report.impact, backfilled: true },
      createdAt: report.createdAt
    })
  ];

  for (const note of report.notes || []) {
    events.push(normalizeActivityEvent({
      id: `legacy-note-${note.id || crypto.randomUUID()}`,
      reportId: report.id,
      type: 'report.note_added',
      actorName: note.author || 'Historical activity',
      metadata: { noteId: note.id || null, text: note.text || '', backfilled: true },
      createdAt: note.createdAt || report.createdAt
    }));
  }

  if (report.statusUpdatedAt) {
    events.push(normalizeActivityEvent({
      id: `legacy-status-${report.id}`,
      reportId: report.id,
      type: 'report.status_changed',
      actorName: 'Historical activity',
      metadata: { previousStatus: null, status: report.status, backfilled: true },
      createdAt: report.statusUpdatedAt
    }));
  }

  if (report.assignedToEmail && report.assignedAt) {
    events.push(normalizeActivityEvent({
      id: `legacy-assignment-${report.id}`,
      reportId: report.id,
      type: 'report.assignee_changed',
      actorEmail: report.assignedBy || null,
      actorName: report.assignedBy || 'Historical activity',
      metadata: { previousAssignee: null, assignee: report.assignedTo || { email: report.assignedToEmail }, backfilled: true },
      createdAt: report.assignedAt
    }));
  }

  return events.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id));
}

function createMutationQueue() {
  let queue = Promise.resolve();
  return (task) => {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  };
}

function createFileRepository(reportLogPath) {
  const queueMutation = createMutationQueue();

  async function readReports() {
    try {
      const content = await fs.readFile(reportLogPath, 'utf8');
      return content
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .map(normalizeReport);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async function writeReports(reports) {
    const tempPath = `${reportLogPath}.tmp`;
    const body = reports.map((report) => JSON.stringify(normalizeReport(report))).join('\n');
    await fs.writeFile(tempPath, body ? `${body}\n` : '', 'utf8');
    await fs.rename(tempPath, reportLogPath);
  }

  return {
    kind: 'file',
    async ping() {
      await readReports();
      return true;
    },
    async close() {},
    async listReports() {
      const reports = await readReports();
      return reports.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },
    async getReport(id) {
      const reports = await readReports();
      return reports.find((report) => report.id === id) || null;
    },
    async listActivity(id) {
      const report = await this.getReport(id);
      if (!report) return null;
      const events = report.activity?.length ? report.activity : legacyActivity(report);
      return [...events].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id));
    },
    async createReport(report, { actor = {} } = {}) {
      return queueMutation(async () => {
        const reports = await readReports();
        const event = createActivityEvent(report.id, 'report.created', {
          actor,
          metadata: { type: report.type, impact: report.impact },
          createdAt: report.createdAt
        });
        const stored = normalizeReport({ ...report, activity: [event] });
        reports.push(stored);
        await writeReports(reports);
        return stored;
      });
    },
    async updateStatus(id, status, actor = {}) {
      return queueMutation(async () => {
        const reports = await readReports();
        const index = reports.findIndex((report) => report.id === id);
        if (index === -1) return null;
        const previousStatus = reports[index].status || 'Open';
        if (previousStatus === status) return reports[index];
        const now = new Date().toISOString();
        const event = createActivityEvent(id, 'report.status_changed', {
          actor,
          metadata: { previousStatus, status },
          createdAt: now
        });
        reports[index] = normalizeReport({
          ...reports[index],
          status,
          statusUpdatedAt: now,
          updatedAt: now,
          activity: [...(reports[index].activity || []), event]
        });
        await writeReports(reports);
        return reports[index];
      });
    },
    async updateAssignee(id, assignee, actor = {}) {
      return queueMutation(async () => {
        const reports = await readReports();
        const index = reports.findIndex((report) => report.id === id);
        if (index === -1) return null;
        const previousAssignee = reports[index].assignedTo || null;
        const previousEmail = reports[index].assignedToEmail || null;
        const nextEmail = assignee?.email || null;
        if (previousEmail === nextEmail) return reports[index];
        const now = new Date().toISOString();
        const event = createActivityEvent(id, 'report.assignee_changed', {
          actor,
          metadata: { previousAssignee, assignee: assignee || null },
          createdAt: now
        });
        reports[index] = normalizeReport({
          ...reports[index],
          assignedToEmail: nextEmail,
          assignedTo: assignee || null,
          assignedAt: assignee ? now : null,
          assignedBy: assignee ? actor.email || null : null,
          updatedAt: now,
          activity: [...(reports[index].activity || []), event]
        });
        await writeReports(reports);
        return reports[index];
      });
    },
    async addNote(id, { author, text, actor = {} }) {
      return queueMutation(async () => {
        const reports = await readReports();
        const index = reports.findIndex((report) => report.id === id);
        if (index === -1) return null;
        const now = new Date().toISOString();
        const note = {
          id: crypto.randomUUID(),
          author,
          text,
          createdAt: now
        };
        const event = createActivityEvent(id, 'report.note_added', {
          actor,
          metadata: { noteId: note.id, text },
          createdAt: now
        });
        reports[index] = normalizeReport({
          ...reports[index],
          notes: [...(reports[index].notes || []), note],
          updatedAt: now,
          activity: [...(reports[index].activity || []), event]
        });
        await writeReports(reports);
        return reports[index];
      });
    }
  };
}

function poolOptions(databaseUrl) {
  const useSsl = String(process.env.DATABASE_SSL || '').toLowerCase() === 'true';
  return {
    connectionString: databaseUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined
  };
}

function rowToReport(row) {
  if (!row) return null;
  const assignedTo = row.assigned_to_email
    ? {
        email: row.assigned_to_email,
        displayName: row.assigned_to_name || row.assigned_to_email,
        jobTitle: row.assigned_to_title || null,
        role: row.assigned_to_role || null
      }
    : null;

  return normalizeReport({
    id: row.id,
    type: row.type,
    status: row.status,
    intent: row.intent,
    problem: row.problem,
    impact: row.impact,
    url: row.url || '',
    pageTitle: row.page_title || '',
    browser: row.browser || '',
    os: row.os || '',
    viewport: row.viewport || '',
    screen: row.screen || '',
    clientTimestamp: row.client_timestamp ? new Date(row.client_timestamp).toISOString() : '',
    screenshotStored: Boolean(row.screenshot_stored),
    screenshotFilename: row.screenshot_filename || null,
    assignedToEmail: row.assigned_to_email || null,
    assignedTo,
    assignedAt: row.assigned_at ? new Date(row.assigned_at).toISOString() : null,
    assignedBy: row.assigned_by || null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    statusUpdatedAt: row.status_updated_at ? new Date(row.status_updated_at).toISOString() : null,
    notes: Array.isArray(row.notes) ? row.notes.map((note) => ({
      id: note.id,
      author: note.author,
      text: note.text,
      createdAt: new Date(note.createdAt || note.created_at).toISOString()
    })) : []
  });
}

function rowToActivity(row) {
  return normalizeActivityEvent({
    id: row.id,
    reportId: row.report_id,
    type: row.event_type,
    actorEmail: row.actor_email,
    actorName: row.actor_name,
    metadata: row.metadata || {},
    createdAt: new Date(row.created_at).toISOString()
  });
}

function createPostgresRepository(databaseUrl) {
  const pool = new Pool(poolOptions(databaseUrl));

  const baseSelect = `
    SELECT
      r.*,
      a.display_name AS assigned_to_name,
      a.job_title AS assigned_to_title,
      a.role AS assigned_to_role,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', n.id,
              'author', n.author,
              'text', n.text,
              'createdAt', n.created_at
            ) ORDER BY n.created_at
          )
          FROM notes n
          WHERE n.report_id = r.id
        ),
        '[]'::json
      ) AS notes
    FROM reports r
    LEFT JOIN bugbridge_access a ON a.email = r.assigned_to_email
  `;

  async function getReport(id, client = pool) {
    const result = await client.query(
      `${baseSelect} WHERE r.id = $1`,
      [id]
    );
    return rowToReport(result.rows[0]);
  }

  async function insertActivity(client, reportId, type, { actor = {}, metadata = {}, createdAt } = {}) {
    const event = createActivityEvent(reportId, type, { actor, metadata, createdAt });
    await client.query(
      `INSERT INTO ticket_events (id, report_id, event_type, actor_email, actor_name, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        event.id,
        reportId,
        event.type,
        event.actorEmail,
        event.actorName,
        JSON.stringify(event.metadata),
        event.createdAt
      ]
    );
    return event;
  }

  return {
    kind: 'postgres',
    async ping() {
      await pool.query('SELECT 1');
      return true;
    },
    async close() {
      await pool.end();
    },
    async listReports() {
      const result = await pool.query(`${baseSelect} ORDER BY r.created_at DESC`);
      return result.rows.map(rowToReport);
    },
    async getReport(id) {
      return getReport(id);
    },
    async listActivity(id) {
      const result = await pool.query(
        `SELECT id, report_id, event_type, actor_email, actor_name, metadata, created_at
         FROM ticket_events
         WHERE report_id = $1
         ORDER BY created_at ASC, id ASC`,
        [id]
      );
      return result.rows.map(rowToActivity);
    },
    async createReport(report, { actor = {} } = {}) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO reports (
            id, type, status, intent, problem, impact, url, page_title, browser, os,
            viewport, screen, client_timestamp, screenshot_stored, screenshot_filename,
            created_at, updated_at, status_updated_at
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
          )`,
          [
            report.id, report.type, report.status || 'Open', report.intent, report.problem,
            report.impact, report.url || '', report.pageTitle || '', report.browser || '',
            report.os || '', report.viewport || '', report.screen || '',
            report.clientTimestamp || null, Boolean(report.screenshotStored),
            report.screenshotFilename || null, report.createdAt, report.updatedAt,
            report.statusUpdatedAt || null
          ]
        );
        await insertActivity(client, report.id, 'report.created', {
          actor,
          metadata: { type: report.type, impact: report.impact },
          createdAt: report.createdAt
        });
        const created = await getReport(report.id, client);
        await client.query('COMMIT');
        return created;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async updateStatus(id, status, actor = {}) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const currentResult = await client.query('SELECT status FROM reports WHERE id = $1 FOR UPDATE', [id]);
        if (!currentResult.rowCount) {
          await client.query('ROLLBACK');
          return null;
        }
        const previousStatus = currentResult.rows[0].status || 'Open';
        if (previousStatus === status) {
          const unchanged = await getReport(id, client);
          await client.query('COMMIT');
          return unchanged;
        }
        await client.query(
          `UPDATE reports
           SET status = $2, status_updated_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [id, status]
        );
        await insertActivity(client, id, 'report.status_changed', {
          actor,
          metadata: { previousStatus, status }
        });
        const updated = await getReport(id, client);
        await client.query('COMMIT');
        return updated;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async updateAssignee(id, assignee, actor = {}) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const exists = await client.query('SELECT id FROM reports WHERE id = $1 FOR UPDATE', [id]);
        if (!exists.rowCount) {
          await client.query('ROLLBACK');
          return null;
        }
        const previous = await getReport(id, client);
        const previousEmail = previous?.assignedToEmail || null;
        const nextEmail = assignee?.email || null;
        if (previousEmail === nextEmail) {
          await client.query('COMMIT');
          return previous;
        }
        await client.query(
          `UPDATE reports
           SET assigned_to_email = $2,
               assigned_at = CASE WHEN $2::text IS NULL THEN NULL ELSE NOW() END,
               assigned_by = CASE WHEN $2::text IS NULL THEN NULL ELSE $3 END,
               updated_at = NOW()
           WHERE id = $1`,
          [id, nextEmail, actor.email || null]
        );
        const updated = await getReport(id, client);
        await insertActivity(client, id, 'report.assignee_changed', {
          actor,
          metadata: {
            previousAssignee: previous?.assignedTo || null,
            assignee: updated?.assignedTo || null
          }
        });
        await client.query('COMMIT');
        return updated;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async addNote(id, { author, text, actor = {} }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const exists = await client.query('SELECT id FROM reports WHERE id = $1 FOR UPDATE', [id]);
        if (!exists.rowCount) {
          await client.query('ROLLBACK');
          return null;
        }
        const noteId = crypto.randomUUID();
        await client.query(
          `INSERT INTO notes (id, report_id, author, text, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [noteId, id, author, text]
        );
        await client.query('UPDATE reports SET updated_at = NOW() WHERE id = $1', [id]);
        await insertActivity(client, id, 'report.note_added', {
          actor,
          metadata: { noteId, text }
        });
        const updated = await getReport(id, client);
        await client.query('COMMIT');
        return updated;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  };
}

export function createRepository({ reportLogPath, databaseUrl = process.env.DATABASE_URL?.trim() }) {
  return databaseUrl
    ? createPostgresRepository(databaseUrl)
    : createFileRepository(reportLogPath);
}
