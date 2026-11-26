import { test, expect, APIRequestContext } from '@playwright/test';
import { adminClient, createAccount, createReport, uniqueEmail } from '../../support/api';
import { STATUSES } from '../../support/env';

let admin: APIRequestContext;

test.beforeAll(async () => {
  admin = await adminClient();
});

test.afterAll(async () => {
  await admin.dispose();
});

test.describe('Defect lifecycle', () => {
  test('a report moves through every status and each change is recorded in activity', async () => {
    const id = await createReport(admin);
    const path = ['Needs Info', 'In Review', 'In Development', 'Ready for Retest', 'Resolved'] as const;

    for (const status of path) {
      const response = await admin.patch(`/api/v1/reports/${id}/status`, { data: { status } });
      expect(response.status(), `move to ${status}`).toBe(200);
      const { report } = await response.json();
      expect(report.status).toBe(status);
      expect(report.statusUpdatedAt).toBeTruthy();
    }

    const { events } = await (await admin.get(`/api/v1/reports/${id}/activity`)).json();
    const types = events.map((event: any) => event.type);
    expect(types.filter((type: string) => type === 'report.created')).toHaveLength(1);
    expect(types.filter((type: string) => type === 'report.status_changed')).toHaveLength(path.length);
  });

  test('a resolved ticket can be reopened when a retest fails', async () => {
    const id = await createReport(admin);
    await admin.patch(`/api/v1/reports/${id}/status`, { data: { status: 'Resolved' } });
    const reopen = await admin.patch(`/api/v1/reports/${id}/status`, { data: { status: 'Open' } });
    expect(reopen.status()).toBe(200);
    expect((await reopen.json()).report.status).toBe('Open');
  });

  for (const status of ['Closed', 'resolved', '', 'In  Review']) {
    test(`rejects invalid status ${JSON.stringify(status)} and leaves the ticket unchanged`, async () => {
      const id = await createReport(admin);
      const response = await admin.patch(`/api/v1/reports/${id}/status`, { data: { status } });
      expect(response.status()).toBe(400);

      const { report } = await (await admin.get(`/api/v1/reports/${id}`)).json();
      expect(report.status).toBe('Open');
    });
  }

  test('status, notes, assignee and activity return 404 for an unknown report', async () => {
    const missing = 'BUG-19990101-000000';
    expect((await admin.get(`/api/v1/reports/${missing}`)).status()).toBe(404);
    expect((await admin.get(`/api/v1/reports/${missing}/activity`)).status()).toBe(404);
    expect((await admin.patch(`/api/v1/reports/${missing}/status`, { data: { status: 'Open' } })).status()).toBe(404);
    expect((await admin.patch(`/api/v1/reports/${missing}/assignee`, { data: { assigneeEmail: null } })).status()).toBe(404);
    expect((await admin.post(`/api/v1/reports/${missing}/notes`, { data: { text: 'hello' } })).status()).toBe(404);
  });

  test('the legacy /api/reports routes stay compatible with /api/v1', async () => {
    const id = await createReport(admin);
    const legacy = await admin.patch(`/api/reports/${id}/status`, { data: { status: 'In Review' } });
    expect(legacy.status()).toBe(200);
    const { report } = await (await admin.get(`/api/v1/reports/${id}`)).json();
    expect(report.status).toBe('In Review');
  });

  test('setting the current status again is a no-op and adds no activity', async () => {
    const id = await createReport(admin);
    await admin.patch(`/api/v1/reports/${id}/status`, { data: { status: 'In Review' } });
    const repeat = await admin.patch(`/api/v1/reports/${id}/status`, { data: { status: 'In Review' } });
    expect(repeat.status()).toBe(200);

    const { events } = await (await admin.get(`/api/v1/reports/${id}/activity`)).json();
    expect(events.filter((event: any) => event.type === 'report.status_changed')).toHaveLength(1);
  });

  test('every status value the API accepts is one the dashboard offers', async () => {
    const id = await createReport(admin);
    for (const status of STATUSES) {
      const response = await admin.patch(`/api/v1/reports/${id}/status`, { data: { status } });
      expect(response.status(), status).toBe(200);
    }
  });
});

