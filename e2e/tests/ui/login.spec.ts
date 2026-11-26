import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { DashboardPage } from '../../pages/DashboardPage';
import { adminClient, createAccount, createReport } from '../../support/api';
import { ADMIN, BASE_URL } from '../../support/env';

// These tests start logged out.
test.use({ storageState: { cookies: [], origins: [] } });

const dashboardIdentity = (page: import('@playwright/test').Page) => new DashboardPage(page).identity;

test.describe('Login', () => {
  test('an anonymous visitor is sent to login, then returned to the ticket they asked for', async ({ page }) => {
    const admin = await adminClient();
    const id = await createReport(admin, { intent: 'Deep link target' });
    await admin.dispose();

    await page.goto(`/#${id}`);
    await expect(page).toHaveURL(/\/login\.html\?next=/);

    await new LoginPage(page).login(ADMIN.email, ADMIN.password);
    const dashboard = new DashboardPage(page);
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    await expect(dashboard.detailIntent).toHaveText('Deep link target');
  });

  test('a wrong password shows an error and keeps the user on the login page', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(ADMIN.email, 'wrong-password-123');
    await expect(login.status).toHaveText('Invalid email or password.');
    await expect(login.status).toHaveClass(/error/);
    await expect(page).toHaveURL(/login\.html/);
    await expect(login.submit).toBeEnabled();
  });

  test('the login form will not redirect to another site via ?next=', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto('//evil.example.com/phish');
    await login.login(ADMIN.email, ADMIN.password);
    await expect(dashboardIdentity(page)).toBeVisible();
    expect(new URL(page.url()).origin).toBe(new URL(BASE_URL).origin);
  });

  test('logging out returns to login and the dashboard is no longer reachable', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(ADMIN.email, ADMIN.password);
    const dashboard = new DashboardPage(page);
    await expect(dashboard.logoutButton).toBeVisible();

    await dashboard.logoutButton.click();
    await expect(page).toHaveURL(/login\.html/);
    await page.goto('/');
    await expect(page).toHaveURL(/login\.html/);
  });

  test('reviewers do not see the Manage access link', async ({ page }) => {
    const admin = await adminClient();
    const reviewer = await createAccount(admin, 'Reviewer');
    await Promise.all([admin.dispose(), reviewer.client.dispose()]);

    const login = new LoginPage(page);
    await login.goto();
    await login.login(reviewer.email, reviewer.password);
    const dashboard = new DashboardPage(page);
    await expect(dashboard.identity).toContainText('Reviewer');
    await expect(dashboard.accessLink).toBeHidden();

    // Direct navigation to the admin API is refused, not just hidden in the UI.
    const response = await page.request.get('/api/v1/access');
    expect(response.status()).toBe(403);
  });
});
