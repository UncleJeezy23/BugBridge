const DEFAULT_API_BASE = 'http://localhost:8787';

const state = {
  tab: null,
  platform: null,
  screenshotDataUrl: null,
  capturedAt: null,
  viewport: null,
  screen: null,
  reportId: null,
  apiBaseUrl: DEFAULT_API_BASE
};

const $ = (id) => document.getElementById(id);

const form = $('reportForm');
const issueType = $('issueType');
const intent = $('intent');
const problem = $('problem');
const impact = $('impact');
const problemLabel = $('problemLabel');
const captureBtn = $('captureBtn');
const retakeBtn = $('retakeBtn');
const submitBtn = $('submitBtn');
const copyBtn = $('copyBtn');
const reportIdBadge = $('reportIdBadge');
const ticketHint = $('ticketHint');
const settingsBtn = $('settingsBtn');

async function sizePopupToChromeWindow() {
  try {
    const hostWindow = await chrome.windows.getCurrent();
    const hostWidth = Number(hostWindow?.width) || 1200;
    const hostHeight = Number(hostWindow?.height) || 800;
    const popupWidth = Math.max(300, Math.min(420, hostWidth - 80));
    const popupHeight = Math.max(360, Math.min(620, hostHeight - 140));
    document.documentElement.style.setProperty('--popup-width', `${Math.round(popupWidth)}px`);
    document.documentElement.style.setProperty('--popup-height', `${Math.round(popupHeight)}px`);
  } catch (error) {
    console.warn('Could not read Chrome window size. Using default popup dimensions.', error);
  }
}

function detectBrowser() {
  const ua = navigator.userAgent;
  const match = ua.match(/(Edg|Chrome)\/(\d+(?:\.\d+)*)/);
  if (!match) return ua;
  const name = match[1] === 'Edg' ? 'Microsoft Edge' : 'Google Chrome';
  return `${name} ${match[2]}`;
}

function platformLabel(info) {
  if (!info) return 'Unknown';
  const osMap = { win: 'Windows', mac: 'macOS', linux: 'Linux', cros: 'ChromeOS', android: 'Android', openbsd: 'OpenBSD' };
  const archMap = { x86_64: '64-bit', x86_32: '32-bit x86', arm: 'ARM', arm64: 'ARM64', mips: 'MIPS', mips64: 'MIPS64' };
  const os = osMap[info.os] || info.os || 'Unknown OS';
  const arch = archMap[info.arch] || info.arch || '';
  return arch ? `${os} (${arch})` : os;
}

function formatTimestamp(date) {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: 'numeric', minute: '2-digit', second: '2-digit',
    timeZoneName: 'short'
  }).format(date);
}

async function loadApiConfiguration() {
  try {
    const stored = await chrome.storage.local.get({ apiBaseUrl: DEFAULT_API_BASE });
    const value = typeof stored.apiBaseUrl === 'string' ? stored.apiBaseUrl.trim() : '';
    state.apiBaseUrl = (value || DEFAULT_API_BASE).replace(/\/+$/, '');
  } catch (error) {
    console.warn('Could not load backend configuration. Using localhost.', error);
    state.apiBaseUrl = DEFAULT_API_BASE;
  }

  try {
    const parsed = new URL(state.apiBaseUrl);
    $('connectionLabel').textContent = parsed.hostname === 'localhost'
      ? 'Backend: localhost'
      : `Backend: ${parsed.hostname}`;
    $('connectionLabel').title = state.apiBaseUrl;
  } catch {
    $('connectionLabel').textContent = 'Backend: invalid setting';
  }
}

async function loadEnvironment() {
  try {
    const [tabs, platform] = await Promise.all([
      chrome.tabs.query({ active: true, currentWindow: true }),
      chrome.runtime.getPlatformInfo()
    ]);
    state.tab = tabs[0] || null;
    state.platform = platform;

    if (state.tab?.id) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: state.tab.id },
          func: () => ({
            viewport: { width: window.innerWidth, height: window.innerHeight },
            screen: { width: window.screen.width, height: window.screen.height, dpr: window.devicePixelRatio || 1 }
          })
        });
        const pageMetrics = results?.[0]?.result;
        state.viewport = pageMetrics?.viewport || null;
        state.screen = pageMetrics?.screen || null;
      } catch (scriptError) {
        console.warn('Page metrics unavailable on this page.', scriptError);
      }
    }

    const fullUrl = state.tab?.url || 'Unavailable';
    $('pageTitle').textContent = state.tab?.title || 'Unavailable';
    $('pageUrl').textContent = fullUrl;
    $('pageUrl').title = fullUrl;
    $('browser').textContent = detectBrowser();
    $('os').textContent = platformLabel(platform);
    $('viewport').textContent = state.viewport ? `${state.viewport.width}×${state.viewport.height}` : 'Unavailable on this page';
    $('envStatus').textContent = 'Ready';
  } catch (error) {
    console.error(error);
    $('envStatus').textContent = 'Partial data';
  }
}

async function captureScreenshot() {
  $('formError').textContent = '';
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    state.screenshotDataUrl = dataUrl;
    state.capturedAt = new Date();
    $('screenshotPreview').src = dataUrl;
    $('screenshotPanel').classList.remove('hidden');
    $('captureStatus').textContent = 'Screenshot added';
  } catch (error) {
    console.error(error);
    $('formError').textContent = 'Could not capture this tab. Try reopening the extension on a normal webpage.';
  }
}

function validate() {
  if (!intent.value.trim()) return 'Add what you were trying to do.';
  if (!problem.value.trim()) return issueType.value === 'Suggestion'
    ? 'Add the improvement you are suggesting.'
    : 'Add what went wrong.';
  return '';
}

