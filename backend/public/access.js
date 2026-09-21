const $ = (id) => document.getElementById(id);

const state = {
  session: null,
  users: [],
  audit: [],
  localAccountEnabled: false,
  domainEnforced: true
};

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
    if (response.status === 401 && state.session?.localAccountEnabled) {
      window.location.href = `/login.html?next=${encodeURIComponent('/access.html')}`;
    }
    throw Object.assign(new Error(body.error || `Request failed (${response.status})`), { status: response.status });
  }
  return body;
}

function showInvite(invite) {
  if (!invite?.inviteUrl) return;
  $('inviteResult').classList.remove('hidden');
  $('inviteResultTitle').textContent = `Invitation for ${invite.email}`;
  $('inviteDeliveryStatus').textContent = invite.emailSent
    ? 'Invitation email sent successfully.'
    : 'Email was not sent because SMTP is not configured; use the direct test link below.';
  $('inviteLink').value = invite.inviteUrl;
}

function renderUsers() {
  const tbody = $('accessTableBody');
  tbody.replaceChildren();
  $('accessCount').textContent = `${state.users.length} user${state.users.length === 1 ? '' : 's'}`;

  state.users.forEach((user) => {
    const row = document.createElement('tr');

    const employeeCell = document.createElement('td');
    const name = document.createElement('strong');
    name.textContent = user.displayName || user.email;
    const email = document.createElement('span');
    email.className = 'mutedBlock';
    email.textContent = user.email;
    employeeCell.append(name, email);
    if (user.jobTitle) {
      const title = document.createElement('span');
      title.className = 'mutedBlock';
      title.textContent = user.jobTitle;
      employeeCell.appendChild(title);
    }

    const roleCell = document.createElement('td');
    const select = document.createElement('select');
    select.className = 'roleSelect';
    ['Reviewer', 'Admin'].forEach((role) => {
      const option = document.createElement('option');
      option.value = role;
      option.textContent = role;
      if (role === user.role) option.selected = true;
      select.appendChild(option);
    });
    roleCell.appendChild(select);

    const accountCell = document.createElement('td');
    const status = document.createElement('span');
    status.className = `accountStatus accountStatus-${String(user.accountStatus || '').toLowerCase().replace(/\s+/g, '-')}`;
    status.textContent = user.accountStatus || 'External identity';
    accountCell.appendChild(status);

    const loginCell = document.createElement('td');
    loginCell.textContent = formatDate(user.lastLoginAt);

    const actionCell = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'rowActions';

    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'secondary small';
    save.textContent = 'Save role';
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        await api(`/api/v1/access/${encodeURIComponent(user.email)}`, {
          method: 'PATCH',
          body: JSON.stringify({ role: select.value })
        });
        $('formStatus').textContent = `${user.email} updated.`;
        await loadAdminData();
      } catch (error) {
        $('formStatus').textContent = error.message;
        select.value = user.role;
      } finally {
        save.disabled = false;
      }
    });
    actions.appendChild(save);

    if (state.localAccountEnabled) {
      const invite = document.createElement('button');
      invite.type = 'button';
      invite.className = 'secondary small';
      invite.textContent = user.accountStatus === 'Active' ? 'Reset invite' : 'Resend invite';
      invite.addEventListener('click', async () => {
        if (user.accountStatus === 'Active' && !window.confirm(
          `Create a new activation link for ${user.email}? If they accept it, they can replace the current local-test password and profile.`
        )) return;
        invite.disabled = true;
        try {
          const body = await api(`/api/v1/access/${encodeURIComponent(user.email)}/invite`, { method: 'POST' });
          showInvite(body.invite);
          $('formStatus').textContent = body.invite.emailSent
            ? `Invitation sent to ${user.email}.`
            : `Invitation created for ${user.email}. Copy the direct test link below.`;
          await loadAdminData();
        } catch (error) {
          $('formStatus').textContent = error.message;
        } finally {
          invite.disabled = false;
        }
      });
      actions.appendChild(invite);
    }

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger small';
    remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      if (!window.confirm(`Remove BugBridge dashboard access for ${user.email}?`)) return;
      remove.disabled = true;
      try {
        await api(`/api/v1/access/${encodeURIComponent(user.email)}`, { method: 'DELETE' });
        $('formStatus').textContent = `${user.email} removed.`;
        await loadAdminData();
      } catch (error) {
        $('formStatus').textContent = error.message;
      } finally {
        remove.disabled = false;
      }
    });

    actions.appendChild(remove);
    actionCell.appendChild(actions);
    row.append(employeeCell, roleCell, accountCell, loginCell, actionCell);
    tbody.appendChild(row);
  });
}

