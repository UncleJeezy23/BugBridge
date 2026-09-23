import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import nodemailer from 'nodemailer';
import swaggerUi from 'swagger-ui-express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createScreenshotStore } from './screenshots.js';
import { createRepository } from './repository.js';
import { createWebhookDispatcher } from './webhook.js';
import { createAccessService, createIdentityProvider, companyEmailAllowed, identityDomainEnforced } from './access.js';
import { createLocalAuthService } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');
const storageRoot = process.env.STORAGE_ROOT?.trim()
  ? path.resolve(process.env.STORAGE_ROOT.trim())
  : backendRoot;
const dataDir = path.join(storageRoot, 'data');
const uploadDir = path.join(storageRoot, 'uploads');
const publicDir = path.join(backendRoot, 'public');
const reportLogPath = path.join(dataDir, 'reports.jsonl');
const openApiPath = path.join(backendRoot, 'openapi.json');

await fs.mkdir(dataDir, { recursive: true });
await fs.mkdir(uploadDir, { recursive: true });
await fs.mkdir(publicDir, { recursive: true });

if (process.env.REQUIRE_PERSISTENT_STORAGE === 'true' &&
    (!process.env.DATABASE_URL?.trim() || process.env.SCREENSHOT_STORAGE !== 'r2' || process.env.IDENTITY_MODE !== 'local_account')) {
  throw new Error('Hosted trial requires DATABASE_URL, SCREENSHOT_STORAGE=r2 and IDENTITY_MODE=local_account.');
}
const screenshots = createScreenshotStore({ uploadDir });
const repository = createRepository({ reportLogPath });
const accessService = createAccessService();
const identityProvider = createIdentityProvider();
const localAuth = createLocalAuthService();
const webhooks = createWebhookDispatcher();
const openApiDocument = JSON.parse(await fs.readFile(openApiPath, 'utf8'));
const app = express();
const port = Number(process.env.PORT || 8787);
const validStatuses = new Set([
  'Open',
  'Needs Info',
  'In Review',
  'In Development',
  'Ready for Retest',
  'Resolved'
]);
const localAccountMode = identityProvider.mode === 'local_account';

if (process.env.BOOTSTRAP_ADMIN_EMAIL?.trim()) {
  const bootstrapped = await accessService.bootstrapAdmin(
    process.env.BOOTSTRAP_ADMIN_EMAIL,
    process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'BugBridge Bootstrap Admin'
  );
  if (bootstrapped) console.log(`Bootstrapped BugBridge admin: ${bootstrapped.email}`);
}

if (localAccountMode && process.env.BOOTSTRAP_ADMIN_EMAIL?.trim() && process.env.LOCAL_AUTH_BOOTSTRAP_PASSWORD) {
  const account = await localAuth.bootstrapAccount(
    process.env.BOOTSTRAP_ADMIN_EMAIL,
    process.env.LOCAL_AUTH_BOOTSTRAP_PASSWORD
  );
  if (account) console.log(`Bootstrapped local login for: ${account.email}`);
}

app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(publicDir));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, {
  customSiteTitle: 'BugBridge API'
}));
app.get('/api/openapi.json', (_req, res) => res.json(openApiDocument));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg') return cb(null, true);
    cb(new Error('Screenshot must be a PNG or JPEG image.'));
  }
});

function requiredText(value, max = 4000) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
}

function normalizeType(value) {
  return value === 'Suggestion' ? 'Suggestion' : value === 'Bug' ? 'Bug' : null;
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function createReportId() {
  const date = new Date();
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `BUG-${y}${m}${d}-${suffix}`;
}

function publicReport(report) {
  if (!report) return null;
  const { activity: _activity, ...safeReport } = report;
  return {
    ...safeReport,
    screenshotUrl: report.screenshotStored && report.screenshotFilename
      ? `/api/v1/reports/${encodeURIComponent(report.id)}/screenshot`
      : null
  };
}

function webhookReport(report) {
  if (!report) return null;
  const { screenshotFilename: _privateFilename, ...safeReport } = publicReport(report);
  return safeReport;
}

function currentActor(req) {
  const auth = req.bugbridgeAuth || {};
  const email = auth.identity?.email || null;
  return {
    email,
    name: auth.access?.displayName || auth.identity?.name || email || 'BugBridge user'
  };
}

function sessionCookieOptions(session) {
  const secure = String(process.env.LOCAL_AUTH_SECURE_COOKIE || '').toLowerCase() === 'true';
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    expires: session.expiresAt
  };
}

