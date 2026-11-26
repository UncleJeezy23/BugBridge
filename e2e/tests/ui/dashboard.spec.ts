import { test, expect } from '@playwright/test';
import { DashboardPage } from '../../pages/DashboardPage';
import { adminClient, createReport, uniqueTag } from '../../support/api';

test.describe('Reviewer dashboard', () => {
  test('shows the signed-in admin, a healthy backend and the Manage access link', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await expect(dashboard.identity).toContainText('Admin');
    await expect(dashboard.health).toHaveClass(/ok/);
    await expect(dashboard.accessLink).toBeVisible();
  });

  test('a deep link opens the ticket with the reporter\'s details', async ({ page }) => {
    const admin = await adminClient();
    const tag = uniqueTag();
    const id = await createReport(admin, {
      intent: `Export the monthly report ${tag}`,
      problem: 'The export button spins forever.',
      impact: 'Blocks my work'
    });
    await admin.dispose();

    const dashboard = new DashboardPage(page);
    await dashboard.openTicket(id);
    await expect(dashboard.detailIntent).toHaveText(`Export the monthly report ${tag}`);
    await expect(dashboard.detailProblem).toHaveText('The export button spins forever.');
    await expect(page.locator('#detailImpact')).toHaveText('Blocks my work');
    await expect(dashboard.ticketCard(id)).toHaveClass(/active/);
  });

  test('changing status in the UI is saved and survives a reload', async ({ page }) => {
    const admin = await adminClient();
    const id = await createReport(admin);

    const dashboard = new DashboardPage(page);
    await dashboard.openTicket(id);
    await dashboard.setStatus('In Development');
    await expect(dashboard.ticketCard(id).locator('.ticketStatus')).toHaveText('In Development');

    const { report } = await (await admin.get(`/api/v1/reports/${id}`)).json();
    expect(report.status).toBe('In Development');

    await page.reload();
    await expect(dashboard.statusSelect).toHaveValue('In Development');
    await admin.dispose();
  });

  test('an internal note added in the UI appears on the ticket', async ({ page }) => {
    const admin = await adminClient();
    const id = await createReport(admin);
    await admin.dispose();

    const dashboard = new DashboardPage(page);
    await dashboard.openTicket(id);
    const note = `Reproduced on staging ${uniqueTag()}`;
    await dashboard.addInternalNote(note);

    await expect(page.locator('#noteStatus')).toHaveText('Internal note added.');
    await expect(dashboard.notesList).toContainText(note);
    await expect(page.locator('#noteCount')).toHaveText('1 note');
    await expect(dashboard.noteText).toHaveValue('');
  });

  test('an empty note is blocked in the UI', async ({ page }) => {
    const admin = await adminClient();
    const id = await createReport(admin);
    await admin.dispose();

    const dashboard = new DashboardPage(page);
    await dashboard.openTicket(id);
    await dashboard.addInternalNote('   ');
    await expect(page.locator('#noteStatus')).toHaveText('Add a note before saving.');
    await expect(page.locator('#noteCount')).toHaveText('0 notes');
  });

  test('search narrows the list to the matching ticket', async ({ page }) => {
    const admin = await adminClient();
    const tag = uniqueTag('search');
    const id = await createReport(admin, { intent: `Searchable ticket ${tag}` });
    await admin.dispose();

    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.search.fill(tag);
    await expect(dashboard.ticketList.locator('.ticketCard')).toHaveCount(1);
    await expect(dashboard.ticketCard(id)).toBeVisible();

    await dashboard.search.fill(`${tag}-no-such-ticket`);
    await expect(dashboard.ticketList).toContainText('No tickets match the current search and filters.');
  });

  test('assigning a ticket to yourself updates the detail view', async ({ page }) => {
    const admin = await adminClient();
    const id = await createReport(admin);
    const { access } = await (await admin.get('/api/v1/me')).json();
    await admin.dispose();

    const dashboard = new DashboardPage(page);
    await dashboard.openTicket(id);
    // The button only works once collaborators have loaded into the assignee list.
    await expect(page.locator(`#assigneeSelect option[value="${access.email}"]`)).toHaveCount(1);
    await expect(page.locator('#assignToMeBtn')).toBeEnabled();
    await page.locator('#assignToMeBtn').click();
    await expect(page.locator('#detailAssignee')).toContainText(access.displayName);
    await expect(dashboard.ticketCard(id)).toContainText(`Assigned: ${access.displayName}`);
  });
});
