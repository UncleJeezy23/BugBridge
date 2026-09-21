const $ = (id) => document.getElementById(id);

function nextUrl() {
  const params = new URLSearchParams(window.location.search);
  const value = params.get('next');
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

async function alreadyLoggedIn() {
  try {
    const response = await fetch('/api/v1/session', { cache: 'no-store' });
    if (response.ok) window.location.replace(nextUrl());
  } catch {
    // Login page remains available if the session check fails.
  }
}

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('loginBtn');
  const status = $('status');
  status.className = 'status';
  status.textContent = 'Logging in…';
  button.disabled = true;
  try {
    const response = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: $('email').value.trim(),
        password: $('password').value
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Could not log in.');
    status.textContent = 'Logged in. Opening BugBridge…';
    window.location.replace(nextUrl());
  } catch (error) {
    status.className = 'status error';
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

alreadyLoggedIn();
