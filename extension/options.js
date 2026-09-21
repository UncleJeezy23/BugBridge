const DEFAULT_API_BASE = 'http://localhost:8787';
const input = document.getElementById('apiBaseUrl');
const status = document.getElementById('status');

function normalizeBaseUrl(value) {
  const parsed = new URL(value.trim());
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Use an http:// or https:// URL.');
  return parsed.origin;
}

async function loadSettings() {
  const stored = await chrome.storage.local.get({ apiBaseUrl: DEFAULT_API_BASE });
  input.value = stored.apiBaseUrl || DEFAULT_API_BASE;
}

async function ensurePermission(baseUrl) {
  if (baseUrl === DEFAULT_API_BASE) return true;
  const originPattern = `${baseUrl}/*`;
  const alreadyGranted = await chrome.permissions.contains({ origins: [originPattern] });
  if (alreadyGranted) return true;
  return chrome.permissions.request({ origins: [originPattern] });
}

async function save() {
  status.className = 'status';
  status.textContent = '';
  try {
    const baseUrl = normalizeBaseUrl(input.value);
    const granted = await ensurePermission(baseUrl);
    if (!granted) throw new Error('Permission to connect to that host was not granted.');
    await chrome.storage.local.set({ apiBaseUrl: baseUrl });
    input.value = baseUrl;
    status.textContent = `Saved. Reports will be sent to ${baseUrl}.`;
  } catch (error) {
    status.className = 'status error';
    status.textContent = error.message || 'Could not save the connection.';
  }
}

async function reset() {
  await chrome.storage.local.set({ apiBaseUrl: DEFAULT_API_BASE });
  input.value = DEFAULT_API_BASE;
  status.className = 'status';
  status.textContent = 'Reset to the local development backend.';
}

document.getElementById('saveBtn').addEventListener('click', save);
document.getElementById('resetBtn').addEventListener('click', reset);

loadSettings();