function setSessionCookie(res, session) {
  res.cookie(localAuth.sessionCookieName, session.token, sessionCookieOptions(session));
}

function clearSessionCookie(res) {
  res.clearCookie(localAuth.sessionCookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: String(process.env.LOCAL_AUTH_SECURE_COOKIE || '').toLowerCase() === 'true',
    path: '/'
  });
}

function requestBaseUrl(req) {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const forwardedProto = req.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol = forwardedProto || req.protocol || 'http';
  return `${protocol}://${req.get('host')}`;
}

function smtpTransport() {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined
  });
}

async function attachIdentity(req, _res, next) {
  try {
    const identity = localAccountMode
      ? await localAuth.resolveRequest(req)
      : identityProvider.resolve(req);
    let access = null;
    let domainAllowed = true;

    if (identity.authenticated && !identity.bypass) {
      domainAllowed = companyEmailAllowed(identity.email);
      if (domainAllowed) access = await accessService.getAccess(identity.email);
    }

    if (identity.bypass) {
      access = {
        email: identity.email,
        displayName: identity.name,
        jobTitle: 'Local Development',
        role: 'Admin',
        bypass: true
      };
    }

    req.bugbridgeAuth = { identity, access, domainAllowed };
    next();
  } catch (error) {
    next(error);
  }
}

function requireReviewer(req, res, next) {
  const auth = req.bugbridgeAuth;
  if (!auth?.identity?.authenticated) {
    return res.status(401).json({ error: 'Account login is required.' });
  }
  if (!auth.domainAllowed && !auth.identity.bypass) {
    return res.status(403).json({ error: 'This identity is not from the approved company domain.' });
  }
  if (!auth.access || !['Reviewer', 'Admin'].includes(auth.access.role)) {
    return res.status(403).json({ error: 'Your account is not on the BugBridge dashboard access list.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  const auth = req.bugbridgeAuth;
  if (!auth?.identity?.authenticated) {
    return res.status(401).json({ error: 'Account login is required.' });
  }
  if (!auth.domainAllowed && !auth.identity.bypass) {
    return res.status(403).json({ error: 'This identity is not from the approved company domain.' });
  }
  if (!auth.access || auth.access.role !== 'Admin') {
    return res.status(403).json({ error: 'BugBridge Admin permission is required.' });
  }
  next();
}

function buildEmailBody(report) {
  return [
    `${report.type.toUpperCase()} REPORT`,
    '',
    `REPORT ID\n${report.id}`,
    '',
    `WHAT THE USER WAS TRYING TO DO\n${report.intent}`,
    '',
    `${report.type === 'Suggestion' ? 'SUGGESTION / IMPROVEMENT' : 'WHAT WENT WRONG'}\n${report.problem}`,
    '',
    `IMPACT\n${report.impact}`,
    '',
    'PAGE INFORMATION',
    `Page: ${report.pageTitle || 'Unavailable'}`,
    `Full URL: ${report.url || 'Unavailable'}`,
    '',
    'ENVIRONMENT',
    `Browser: ${report.browser || 'Unavailable'}`,
    `OS: ${report.os || 'Unavailable'}`,
    `Viewport: ${report.viewport || 'Unavailable'}`,
    `Screen: ${report.screen || 'Unavailable'}`,
    '',
    `TIME\n${report.clientTimestamp || report.createdAt}`
  ].join('\n');
}

async function maybeSendEmail(report, screenshot) {
  const transporter = smtpTransport();
  const recipient = process.env.REPORT_RECIPIENT_EMAIL?.trim();
  if (!transporter || !recipient) return { sent: false, reason: 'SMTP not configured' };

  const attachments = screenshot
    ? [{ filename: screenshot.originalname || `${report.id}.png`, content: screenshot.buffer, contentType: screenshot.mimetype }]
    : [];

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'BugBridge <noreply@example.com>',
    to: recipient,
    subject: `[BugBridge] ${report.type}: ${report.intent.slice(0, 70)}`,
    text: buildEmailBody(report),
    attachments
  });

  return { sent: true };
}

async function maybeSendInviteEmail(invite) {
  const transporter = smtpTransport();
  if (!transporter) return { sent: false, reason: 'SMTP not configured' };
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'BugBridge <noreply@example.com>',
    to: invite.email,
    subject: 'You have been invited to BugBridge',
    text: [
      'You have been granted access to BugBridge.',
      '',
      `Role: ${invite.role}`,
      '',
      'Open this one-time link to confirm your account, set your name/title, and choose a password:',
      invite.inviteUrl,
      '',
      `This invitation expires at ${invite.expiresAt}.`,
      '',
      'If you were not expecting this invitation, you can ignore this message.'
    ].join('\n')
  });
  await localAuth.markInviteSent(invite.token);
  return { sent: true };
}

