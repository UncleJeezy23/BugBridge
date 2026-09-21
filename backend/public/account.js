const $ = (id) => document.getElementById(id);

let account = null;

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  }).format(date);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    cache: 'no-store',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });

  let body = {};
  try { body = await response.json(); } catch { body = {}; }
  if (!response.ok) {
    if (response.status === 401) {
      window.location.replace(`/login.html?next=${encodeURIComponent('/account.html')}`);
    }
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return body;
}

function render(body) {
  account = body;
  const identity = body.identity || {};
  const access = body.access || {};

  $('currentUser').textContent = `${access.displayName || identity.name || identity.email} · ${access.role || 'No access'}`;
  $('accountEmail').textContent = identity.email || access.email || '—';
  $('accountRole').textContent = access.role || '—';
  $('identitySource').textContent = identity.source || '—';
  $('accessCreated').textContent = formatDate(access.createdAt);
  $('displayName').value = access.displayName || identity.name || '';
  $('jobTitle').value = access.jobTitle || '';

  if (access.role === 'Admin') $('manageAccessLink').classList.remove('hidden');
  else $('manageAccessLink').classList.add('hidden');

  if (body.localAccountEnabled) {
    $('passwordPanel').classList.remove('hidden');
    $('logoutBtn').classList.remove('hidden');
  } else {
    $('passwordPanel').classList.add('hidden');
    $('logoutBtn').classList.add('hidden');
  }
}

async function initialize() {
  try {
    const body = await api('/api/v1/me');
    render(body);
    $('accountContent').classList.remove('hidden');
  } catch (error) {
    $('accessDenied').classList.remove('hidden');
    $('accessDeniedMessage').textContent = error.message;
    $('currentUser').textContent = 'Access unavailable';
  }
}

$('profileForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const displayName = $('displayName').value.trim();
  const jobTitle = $('jobTitle').value.trim();
  const button = $('saveProfileBtn');
  $('profileStatus').textContent = '';

  if (!displayName) {
    $('profileStatus').textContent = 'Display name is required.';
    $('displayName').focus();
    return;
  }

  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    const body = await api('/api/v1/me', {
      method: 'PATCH',
      body: JSON.stringify({ displayName, jobTitle })
    });
    render({ ...account, access: body.access });
    $('profileStatus').textContent = 'Profile saved.';
  } catch (error) {
    $('profileStatus').textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Save profile';
  }
});

$('passwordForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const currentPassword = $('currentPassword').value;
  const newPassword = $('newPassword').value;
  const confirmPassword = $('confirmPassword').value;
  const status = $('passwordStatus');
  const button = $('changePasswordBtn');
  status.textContent = '';

  if (newPassword !== confirmPassword) {
    status.textContent = 'New passwords do not match.';
    return;
  }

  button.disabled = true;
  button.textContent = 'Changing…';
  try {
    await api('/api/v1/me/password', {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword, newPassword })
    });
    $('currentPassword').value = '';
    $('newPassword').value = '';
    $('confirmPassword').value = '';
    status.textContent = 'Password changed.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Change password';
  }
});

$('logoutBtn').addEventListener('click', async () => {
  $('logoutBtn').disabled = true;
  try {
    await fetch('/api/v1/auth/logout', { method: 'POST' });
  } finally {
    window.location.replace('/login.html');
  }
});

initialize();