test.describe('Internal notes', () => {
  test('notes use the account display name, not a typed author', async () => {
    const id = await createReport(admin);
    const response = await admin.post(`/api/v1/reports/${id}/notes`, {
      data: { author: 'Someone Else', text: '  Reproduced on Chrome 131.  ' }
    });
    expect(response.status()).toBe(201);
    const { report } = await response.json();
    const note = report.notes.at(-1);
    const { access } = await (await admin.get('/api/v1/me')).json();
    expect(note.text).toBe('Reproduced on Chrome 131.');
    expect(note.author).toBe(access.displayName);
    expect(note.author).not.toBe('Someone Else');
  });

  test('rejects empty and over-long notes', async () => {
    const id = await createReport(admin);
    const empty = await admin.post(`/api/v1/reports/${id}/notes`, { data: { text: '   ' } });
    expect(empty.status()).toBe(400);
    const tooLong = await admin.post(`/api/v1/reports/${id}/notes`, { data: { text: 'n'.repeat(4001) } });
    expect(tooLong.status()).toBe(400);
  });

  test('notes are stored in order and logged as activity', async () => {
    const id = await createReport(admin);
    await admin.post(`/api/v1/reports/${id}/notes`, { data: { text: 'first' } });
    await admin.post(`/api/v1/reports/${id}/notes`, { data: { text: 'second' } });

    const { report } = await (await admin.get(`/api/v1/reports/${id}`)).json();
    expect(report.notes.map((note: any) => note.text)).toEqual(['first', 'second']);

    const { events } = await (await admin.get(`/api/v1/reports/${id}/activity`)).json();
    expect(events.filter((event: any) => event.type === 'report.note_added')).toHaveLength(2);
  });
});

test.describe('Assignment', () => {
  test('a ticket can be assigned to a reviewer and unassigned again', async () => {
    const reviewer = await createAccount(admin, 'Reviewer');
    const id = await createReport(admin);

    const assign = await admin.patch(`/api/v1/reports/${id}/assignee`, { data: { assigneeEmail: reviewer.email } });
    expect(assign.status()).toBe(200);
    const assigned = (await assign.json()).report;
    expect(assigned.assignedToEmail).toBe(reviewer.email);
    expect(assigned.assignedTo.displayName).toBe(reviewer.displayName);
    expect(assigned.assignedAt).toBeTruthy();

    const unassign = await admin.patch(`/api/v1/reports/${id}/assignee`, { data: { assigneeEmail: null } });
    expect(unassign.status()).toBe(200);
    expect((await unassign.json()).report.assignedToEmail).toBeNull();

    const { events } = await (await admin.get(`/api/v1/reports/${id}/activity`)).json();
    expect(events.filter((event: any) => event.type === 'report.assignee_changed')).toHaveLength(2);
    await reviewer.client.dispose();
  });

  test('assignee email is matched case-insensitively', async () => {
    const reviewer = await createAccount(admin, 'Reviewer');
    const id = await createReport(admin);
    const response = await admin.patch(`/api/v1/reports/${id}/assignee`, {
      data: { assigneeEmail: `  ${reviewer.email.toUpperCase()}  ` }
    });
    expect(response.status()).toBe(200);
    expect((await response.json()).report.assignedToEmail).toBe(reviewer.email);
    await reviewer.client.dispose();
  });

  test('cannot assign to someone without dashboard access', async () => {
    const id = await createReport(admin);
    const response = await admin.patch(`/api/v1/reports/${id}/assignee`, {
      data: { assigneeEmail: uniqueEmail('outsider') }
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('Assignee must be an active BugBridge Reviewer or Admin.');
  });

  test('a reviewer can take a ticket and see it in collaborators', async () => {
    const reviewer = await createAccount(admin, 'Reviewer');
    const id = await createReport(reviewer.client);

    const take = await reviewer.client.patch(`/api/v1/reports/${id}/assignee`, {
      data: { assigneeEmail: reviewer.email }
    });
    expect(take.status()).toBe(200);

    const { users } = await (await reviewer.client.get('/api/v1/collaborators')).json();
    expect(users.map((user: any) => user.email)).toContain(reviewer.email);
    await reviewer.client.dispose();
  });
});