function auditDescription(event) {
  const target = event.targetEmail ? ` ${event.targetEmail}` : '';
  switch (event.action) {
    case 'access.bootstrap_admin': return `bootstrapped${target} as Admin`;
    case 'access.granted': return `granted${target} ${event.metadata?.role || ''} access`;
    case 'access.updated': return `changed${target} from ${event.metadata?.fromRole || '?'} to ${event.metadata?.toRole || '?'}`;
    case 'access.revoked': return `revoked${target} access`;
    case 'account.invite_created': return `created an account invitation for${target}`;
    case 'account.activated': return `activated${target}`;
    case 'account.bootstrap_local': return `created the local bootstrap login for${target}`;
    case 'account.password_changed': return `changed the password for${target}`;
    case 'profile.updated': return `updated profile information for${target}`;
    default: return `${event.action}${target}`;
  }
}

function renderAudit() {
  const list = $('auditList');
  list.replaceChildren();
  if (!state.audit.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No access changes recorded yet.';
    list.appendChild(empty);
    return;
  }

  state.audit.forEach((event) => {
    const item = document.createElement('article');
    item.className = 'auditItem';
    const body = document.createElement('div');
    const actor = document.createElement('strong');
    actor.textContent = event.actorEmail;
    const description = document.createElement('span');
    description.textContent = ` ${auditDescription(event)}`;
    body.append(actor, description);
    const date = document.createElement('time');
    date.textContent = formatDate(event.createdAt);
    item.append(body, date);
    list.appendChild(item);
  });
}

async function loadAdminData() {
  const [accessBody, auditBody] = await Promise.all([
    api('/api/v1/access'),
    api('/api/v1/audit?limit=100')
  ]);
  state.users = accessBody.users || [];
  state.audit = auditBody.events || [];
  state.localAccountEnabled = Boolean(accessBody.localAccountEnabled);
  state.domainEnforced = Boolean(accessBody.domainEnforced);
  $('domainMessage').textContent = state.domainEnforced
    ? 'Only explicitly listed users from the approved company email domain can review tickets.'
    : 'Test mode: any valid email address may be invited. Production should re-enable the approved company-domain restriction or use the company identity provider.';
  renderUsers();
  renderAudit();
}

async function initialize() {
  try {
    const response = await fetch('/api/v1/session', { cache: 'no-store' });
    if (response.status === 401) {
      window.location.replace(`/login.html?next=${encodeURIComponent('/access.html')}`);
      return;
    }
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Could not verify access.');
    state.session = body;
    const identity = body.identity;
    $('currentUser').textContent = `${body.access?.displayName || identity.name || identity.email} · ${body.access?.role || 'No access'}`;

    if (!body.authorized || body.access?.role !== 'Admin') {
      $('accessDenied').classList.remove('hidden');
      $('accessDeniedMessage').textContent = body.authorized
        ? 'Your BugBridge role does not include access management.'
        : 'Your account is not on the BugBridge dashboard access list.';
      return;
    }

    $('adminContent').classList.remove('hidden');
    await loadAdminData();
  } catch (error) {
    $('accessDenied').classList.remove('hidden');
    $('accessDeniedMessage').textContent = error.message;
    $('currentUser').textContent = 'Access unavailable';
  }
}

$('addAccessForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('formStatus').textContent = '';
  $('inviteResult').classList.add('hidden');
  const button = $('addAccessBtn');
  button.disabled = true;
  try {
    const body = await api('/api/v1/access', {
      method: 'POST',
      body: JSON.stringify({
        email: $('newEmail').value.trim(),
        role: $('newRole').value
      })
    });
    showInvite(body.invite);
    $('formStatus').textContent = body.invite
      ? (body.invite.emailSent ? 'Access granted and invitation emailed.' : 'Access granted and invitation created. Copy the test link below.')
      : 'Access granted.';
    $('newEmail').value = '';
    $('newRole').value = 'Reviewer';
    await loadAdminData();
  } catch (error) {
    $('formStatus').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$('copyInviteBtn').addEventListener('click', async () => {
  const value = $('inviteLink').value;
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    $('copyInviteBtn').textContent = 'Copied ✓';
    setTimeout(() => { $('copyInviteBtn').textContent = 'Copy link'; }, 1200);
  } catch {
    $('inviteLink').select();
    document.execCommand('copy');
  }
});

$('refreshBtn').addEventListener('click', () => loadAdminData().catch((error) => {
  $('formStatus').textContent = error.message;
}));

initialize();
