const $ = (id) => document.getElementById(id);
const token = new URLSearchParams(window.location.search).get('token') || '';

function showInvalid(message) {
  $('activateForm').classList.add('hidden');
  $('invitePreview').classList.add('hidden');
  $('invalidInvite').classList.remove('hidden');
  $('invalidMessage').textContent = message;
}

async function loadInvite() {
  if (!token) return showInvalid('This invitation link is missing its token.');
  try {
    const response = await fetch(`/api/v1/auth/invite/${encodeURIComponent(token)}`, { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Could not load invitation.');
    const invite = body.invite;
    if (invite.accepted) return showInvalid('This invitation has already been used.');
    if (invite.expired) return showInvalid('This invitation has expired. Ask an Admin to send a new invitation.');

    $('inviteEmail').textContent = invite.email;
    $('inviteRole').textContent = `BugBridge role: ${invite.role}`;
    $('displayName').value = invite.displayName || '';
    $('jobTitle').value = invite.jobTitle || '';
    $('invitePreview').classList.remove('hidden');
    $('activateForm').classList.remove('hidden');
  } catch (error) {
    showInvalid(error.message);
  }
}

$('activateForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = $('status');
  const button = $('activateBtn');
  status.className = 'status';
  status.textContent = '';

  if ($('password').value !== $('confirmPassword').value) {
    status.className = 'status error';
    status.textContent = 'Passwords do not match.';
    return;
  }

  button.disabled = true;
  status.textContent = 'Activating account…';
  try {
    const response = await fetch(`/api/v1/auth/invite/${encodeURIComponent(token)}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: $('displayName').value.trim(),
        jobTitle: $('jobTitle').value.trim(),
        password: $('password').value
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Could not activate account.');
    status.textContent = 'Account activated. Opening BugBridge…';
    window.location.replace('/');
  } catch (error) {
    status.className = 'status error';
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

loadInvite();
