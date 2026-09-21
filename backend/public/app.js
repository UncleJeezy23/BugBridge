const state = {
  reports: [],
  collaborators: [],
  filter: 'All',
  search: '',
  type: 'All',
  impact: 'All',
  assignee: 'All',
  dateFrom: '',
  dateTo: '',
  sort: 'newest',
  selectedId: null
};

const $ = (id) => document.getElementById(id);
const ticketList = $('ticketList');
const ticketDetail = $('ticketDetail');
const emptyState = $('emptyState');
const statusSelect = $('statusSelect');
const assigneeSelect = $('assigneeSelect');
const detailStatus = $('detailStatus');
const copyIdBtn = $('copyIdBtn');
const noteForm = $('noteForm');
const noteAuthor = $('noteAuthor');
const noteText = $('noteText');
const addNoteBtn = $('addNoteBtn');

function formatDate(value) {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  }).format(date);
}

function formatSyncTime(date = new Date()) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(date);
}

function assigneeLabel(user) {
  if (!user) return 'Unassigned';
  const name = user.displayName || user.email || 'Unknown user';
  return user.jobTitle ? `${name} — ${user.jobTitle}` : name;
}

function count(status) {
  if (status === 'All') return state.reports.length;
  return state.reports.filter((report) => report.status === status).length;
}

function textMatches(report, query) {
  if (!query) return true;
  const notes = Array.isArray(report.notes) ? report.notes : [];
  const haystack = [
    report.id,
    report.intent,
    report.problem,
    report.pageTitle,
    report.url,
    report.browser,
    report.os,
    report.assignedToEmail,
    report.assignedTo?.displayName,
    report.assignedTo?.jobTitle,
    ...notes.flatMap((note) => [note.author, note.text])
  ].join(' ').toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function inDateRange(report) {
  const created = new Date(report.createdAt).getTime();
  if (Number.isNaN(created)) return !state.dateFrom && !state.dateTo;
  if (state.dateFrom) {
    const start = new Date(`${state.dateFrom}T00:00:00`).getTime();
    if (created < start) return false;
  }
  if (state.dateTo) {
    const end = new Date(`${state.dateTo}T23:59:59.999`).getTime();
    if (created > end) return false;
  }
  return true;
}

function filteredReports() {
  const reports = state.reports.filter((report) => {
    if (state.filter !== 'All' && report.status !== state.filter) return false;
    if (state.type !== 'All' && report.type !== state.type) return false;
    if (state.impact !== 'All' && report.impact !== state.impact) return false;
    if (state.assignee === 'Unassigned' && report.assignedToEmail) return false;
    if (!['All', 'Unassigned'].includes(state.assignee) && report.assignedToEmail !== state.assignee) return false;
    if (!inDateRange(report)) return false;
    return textMatches(report, state.search.trim());
  });

  return reports.sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime() || 0;
    const bTime = new Date(b.createdAt).getTime() || 0;
    return state.sort === 'oldest' ? aTime - bTime : bTime - aTime;
  });
}

function updateSummary() {
  $('countAll').textContent = count('All');
  $('countOpen').textContent = count('Open');
  $('countReview').textContent = count('In Review');
  $('countResolved').textContent = count('Resolved');
  document.querySelectorAll('.stat').forEach((button) => {
    button.classList.toggle('active', button.dataset.filter === state.filter);
  });
}

function renderCollaboratorOptions() {
  const selectedAssignee = assigneeSelect.value;
  const selectedFilter = $('assigneeFilter').value;

  assigneeSelect.replaceChildren();
  const unassigned = document.createElement('option');
  unassigned.value = '';
  unassigned.textContent = 'Unassigned';
  assigneeSelect.appendChild(unassigned);

  const filter = $('assigneeFilter');
  filter.replaceChildren();
  const all = document.createElement('option');
  all.value = 'All';
  all.textContent = 'All assignees';
  const unassignedFilter = document.createElement('option');
  unassignedFilter.value = 'Unassigned';
  unassignedFilter.textContent = 'Unassigned';
  filter.append(all, unassignedFilter);

  state.collaborators.forEach((user) => {
    const option = document.createElement('option');
    option.value = user.email;
    option.textContent = assigneeLabel(user);
    assigneeSelect.appendChild(option);

    const filterOption = document.createElement('option');
    filterOption.value = user.email;
    filterOption.textContent = user.displayName || user.email;
    filter.appendChild(filterOption);
  });

  assigneeSelect.value = [...assigneeSelect.options].some((option) => option.value === selectedAssignee)
    ? selectedAssignee
    : '';
  filter.value = [...filter.options].some((option) => option.value === selectedFilter)
    ? selectedFilter
    : 'All';
  state.assignee = filter.value;
}

