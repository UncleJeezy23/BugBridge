const baseUrl = String(process.env.BASE_URL || 'http://localhost:8787').replace(/\/$/, '');
const email = process.env.SMOKE_EMAIL || '';
const password = process.env.SMOKE_PASSWORD || '';

function fail(message, details) {
  const error = new Error(message);
  if (details) error.cause = details;
  throw error;
}

async function readJson(response) {
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    fail(`Expected JSON from ${response.url}, received: ${text.slice(0, 300)}`);
  }
  return body;
}

async function expectJson(response, expectedStatus) {
  const body = await readJson(response);
  if (response.status !== expectedStatus) {
    fail(`${response.request?.method || 'Request'} ${response.url} returned ${response.status}, expected ${expectedStatus}`, body);
  }
  return body;
}

async function main() {
  console.log(`BugBridge smoke test -> ${baseUrl}`);

  const healthResponse = await fetch(`${baseUrl}/health`);
  const health = await expectJson(healthResponse, 200);
  if (!health.ok) fail('Health endpoint did not report ok=true', health);
  if (health.version !== '0.6.7') fail(`Unexpected application version: ${health.version}`);
  console.log(`✓ health (${health.version}, storage=${health.ticketStorage})`);

  const form = new FormData();
  const stamp = new Date().toISOString();
  form.set('type', 'Bug');
  form.set('intent', `Portfolio smoke test ${stamp}`);
  form.set('problem', 'Automated synthetic ticket used to verify the deployed reporting workflow.');
  form.set('impact', 'Minor issue');
  form.set('url', 'https://example.com/demo');
  form.set('pageTitle', 'Synthetic Demo Page');
  form.set('browser', 'Smoke Test / Node fetch');
  form.set('os', process.platform);
  form.set('viewport', '1440x900');
  form.set('screen', '1920x1080');
  form.set('clientTimestamp', stamp);

  const createResponse = await fetch(`${baseUrl}/api/v1/reports`, {
    method: 'POST',
    body: form
  });
  const created = await expectJson(createResponse, 201);
  if (!created.reportId) fail('Report submission did not return a reportId', created);
  const reportId = created.reportId;
  console.log(`✓ report submission (${reportId})`);

  if (!email || !password) {
    console.log('• SMOKE_EMAIL/SMOKE_PASSWORD not set; authenticated workflow checks skipped.');
    console.log('Smoke test passed (public submission path).');
    return;
  }

  const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
    redirect: 'manual'
  });
  const login = await expectJson(loginResponse, 200);
  if (!login.ok) fail('Login response did not report ok=true', login);

  const setCookie = loginResponse.headers.get('set-cookie');
  if (!setCookie) fail('Login did not return a session cookie.');
  const cookie = setCookie.split(';')[0];
  const authHeaders = { cookie, 'content-type': 'application/json' };
  console.log(`✓ login (${email})`);

  const sessionResponse = await fetch(`${baseUrl}/api/v1/session`, { headers: { cookie } });
  const session = await expectJson(sessionResponse, 200);
  if (!session.authenticated || !session.authorized) fail('Session is not authenticated + authorized', session);
  console.log(`✓ authorized session (${session.access?.role || 'unknown role'})`);

  const ticketResponse = await fetch(`${baseUrl}/api/v1/reports/${encodeURIComponent(reportId)}`, {
    headers: { cookie }
  });
  const ticket = await expectJson(ticketResponse, 200);
  if (ticket.report?.id !== reportId) fail('Could not retrieve newly created report', ticket);
  console.log('✓ reviewer ticket retrieval');

  for (const status of ['In Review', 'In Development', 'Ready for Retest', 'Resolved']) {
    const response = await fetch(`${baseUrl}/api/v1/reports/${encodeURIComponent(reportId)}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ status })
    });
    const body = await expectJson(response, 200);
    if (body.report?.status !== status) fail(`Status did not update to ${status}`, body);
    console.log(`✓ status -> ${status}`);
  }

  const activityResponse = await fetch(`${baseUrl}/api/v1/reports/${encodeURIComponent(reportId)}/activity`, {
    headers: { cookie }
  });
  const activity = await expectJson(activityResponse, 200);
  if (!Array.isArray(activity.events) || activity.events.length < 5) {
    fail('Expected creation plus status activity events', activity);
  }
  console.log(`✓ persisted activity (${activity.events.length} events)`);

  console.log('Smoke test passed.');
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  if (error.cause) console.error(error.cause);
  process.exitCode = 1;
});