async function createAndDeliverInvite({ email, actorEmail, req }) {
  const invite = await localAuth.createInvite({
    email,
    actorEmail,
    baseUrl: requestBaseUrl(req)
  });
  let delivery = { sent: false, reason: 'SMTP not configured' };
  try {
    delivery = await maybeSendInviteEmail(invite);
  } catch (error) {
    console.error('Invite email delivery failed:', error);
    delivery = { sent: false, reason: 'Invite email delivery failed' };
  }
  return {
    email: invite.email,
    expiresAt: invite.expiresAt,
    emailSent: delivery.sent,
    inviteUrl: invite.inviteUrl
  };
}

app.get('/health', async (_req, res) => {
  try {
    await repository.ping();
    res.json({
      ok: true,
      service: 'bugbridge-backend',
      version: '0.6.7',
      ticketStorage: repository.kind,
      screenshotStorage: screenshots.kind,
      webhooks: webhooks.enabled ? 'configured' : 'disabled',
      identityMode: identityProvider.mode,
      accessStore: accessService.kind,
      localAuth: localAccountMode ? localAuth.kind : 'disabled',
      identityDomainEnforced: identityDomainEnforced()
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      ok: false,
      service: 'bugbridge-backend',
      version: '0.6.7',
      ticketStorage: repository.kind,
      screenshotStorage: screenshots.kind,
      webhooks: webhooks.enabled ? 'configured' : 'disabled',
      identityMode: identityProvider.mode,
      accessStore: accessService.kind,
      localAuth: localAccountMode ? localAuth.kind : 'disabled',
      error: 'Ticket storage unavailable'
    });
  }
});

app.get('/api/v1/auth/config', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    ok: true,
    mode: identityProvider.mode,
    localAccountEnabled: localAccountMode,
    domainEnforced: identityDomainEnforced(),
    allowedDomain: process.env.ALLOWED_IDENTITY_DOMAIN || 'example.com'
  });
});

app.post('/api/v1/auth/login', async (req, res, next) => {
  if (!localAccountMode) return res.status(400).json({ error: 'Local account login is not enabled.' });
  try {
    const result = await localAuth.login(req.body?.email, req.body?.password);
    setSessionCookie(res, result.session);
    res.json({ ok: true, email: result.email });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/auth/logout', async (req, res, next) => {
  try {
    if (localAccountMode) await localAuth.logoutFromRequest(req);
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/auth/invite/:token', async (req, res, next) => {
  if (!localAccountMode) return res.status(400).json({ error: 'Local account invitations are not enabled.' });
  try {
    const invite = await localAuth.inspectInvite(req.params.token);
    if (!invite) return res.status(404).json({ error: 'Invitation not found.' });
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, invite });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/auth/invite/:token/accept', async (req, res, next) => {
  if (!localAccountMode) return res.status(400).json({ error: 'Local account invitations are not enabled.' });
  try {
    const result = await localAuth.acceptInvite({
      token: req.params.token,
      displayName: req.body?.displayName,
      jobTitle: req.body?.jobTitle,
      password: req.body?.password
    });
    setSessionCookie(res, result.session);
    res.status(201).json({ ok: true, email: result.email });
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/session', attachIdentity, (req, res) => {
  const { identity, access, domainAllowed } = req.bugbridgeAuth;
  if (!identity.authenticated) {
    return res.status(401).json({
      ok: false,
      authenticated: false,
      loginRequired: localAccountMode,
      loginUrl: localAccountMode ? '/login.html' : null
    });
  }
  res.set('Cache-Control', 'no-store');
  res.json({
    ok: true,
    authenticated: true,
    identity: {
      email: identity.email,
      name: identity.name,
      userId: identity.userId,
      source: identity.source
    },
    domainAllowed,
    authorized: Boolean(access),
    access,
    localAccountEnabled: localAccountMode
  });
});

app.get('/api/v1/me', attachIdentity, requireReviewer, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    ok: true,
    identity: {
      email: req.bugbridgeAuth.identity.email,
      name: req.bugbridgeAuth.identity.name,
      userId: req.bugbridgeAuth.identity.userId,
      source: req.bugbridgeAuth.identity.source
    },
    access: req.bugbridgeAuth.access,
    localAccountEnabled: localAccountMode
  });
});