function renderTicketList() {
  const reports = filteredReports();
  $('ticketCountLabel').textContent = `${reports.length} of ${state.reports.length} ticket${state.reports.length === 1 ? '' : 's'} shown`;
  ticketList.replaceChildren();

  if (!reports.length) {
    const empty = document.createElement('div');
    empty.className = 'emptyList';
    empty.textContent = 'No tickets match the current search and filters.';
    ticketList.appendChild(empty);
    return;
  }

  reports.forEach((report) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ticketCard${report.id === state.selectedId ? ' active' : ''}`;
    button.dataset.id = report.id;

    const top = document.createElement('div');
    top.className = 'ticketTop';
    const id = document.createElement('span');
    id.className = 'ticketIdSmall';
    id.textContent = report.id;
    const status = document.createElement('span');
    status.className = 'ticketStatus';
    status.textContent = report.status || 'Open';
    top.append(id, status);

    const intent = document.createElement('strong');
    intent.className = 'ticketIntent';
    intent.textContent = report.intent || 'Untitled report';

    const bottom = document.createElement('div');
    bottom.className = 'ticketBottom';
    const left = document.createElement('span');
    left.textContent = `${report.type || 'Report'} · ${report.impact || 'Unknown impact'}`;
    const date = document.createElement('span');
    date.textContent = formatDate(report.createdAt);
    bottom.append(left, date);

    const meta = document.createElement('div');
    meta.className = 'ticketSecondaryMeta';
    const assigned = document.createElement('span');
    assigned.textContent = report.assignedTo
      ? `Assigned: ${report.assignedTo.displayName || report.assignedTo.email}`
      : 'Unassigned';
    meta.appendChild(assigned);

    const notes = Array.isArray(report.notes) ? report.notes.length : 0;
    if (notes) {
      const noteLabel = document.createElement('span');
      noteLabel.textContent = `${notes} note${notes === 1 ? '' : 's'}`;
      meta.appendChild(noteLabel);
    }

    button.append(top, intent, bottom, meta);
    button.addEventListener('click', () => selectTicket(report.id));
    ticketList.appendChild(button);
  });
}

function setDetailValue(id, value, fallback = 'Unavailable') {
  $(id).textContent = value || fallback;
}

function renderNotes(report) {
  const notes = Array.isArray(report.notes) ? [...report.notes] : [];
  notes.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  $('noteCount').textContent = `${notes.length} note${notes.length === 1 ? '' : 's'}`;
  const list = $('notesList');
  list.replaceChildren();

  if (!notes.length) {
    const empty = document.createElement('div');
    empty.className = 'emptyNotes';
    empty.textContent = 'No internal notes yet.';
    list.appendChild(empty);
    return;
  }

  notes.forEach((note) => {
    const card = document.createElement('article');
    card.className = 'noteCard';
    const head = document.createElement('div');
    head.className = 'noteHead';
    const author = document.createElement('strong');
    author.textContent = note.author || 'Unknown user';
    const date = document.createElement('span');
    date.textContent = formatDate(note.createdAt);
    head.append(author, date);
    const body = document.createElement('p');
    body.textContent = note.text || '';
    card.append(head, body);
    list.appendChild(card);
  });
}

function renderSelected() {
  const report = state.reports.find((item) => item.id === state.selectedId);
  if (!report) {
    emptyState.classList.remove('hidden');
    ticketDetail.classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  ticketDetail.classList.remove('hidden');

  copyIdBtn.textContent = report.id;
  copyIdBtn.dataset.id = report.id;
  $('typeBadge').textContent = report.type;
  $('detailIntent').textContent = report.intent;
  $('createdAt').textContent = `Reported ${formatDate(report.createdAt)}`;
  $('lastActivity').textContent = `Last activity ${formatDate(report.updatedAt || report.createdAt)}`;
  statusSelect.value = report.status || 'Open';
  assigneeSelect.value = report.assignedToEmail || '';
  $('problemHeading').textContent = report.type === 'Suggestion' ? 'Suggestion / improvement' : 'What went wrong';
  $('detailProblem').textContent = report.problem || 'No details provided.';
  setDetailValue('detailImpact', report.impact);
  setDetailValue('detailAssignee', report.assignedTo ? assigneeLabel(report.assignedTo) : 'Unassigned');
  setDetailValue('detailAssignedAt', report.assignedAt ? formatDate(report.assignedAt) : 'Not assigned');
  setDetailValue('detailPage', report.pageTitle);
  setDetailValue('detailBrowser', report.browser);
  setDetailValue('detailOs', report.os);
  setDetailValue('detailViewport', report.viewport);
  setDetailValue('detailScreen', report.screen);

  const url = $('detailUrl');
  if (report.url) {
    url.textContent = report.url;
    url.href = report.url;
  } else {
    url.textContent = 'Unavailable';
    url.removeAttribute('href');
  }

  const screenshotSection = $('screenshotSection');
  if (report.screenshotUrl) {
    screenshotSection.classList.remove('hidden');
    $('detailScreenshot').src = report.screenshotUrl;
    $('openScreenshot').href = report.screenshotUrl;
  } else {
    screenshotSection.classList.add('hidden');
    $('detailScreenshot').removeAttribute('src');
    $('openScreenshot').removeAttribute('href');
  }

  renderNotes(report);
}

function selectTicket(id, updateHash = true) {
  state.selectedId = id;
  if (updateHash) history.replaceState(null, '', `#${encodeURIComponent(id)}`);
  renderTicketList();
  renderSelected();
}

function idFromHash() {
  const raw = window.location.hash.replace(/^#/, '');
  try {
    return raw ? decodeURIComponent(raw) : null;
  } catch {
    return raw || null;
  }
}

async function loadCollaborators() {
  try {
    const response = await fetch('/api/v1/collaborators', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Could not load collaborators.');
    state.collaborators = Array.isArray(body.users) ? body.users : [];
    renderCollaboratorOptions();
  } catch (error) {
    console.error(error);
    state.collaborators = [];
    renderCollaboratorOptions();
  }
}

async function loadReports({ silent = false } = {}) {
  if (!silent) {
    $('health').className = 'health';
    $('health').lastElementChild.textContent = 'Connecting…';
  }

  try {
    const response = await fetch('/api/reports', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Could not load reports.');

    state.reports = Array.isArray(body.reports) ? body.reports : [];
    $('health').className = 'health ok';
    $('health').lastElementChild.textContent = `Online · synced ${formatSyncTime()}`;
    updateSummary();
    renderTicketList();

    const requestedId = idFromHash();
    if (!state.selectedId && requestedId && state.reports.some((report) => report.id === requestedId)) {
      selectTicket(requestedId, false);
    } else if (state.selectedId && state.reports.some((report) => report.id === state.selectedId)) {
      renderSelected();
    } else if (state.reports.length) {
      selectTicket(state.reports[0].id);
    } else {
      state.selectedId = null;
      renderSelected();
    }
  } catch (error) {
    console.error(error);
    $('health').className = 'health bad';
    $('health').lastElementChild.textContent = 'Backend offline';
    if (!silent) {
      $('ticketCountLabel').textContent = 'Could not load tickets';
      ticketList.innerHTML = '<div class="emptyList">Could not reach the ticket API or your account does not have dashboard access.</div>';
    }
  }
}

async function refreshAll({ silent = false } = {}) {
  await loadCollaborators();
  await loadReports({ silent });
}

async function updateStatus(newStatus) {
  const id = state.selectedId;
  if (!id) return;
  statusSelect.disabled = true;
  detailStatus.textContent = 'Updating status…';

  try {
    const response = await fetch(`/api/reports/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Could not update status.');

    const index = state.reports.findIndex((report) => report.id === id);
    if (index !== -1) state.reports[index] = body.report;
    updateSummary();
    renderTicketList();
    renderSelected();
    detailStatus.textContent = `Status changed to ${newStatus}.`;
  } catch (error) {
    console.error(error);
    detailStatus.textContent = error.message;
    renderSelected();
  } finally {
    statusSelect.disabled = false;
  }
}

async function updateAssignee(assigneeEmail) {
  const id = state.selectedId;
  if (!id) return;
  assigneeSelect.disabled = true;
  detailStatus.textContent = assigneeEmail ? 'Assigning ticket…' : 'Removing assignment…';

  try {
    const response = await fetch(`/api/v1/reports/${encodeURIComponent(id)}/assignee`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigneeEmail: assigneeEmail || null })
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Could not update assignee.');

    const index = state.reports.findIndex((report) => report.id === id);
    if (index !== -1) state.reports[index] = body.report;
    renderTicketList();
    renderSelected();
    detailStatus.textContent = body.report.assignedTo
      ? `Assigned to ${body.report.assignedTo.displayName || body.report.assignedTo.email}.`
      : 'Ticket is now unassigned.';
  } catch (error) {
    console.error(error);
    detailStatus.textContent = error.message;
    renderSelected();
  } finally {
    assigneeSelect.disabled = false;
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const input = document.createElement('textarea');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    return copied;
  }
}

async function copyTicketId() {
  const id = copyIdBtn.dataset.id;
  if (!id) return;
  const copied = await copyText(id);
  if (!copied) return;
  copyIdBtn.textContent = 'Copied ✓';
  window.setTimeout(() => {
    if (copyIdBtn.dataset.id === id) copyIdBtn.textContent = id;
  }, 1400);
}

async function copyTicketLink() {
  if (!state.selectedId) return;
  const url = `${window.location.origin}${window.location.pathname}#${encodeURIComponent(state.selectedId)}`;
  const copied = await copyText(url);
  detailStatus.textContent = copied ? 'Ticket link copied.' : 'Could not copy ticket link.';
}

async function addInternalNote(event) {
  event.preventDefault();
  const id = state.selectedId;
  const author = noteAuthor.value.trim();
  const text = noteText.value.trim();
  $('noteStatus').textContent = '';
  if (!id) return;
  if (!author) {
    $('noteStatus').textContent = 'Your account needs a display name before saving a note.';
    noteAuthor.focus();
    return;
  }
  if (!text) {
    $('noteStatus').textContent = 'Add a note before saving.';
    noteText.focus();
    return;
  }

  localStorage.setItem('bugBridgeDisplayName', author);
  addNoteBtn.disabled = true;
  addNoteBtn.textContent = 'Adding…';

  try {
    const response = await fetch(`/api/reports/${encodeURIComponent(id)}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author, text })
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Could not add internal note.');

    const index = state.reports.findIndex((report) => report.id === id);
    if (index !== -1) state.reports[index] = body.report;
    noteText.value = '';
    renderTicketList();
    renderSelected();
    $('noteStatus').textContent = 'Internal note added.';
  } catch (error) {
    console.error(error);
    $('noteStatus').textContent = error.message;
  } finally {
    addNoteBtn.disabled = false;
    addNoteBtn.textContent = 'Add internal note';
  }
}

function applyFilters() {
  state.search = $('searchInput').value;
  state.type = $('typeFilter').value;
  state.impact = $('impactFilter').value;
  state.assignee = $('assigneeFilter').value;
  state.dateFrom = $('dateFrom').value;
  state.dateTo = $('dateTo').value;
  state.sort = $('sortOrder').value;
  renderTicketList();
}

function clearFilters() {
  state.filter = 'All';
  $('searchInput').value = '';
  $('typeFilter').value = 'All';
  $('impactFilter').value = 'All';
  $('assigneeFilter').value = 'All';
  $('dateFrom').value = '';
  $('dateTo').value = '';
  $('sortOrder').value = 'newest';
  state.search = '';
  state.type = 'All';
  state.impact = 'All';
  state.assignee = 'All';
  state.dateFrom = '';
  state.dateTo = '';
  state.sort = 'newest';
  updateSummary();
  renderTicketList();
}

document.querySelectorAll('.stat').forEach((button) => {
  button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    updateSummary();
    renderTicketList();
  });
});

$('searchInput').addEventListener('input', applyFilters);
['typeFilter', 'impactFilter', 'assigneeFilter', 'dateFrom', 'dateTo', 'sortOrder'].forEach((id) => {
  $(id).addEventListener('change', applyFilters);
});
$('clearFiltersBtn').addEventListener('click', clearFilters);
$('refreshBtn').addEventListener('click', () => refreshAll());
statusSelect.addEventListener('change', () => updateStatus(statusSelect.value));
assigneeSelect.addEventListener('change', () => updateAssignee(assigneeSelect.value));
copyIdBtn.addEventListener('click', copyTicketId);
$('copyLinkBtn').addEventListener('click', copyTicketLink);
noteForm.addEventListener('submit', addInternalNote);
noteAuthor.addEventListener('change', () => {
  if (noteAuthor.value.trim()) localStorage.setItem('bugBridgeDisplayName', noteAuthor.value.trim());
});

window.addEventListener('hashchange', () => {
  const id = idFromHash();
  if (id && state.reports.some((report) => report.id === id)) selectTicket(id, false);
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshAll({ silent: true });
});

noteAuthor.value = localStorage.getItem('bugBridgeDisplayName') || '';
refreshAll();
window.setInterval(() => {
  if (!document.hidden) loadReports({ silent: true });
}, 10000);
