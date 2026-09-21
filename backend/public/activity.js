const activityState = {
  ticketId: null,
  requestSequence: 0
};

const activityById = (id) => document.getElementById(id);

function activityFormatDate(value) {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  }).format(date);
}

function personLabel(person) {
  if (!person) return 'Unassigned';
  return person.displayName || person.name || person.email || 'Unknown user';
}

function eventPresentation(event) {
  const meta = event.metadata || {};

  if (event.type === 'report.created') {
    const bits = [meta.type || 'Report', meta.impact].filter(Boolean);
    return {
      title: 'Ticket submitted',
      detail: bits.join(' · ') || 'New ticket created.'
    };
  }

  if (event.type === 'report.status_changed') {
    return {
      title: 'Status changed',
      detail: meta.previousStatus
        ? `${meta.previousStatus} → ${meta.status || 'Unknown'}`
        : `Status set to ${meta.status || 'Unknown'}`
    };
  }

  if (event.type === 'report.assignee_changed') {
    const previous = meta.previousAssignee || null;
    const assignee = meta.assignee || null;
    if (previous && assignee) {
      return {
        title: 'Ticket transferred',
        detail: `${personLabel(previous)} → ${personLabel(assignee)}`
      };
    }
    if (assignee) {
      return {
        title: 'Ticket assigned',
        detail: `Assigned to ${personLabel(assignee)}`
      };
    }
    return {
      title: 'Ticket unassigned',
      detail: previous ? `Removed from ${personLabel(previous)}` : 'Assignment removed.'
    };
  }

  if (event.type === 'report.note_added') {
    return {
      title: 'Internal note added',
      detail: meta.text || 'Internal note added.'
    };
  }

  return {
    title: event.type || 'Ticket activity',
    detail: ''
  };
}

function renderActivity(events) {
  const list = activityById('activityList');
  const count = activityById('activityCount');
  if (!list || !count) return;

  count.textContent = `${events.length} event${events.length === 1 ? '' : 's'}`;
  list.replaceChildren();

  if (!events.length) {
    const empty = document.createElement('p');
    empty.className = 'activityEmpty';
    empty.textContent = 'No ticket activity has been recorded yet.';
    list.appendChild(empty);
    return;
  }

  events.forEach((event) => {
    const presentation = eventPresentation(event);
    const item = document.createElement('article');
    item.className = 'activityItem';
    item.dataset.type = event.type || '';

    const rail = document.createElement('div');
    rail.className = 'activityRail';
    const dot = document.createElement('span');
    dot.className = 'activityDot';
    rail.appendChild(dot);

    const card = document.createElement('div');
    card.className = 'activityCard';

    const head = document.createElement('div');
    head.className = 'activityHead';
    const title = document.createElement('strong');
    title.textContent = presentation.title;
    if (event.metadata?.backfilled) {
      const badge = document.createElement('span');
      badge.className = 'activityHistorical';
      badge.textContent = 'Historical';
      title.appendChild(badge);
    }
    const time = document.createElement('time');
    time.dateTime = event.createdAt || '';
    time.textContent = activityFormatDate(event.createdAt);
    head.append(title, time);
    card.appendChild(head);

    if (presentation.detail) {
      const detail = document.createElement('p');
      detail.className = 'activityDetail';
      detail.textContent = presentation.detail;
      card.appendChild(detail);
    }

    const actorName = event.actorName || event.actorEmail || (event.type === 'report.created' ? 'Employee reporter' : 'System');
    const actor = document.createElement('p');
    actor.className = 'activityActor';
    actor.textContent = event.actorEmail && event.actorName && event.actorName !== event.actorEmail
      ? `${actorName} · ${event.actorEmail}`
      : actorName;
    card.appendChild(actor);

    item.append(rail, card);
    list.appendChild(item);
  });
}

function renderActivityError(message) {
  const list = activityById('activityList');
  const count = activityById('activityCount');
  if (!list || !count) return;
  count.textContent = 'Unavailable';
  list.replaceChildren();
  const error = document.createElement('p');
  error.className = 'activityError';
  error.textContent = message;
  list.appendChild(error);
}

async function loadTicketActivity(ticketId, { silent = false } = {}) {
  if (!ticketId) return;
  activityState.ticketId = ticketId;
  const sequence = ++activityState.requestSequence;

  if (!silent) {
    const list = activityById('activityList');
    const count = activityById('activityCount');
    if (list && count) {
      count.textContent = 'Loading…';
      list.innerHTML = '<p class="activityEmpty">Loading ticket activity…</p>';
    }
  }

  try {
    const response = await fetch(`/api/v1/reports/${encodeURIComponent(ticketId)}/activity`, { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Could not load ticket activity.');
    if (sequence !== activityState.requestSequence || ticketId !== activityState.ticketId) return;
    renderActivity(Array.isArray(body.events) ? body.events : []);
  } catch (error) {
    if (sequence !== activityState.requestSequence || ticketId !== activityState.ticketId) return;
    console.error(error);
    if (!silent) renderActivityError(error.message || 'Could not load ticket activity.');
  }
}

function selectedActivityTicketId() {
  return activityById('copyIdBtn')?.dataset?.id || null;
}

function syncActivityToSelection({ silent = false } = {}) {
  const id = selectedActivityTicketId();
  if (!id) return;
  loadTicketActivity(id, { silent });
}

const activityTicketId = activityById('copyIdBtn');
if (activityTicketId) {
  new MutationObserver(() => syncActivityToSelection()).observe(activityTicketId, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true
  });
}

if (selectedActivityTicketId()) syncActivityToSelection();

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) syncActivityToSelection({ silent: true });
});

window.setInterval(() => {
  if (!document.hidden) syncActivityToSelection({ silent: true });
}, 10000);
