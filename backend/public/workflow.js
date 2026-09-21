const workflowState = {
  email: null,
  displayName: null,
  mode: 'all'
};

const byId = (id) => document.getElementById(id);

function setActive(mode, label) {
  workflowState.mode = mode;
  byId('workflowLabel').textContent = label;
  byId('allQueueBtn').classList.toggle('active', mode === 'all');
  byId('myTicketsBtn').classList.toggle('active', mode === 'mine');
  byId('unassignedQueueBtn').classList.toggle('active', mode === 'unassigned');
  byId('needsRetestBtn').classList.toggle('active', mode === 'retest');
}

function applyAssigneeFilter(value, mode, label) {
  const filter = byId('assigneeFilter');
  if (!filter) return;
  const exists = [...filter.options].some((option) => option.value === value);
  if (!exists && value !== 'All' && value !== 'Unassigned') return;
  filter.value = value;
  filter.dispatchEvent(new Event('change', { bubbles: true }));
  state.filter = 'All';
  updateSummary();
  renderTicketList();
  setActive(mode, label);
}

function applyStatusQueue(status, mode, label) {
  state.filter = status;
  const assigneeFilter = byId('assigneeFilter');
  if (assigneeFilter) {
    assigneeFilter.value = 'All';
    state.assignee = 'All';
  }
  updateSummary();
  renderTicketList();
  setActive(mode, label);
}

function applySession(body) {
  workflowState.email = body?.identity?.email || body?.access?.email || null;
  workflowState.displayName = body?.access?.displayName || body?.identity?.name || workflowState.email;
  byId('myTicketsBtn').disabled = !workflowState.email;
  byId('assignToMeBtn').disabled = !workflowState.email;
}

async function updateAssignedBy() {
  const target = byId('detailAssignedBy');
  const id = byId('copyIdBtn')?.dataset?.id;
  if (!target || !id) return;
  try {
    const response = await fetch(`/api/v1/reports/${encodeURIComponent(id)}`, { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) return;
    target.textContent = body.report?.assignedBy || 'Not assigned';
  } catch {
    target.textContent = 'Unavailable';
  }
}

document.addEventListener('bugbridge:session', (event) => applySession(event.detail));
if (window.bugBridgeSession) applySession(window.bugBridgeSession);

byId('allQueueBtn').addEventListener('click', () => {
  applyAssigneeFilter('All', 'all', 'All tickets');
});

byId('myTicketsBtn').addEventListener('click', () => {
  if (!workflowState.email) return;
  applyAssigneeFilter(workflowState.email, 'mine', `Assigned to ${workflowState.displayName || 'me'}`);
});

byId('unassignedQueueBtn').addEventListener('click', () => {
  applyAssigneeFilter('Unassigned', 'unassigned', 'Unassigned tickets');
});

byId('needsRetestBtn').addEventListener('click', () => {
  applyStatusQueue('Ready for Retest', 'retest', 'Ready for retest');
});

byId('assignToMeBtn').addEventListener('click', () => {
  if (!workflowState.email) return;
  const select = byId('assigneeSelect');
  if (![...select.options].some((option) => option.value === workflowState.email)) return;
  select.value = workflowState.email;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  window.setTimeout(updateAssignedBy, 250);
});

byId('assigneeFilter').addEventListener('change', () => {
  const value = byId('assigneeFilter').value;
  if (state.filter === 'Ready for Retest') {
    setActive('retest', 'Ready for retest');
    return;
  }
  if (value === 'All') setActive('all', 'All tickets');
  else if (value === 'Unassigned') setActive('unassigned', 'Unassigned tickets');
  else if (workflowState.email && value === workflowState.email) setActive('mine', `Assigned to ${workflowState.displayName || 'me'}`);
  else setActive('custom', 'Custom assignee filter');
});

document.querySelectorAll('.stat').forEach((button) => {
  button.addEventListener('click', () => {
    const status = button.dataset.filter;
    if (status === 'All') setActive('all', 'All tickets');
    else if (status === 'Ready for Retest') setActive('retest', 'Ready for retest');
    else setActive('status', `Status: ${status}`);
  });
});

byId('clearFiltersBtn').addEventListener('click', () => {
  window.setTimeout(() => setActive('all', 'All tickets'), 0);
});

byId('assigneeSelect').addEventListener('change', () => window.setTimeout(updateAssignedBy, 250));
const idButton = byId('copyIdBtn');
if (idButton) {
  new MutationObserver(() => updateAssignedBy()).observe(idButton, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true
  });
}
