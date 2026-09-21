const sessionStyle = document.createElement('style');
sessionStyle.textContent = `
  .topbarActions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
  .viewerIdentity { display: inline-flex; align-items: center; border: 1px solid #dfe3e8; background: #fff; border-radius: 999px; padding: 7px 10px; color: #5f6770; font-size: 11px; white-space: nowrap; }
  .secondaryLink { min-height: 34px; display: inline-flex; align-items: center; border: 1px solid #d7dbe0; background: #fff; border-radius: 8px; padding: 0 10px; color: #33383e; font-size: 11px; font-weight: 700; text-decoration: none; cursor: pointer; }
  .secondaryLink:hover { background: #f7f8fa; }
  .dashboardAccessDenied { max-width: 620px; margin: 48px auto; padding: 26px; border: 1px solid #fecaca; border-radius: 14px; background: #fff; text-align: center; }
  .dashboardAccessDenied h2 { margin: 0 0 8px; font-size: 20px; }
  .dashboardAccessDenied p { margin: 0; color: #7a3b3b; font-size: 13px; line-height: 1.5; }
  @media (max-width: 650px) { .topbarActions { justify-content: flex-start; } }
`;
document.head.appendChild(sessionStyle);

const workflowCss = document.createElement('link');
workflowCss.rel = 'stylesheet';
workflowCss.href = '/workflow.css';
document.head.appendChild(workflowCss);

async function loadBugBridgeSession() {
  const identityChip = document.getElementById('viewerIdentity');
  const accountLink = document.getElementById('accountLink');
  const accessLink = document.getElementById('accessLink');
  const logoutBtn = document.getElementById('logoutBtn');
  const main = document.querySelector('main');

  try {
    const response = await fetch('/api/v1/session', { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401 && body.loginRequired) {
      const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.replace(`/login.html?next=${encodeURIComponent(next)}`);
      return;
    }
    if (!response.ok) throw new Error(body.error || 'Could not verify employee identity.');

    window.bugBridgeSession = body;
    document.dispatchEvent(new CustomEvent('bugbridge:session', { detail: body }));

    const name = body.access?.displayName || body.identity?.name || body.identity?.email || 'Employee';
    const title = body.access?.jobTitle ? ` · ${body.access.jobTitle}` : '';
    const role = body.access?.role || 'No BugBridge access';
    identityChip.textContent = `${name}${title} · ${role}`;
    identityChip.hidden = false;

    if (body.authorized && accountLink) accountLink.hidden = false;
    if (role === 'Admin' && accessLink) accessLink.hidden = false;
    if (body.localAccountEnabled && logoutBtn) logoutBtn.hidden = false;

    const authorInput = document.getElementById('noteAuthor');
    if (authorInput && body.identity?.source !== 'disabled') {
      authorInput.value = body.access?.displayName || body.identity?.name || body.identity?.email || '';
      authorInput.readOnly = true;
      authorInput.title = 'Internal notes use your account identity. Change your display name from My account.';
    }

    if (!body.authorized) {
      const denied = document.createElement('section');
      denied.className = 'dashboardAccessDenied';
      const heading = document.createElement('h2');
      heading.textContent = 'BugBridge dashboard access required';
      const message = document.createElement('p');
      message.textContent = body.domainAllowed
        ? 'Your account is valid, but an Admin must add you to the BugBridge access list.'
        : 'This identity is not from the approved company domain.';
      denied.append(heading, message);
      main.replaceChildren(denied);
    }
  } catch (error) {
    identityChip.textContent = 'Identity unavailable';
    identityChip.hidden = false;
    console.error(error);
  }
}

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    logoutBtn.disabled = true;
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST' });
    } finally {
      window.location.replace('/login.html');
    }
  });
}

const workflowScript = document.createElement('script');
workflowScript.src = '/workflow.js';
workflowScript.defer = true;
document.body.appendChild(workflowScript);

loadBugBridgeSession();