function buildReport(reportId = 'Pending') {
  const now = new Date();
  const type = issueType.value;
  const tabUrl = state.tab?.url || 'Unavailable';
  const tabTitle = state.tab?.title || 'Unavailable';
  const viewport = state.viewport ? `${state.viewport.width} × ${state.viewport.height}` : 'Unavailable';
  const screen = state.screen ? `${state.screen.width} × ${state.screen.height} @ ${state.screen.dpr}x DPR` : 'Unavailable';
  const screenshotStatus = state.screenshotDataUrl
    ? `Captured ${formatTimestamp(state.capturedAt || now)}`
    : 'Not captured';

  return `${type.toUpperCase()} REPORT\n\n` +
    `REPORT ID\n${reportId}\n\n` +
    `WHAT THE USER WAS TRYING TO DO\n${intent.value.trim()}\n\n` +
    `${type === 'Suggestion' ? 'SUGGESTION / IMPROVEMENT' : 'WHAT WENT WRONG'}\n${problem.value.trim()}\n\n` +
    `IMPACT\n${impact.value}\n\n` +
    `PAGE INFORMATION\nPage: ${tabTitle}\nFull URL: ${tabUrl}\n\n` +
    `ENVIRONMENT\nBrowser: ${detectBrowser()}\nOS: ${platformLabel(state.platform)}\nViewport: ${viewport}\nScreen: ${screen}\n\n` +
    `TIME\n${formatTimestamp(now)}\n\n` +
    `SCREENSHOT\n${screenshotStatus}`;
}

function dataUrlToBlob(dataUrl) {
  const [metadata, encoded] = dataUrl.split(',');
  const mime = metadata.match(/data:(.*?);base64/)?.[1] || 'image/png';
  const bytes = atob(encoded);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) array[i] = bytes.charCodeAt(i);
  return new Blob([array], { type: mime });
}

function buildFormData() {
  const now = new Date();
  const payload = new FormData();
  payload.append('type', issueType.value);
  payload.append('intent', intent.value.trim());
  payload.append('problem', problem.value.trim());
  payload.append('impact', impact.value);
  payload.append('url', state.tab?.url || '');
  payload.append('pageTitle', state.tab?.title || '');
  payload.append('browser', detectBrowser());
  payload.append('os', platformLabel(state.platform));
  payload.append('viewport', state.viewport ? `${state.viewport.width} × ${state.viewport.height}` : '');
  payload.append('screen', state.screen ? `${state.screen.width} × ${state.screen.height} @ ${state.screen.dpr}x DPR` : '');
  payload.append('clientTimestamp', now.toISOString());

  if (state.screenshotDataUrl) {
    payload.append('screenshot', dataUrlToBlob(state.screenshotDataUrl), `bugbridge-${Date.now()}.png`);
  }
  return payload;
}

async function submitReport() {
  const response = await fetch(`${state.apiBaseUrl}/api/v1/reports`, {
    method: 'POST',
    body: buildFormData()
  });

  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }

  if (!response.ok) throw new Error(body.error || `Submission failed (${response.status}).`);
  return body;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = validate();
  $('formError').textContent = error;
  $('submitStatus').textContent = '';
  if (error) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';

  try {
    const result = await submitReport();
    const reportId = result.reportId || 'Submitted';
    state.reportId = reportId;
    $('reportOutput').textContent = buildReport(reportId);
    $('reportPanel').classList.remove('hidden');
    reportIdBadge.textContent = reportId;
    reportIdBadge.setAttribute('aria-label', `Copy ticket ID ${reportId}`);
    ticketHint.textContent = 'Click the ticket ID to copy it.';
    $('copyStatus').textContent = '';
    $('submitStatus').textContent = result.emailSent
      ? `Submitted ${reportId} and delivered to the development team.`
      : `Submitted ${reportId}. The backend stored it; email delivery is not configured yet.`;
    $('reportPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (submitError) {
    console.error(submitError);
    $('formError').textContent = submitError.message.includes('Failed to fetch')
      ? `Could not reach the configured BugBridge backend (${state.apiBaseUrl}). Check Connection settings and make sure the service is online.`
      : submitError.message;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Report';
  }
});

issueType.addEventListener('change', () => {
  const suggestion = issueType.value === 'Suggestion';
  problemLabel.textContent = suggestion ? 'What would you improve?' : 'What went wrong?';
  problem.placeholder = suggestion
    ? 'Example: Keep customer info populated when creating another claim'
    : 'Example: Clicking Save did nothing';
});

captureBtn.addEventListener('click', captureScreenshot);
retakeBtn.addEventListener('click', captureScreenshot);
settingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());

reportIdBadge.addEventListener('click', async () => {
  if (!state.reportId) return;
  const copied = await copyText(state.reportId);
  if (!copied) {
    ticketHint.textContent = 'Could not copy automatically.';
    return;
  }
  const original = state.reportId;
  reportIdBadge.textContent = 'Copied ✓';
  ticketHint.textContent = `${original} copied to clipboard.`;
  window.setTimeout(() => {
    if (state.reportId === original) {
      reportIdBadge.textContent = original;
      ticketHint.textContent = 'Click the ticket ID to copy it.';
    }
  }, 1400);
});

copyBtn.addEventListener('click', async () => {
  const text = $('reportOutput').textContent || '';
  const copied = await copyText(text);
  $('copyStatus').textContent = copied ? 'Report copied.' : 'Select the report and copy it manually.';
});

async function initialize() {
  await sizePopupToChromeWindow();
  await loadApiConfiguration();
  await loadEnvironment();
}

initialize();