app.patch('/api/v1/me', attachIdentity, requireReviewer, async (req, res, next) => {
  try {
    if (req.bugbridgeAuth.identity.bypass) {
      return res.status(400).json({ error: 'Profile editing requires the PostgreSQL access store.' });
    }
    const access = await accessService.updateOwnProfile(req.bugbridgeAuth.identity.email, {
      displayName: req.body?.displayName,
      jobTitle: req.body?.jobTitle
    });
    if (!access) return res.status(404).json({ error: 'BugBridge access profile not found.' });
    res.json({ ok: true, access });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/v1/me/password', attachIdentity, requireReviewer, async (req, res, next) => {
  if (!localAccountMode) return res.status(400).json({ error: 'Passwords are managed by the external identity provider.' });
  try {
    const result = await localAuth.changePassword(
      req.bugbridgeAuth.identity.email,
      req.body?.currentPassword,
      req.body?.newPassword
    );
    setSessionCookie(res, result.session);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/collaborators', attachIdentity, requireReviewer, async (_req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, users: await accessService.listAssignableUsers() });
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/access', attachIdentity, requireAdmin, async (_req, res, next) => {
  try {
    const users = await accessService.listAccess();
    const accountStates = localAccountMode ? await localAuth.listAccountStates() : {};
    res.set('Cache-Control', 'no-store');
    res.json({
      ok: true,
      users: users.map((user) => ({
        ...user,
        accountStatus: accountStates[user.email]?.status || (localAccountMode ? 'Not invited' : 'External identity'),
        activatedAt: accountStates[user.email]?.activatedAt || null,
        lastLoginAt: accountStates[user.email]?.lastLoginAt || null
      })),
      localAccountEnabled: localAccountMode,
      domainEnforced: identityDomainEnforced()
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/access', attachIdentity, requireAdmin, async (req, res, next) => {
  try {
    const user = await accessService.addAccess({
      email: req.body?.email,
      displayName: req.body?.displayName,
      jobTitle: req.body?.jobTitle,
      role: req.body?.role,
      actorEmail: req.bugbridgeAuth.identity.email
    });
    const invite = localAccountMode
      ? await createAndDeliverInvite({ email: user.email, actorEmail: req.bugbridgeAuth.identity.email, req })
      : null;
    res.status(201).json({ ok: true, user, invite });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/access/:email/invite', attachIdentity, requireAdmin, async (req, res, next) => {
  if (!localAccountMode) return res.status(400).json({ error: 'Local account invitations are not enabled.' });
  try {
    const access = await accessService.getAccess(req.params.email);
    if (!access) return res.status(404).json({ error: 'Access entry not found.' });
    const invite = await createAndDeliverInvite({
      email: access.email,
      actorEmail: req.bugbridgeAuth.identity.email,
      req
    });
    res.status(201).json({ ok: true, invite });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/v1/access/:email', attachIdentity, requireAdmin, async (req, res, next) => {
  try {
    const user = await accessService.updateAccess(req.params.email, {
      role: req.body?.role,
      displayName: req.body?.displayName,
      jobTitle: req.body?.jobTitle,
      actorEmail: req.bugbridgeAuth.identity.email
    });
    if (!user) return res.status(404).json({ error: 'Access entry not found.' });
    res.json({ ok: true, user });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/v1/access/:email', attachIdentity, requireAdmin, async (req, res, next) => {
  try {
    const removed = await accessService.removeAccess(req.params.email, {
      actorEmail: req.bugbridgeAuth.identity.email
    });
    if (!removed) return res.status(404).json({ error: 'Access entry not found.' });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/audit', attachIdentity, requireAdmin, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, events: await accessService.listAudit(req.query.limit) });
  } catch (error) {
    next(error);
  }
});

app.get(['/api/reports', '/api/v1/reports'], attachIdentity, requireReviewer, async (_req, res, next) => {
  try {
    const reports = await repository.listReports();
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, reports: reports.map(publicReport) });
  } catch (error) {
    next(error);
  }
});

app.get(['/api/reports/:id', '/api/v1/reports/:id'], attachIdentity, requireReviewer, async (req, res, next) => {
  try {
    const report = await repository.getReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found.' });
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, report: publicReport(report) });
  } catch (error) {
    next(error);
  }
});

app.get(['/api/reports/:id/activity', '/api/v1/reports/:id/activity'], attachIdentity, requireReviewer, async (req, res, next) => {
  try {
    const report = await repository.getReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found.' });
    const events = await repository.listActivity(req.params.id);
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, reportId: req.params.id, events: events || [] });
  } catch (error) {
    next(error);
  }
});

app.get(['/api/reports/:id/screenshot', '/api/v1/reports/:id/screenshot'], attachIdentity, requireReviewer, async (req, res, next) => {
  try {
    const report = await repository.getReport(req.params.id);
    if (!report || !report.screenshotStored || !report.screenshotFilename) {
      return res.status(404).json({ error: 'Screenshot not found.' });
    }

    const image = await screenshots.read(report.screenshotFilename);
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.type(image[0] === 0xff && image[1] === 0xd8 ? 'image/jpeg' : 'image/png');
    res.send(image);
  } catch (error) {
    if (error.code === 'ENOENT' || error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) return res.status(404).json({ error: 'Screenshot not found.' });
    next(error);
  }
});

app.patch(['/api/reports/:id/status', '/api/v1/reports/:id/status'], attachIdentity, requireReviewer, async (req, res, next) => {
  try {
    const status = req.body?.status;
    if (!validStatuses.has(status)) {
      return res.status(400).json({
        error: 'status must be Open, Needs Info, In Review, In Development, Ready for Retest, or Resolved'
      });
    }

    const previous = await repository.getReport(req.params.id);
    if (!previous) return res.status(404).json({ error: 'Report not found.' });

    const updated = await repository.updateStatus(req.params.id, status, currentActor(req));
    if (!updated) return res.status(404).json({ error: 'Report not found.' });

    res.json({ ok: true, report: publicReport(updated) });

    if (previous.status !== updated.status) {
      webhooks.dispatch('report.status_changed', {
        reportId: updated.id,
        previousStatus: previous.status,
        status: updated.status,
        actor: req.bugbridgeAuth.identity.email,
        report: webhookReport(updated)
      });
    }
  } catch (error) {
    next(error);
  }
});

app.patch(['/api/reports/:id/assignee', '/api/v1/reports/:id/assignee'], attachIdentity, requireReviewer, async (req, res, next) => {
  try {
    const previous = await repository.getReport(req.params.id);
    if (!previous) return res.status(404).json({ error: 'Report not found.' });

    const assigneeEmail = normalizeEmail(req.body?.assigneeEmail);
    let assignee = null;
    if (assigneeEmail) {
      assignee = await accessService.getAccess(assigneeEmail);
      if (!assignee || !['Reviewer', 'Admin'].includes(assignee.role)) {
        return res.status(400).json({ error: 'Assignee must be an active BugBridge Reviewer or Admin.' });
      }
    }

    const updated = await repository.updateAssignee(
      req.params.id,
      assignee,
      currentActor(req)
    );
    if (!updated) return res.status(404).json({ error: 'Report not found.' });

    res.json({ ok: true, report: publicReport(updated) });

    if ((previous.assignedToEmail || null) !== (updated.assignedToEmail || null)) {
      webhooks.dispatch('report.assignee_changed', {
        reportId: updated.id,
        previousAssignee: previous.assignedTo || null,
        assignee: updated.assignedTo || null,
        actor: req.bugbridgeAuth.identity.email,
        report: webhookReport(updated)
      });
    }
  } catch (error) {
    next(error);
  }
});

app.post(['/api/reports/:id/notes', '/api/v1/reports/:id/notes'], attachIdentity, requireReviewer, async (req, res, next) => {
  try {
    const typedAuthor = typeof req.body?.author === 'string' ? req.body.author.trim() : '';
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const auth = req.bugbridgeAuth;
    const author = auth.identity.bypass
      ? typedAuthor || auth.identity.name
      : auth.access?.displayName || auth.identity.name || auth.identity.email;

    if (!requiredText(author, 120)) return res.status(400).json({ error: 'author is required' });
    if (!requiredText(text, 4000)) return res.status(400).json({ error: 'note text is required' });

    const updated = await repository.addNote(req.params.id, {
      author,
      text,
      actor: currentActor(req)
    });
    if (!updated) return res.status(404).json({ error: 'Report not found.' });
    const note = updated.notes?.[updated.notes.length - 1] || { author, text };

    res.status(201).json({ ok: true, report: publicReport(updated) });

    webhooks.dispatch('report.note_added', {
      reportId: updated.id,
      actor: auth.identity.email,
      note,
      report: webhookReport(updated)
    });
  } catch (error) {
    next(error);
  }
});

// Employee reporting intentionally remains separate from reviewer/admin dashboard authorization.
app.post(['/api/reports', '/api/v1/reports'], upload.single('screenshot'), async (req, res, next) => {
  let screenshotKey;
  let reportSaved = false;
  try {
    const type = normalizeType(req.body.type);
    if (!type) return res.status(400).json({ error: 'type must be Bug or Suggestion' });
    if (!requiredText(req.body.intent, 1000)) return res.status(400).json({ error: 'intent is required' });
    if (!requiredText(req.body.problem, 4000)) return res.status(400).json({ error: 'problem is required' });
    if (!requiredText(req.body.impact, 200)) return res.status(400).json({ error: 'impact is required' });

    if (req.file) screenshotKey = await screenshots.save(req.file);
    const now = new Date().toISOString();
    const report = {
      id: createReportId(),
      type,
      status: 'Open',
      intent: req.body.intent.trim(),
      problem: req.body.problem.trim(),
      impact: req.body.impact.trim(),
      url: req.body.url?.trim() || '',
      pageTitle: req.body.pageTitle?.trim() || '',
      browser: req.body.browser?.trim() || '',
      os: req.body.os?.trim() || '',
      viewport: req.body.viewport?.trim() || '',
      screen: req.body.screen?.trim() || '',
      clientTimestamp: req.body.clientTimestamp?.trim() || '',
      screenshotStored: Boolean(req.file),
      screenshotFilename: screenshotKey || null,
      assignedToEmail: null,
      assignedTo: null,
      assignedAt: null,
      assignedBy: null,
      notes: [],
      createdAt: now,
      updatedAt: now,
      statusUpdatedAt: null
    };

    const created = await repository.createReport(report, {
      actor: { email: null, name: 'Employee reporter' }
    });

    reportSaved = true;
    let email = { sent: false, reason: 'Not attempted' };
    try {
      email = await maybeSendEmail(created, req.file);
    } catch (emailError) {
      console.error('Email delivery failed:', emailError);
      email = { sent: false, reason: 'Email delivery failed' };
    }

    res.status(201).json({
      ok: true,
      reportId: created.id,
      emailSent: email.sent,
      webhookConfigured: webhooks.enabled,
      dashboardUrl: `/#${encodeURIComponent(created.id)}`,
      message: email.sent
        ? 'Report submitted and delivered.'
        : 'Report submitted and stored. Email delivery is not configured or failed.'
    });

    webhooks.dispatch('report.created', {
      report: webhookReport(created)
    });
  } catch (error) {
    if (screenshotKey && !reportSaved) {
      await screenshots.remove(screenshotKey).catch(() => console.error('Orphan screenshot cleanup failed.'));
    }
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.message });
  }
  res.status(error.status || 400).json({ error: error.message || 'Invalid request.' });
});

const server = app.listen(port, () => {
  console.log(`BugBridge backend listening on http://localhost:${port}`);
  console.log(`Ticket storage: ${repository.kind}`);
  console.log(`Signed webhooks: ${webhooks.enabled ? 'configured' : 'disabled'}`);
  console.log(`Identity mode: ${identityProvider.mode}`);
  console.log(`BugBridge access store: ${accessService.kind}`);
  console.log(`Local account auth: ${localAccountMode ? localAuth.kind : 'disabled'}`);
  console.log(`Email domain enforcement: ${identityDomainEnforced() ? 'enabled' : 'disabled'}`);
  console.log(`API docs available at http://localhost:${port}/api/docs`);
});

async function shutdown() {
  server.close(async () => {
    if (typeof repository.close === 'function') await repository.close();
    if (typeof accessService.close === 'function') await accessService.close();
    if (typeof localAuth.close === 'function') await localAuth.close();
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);