import { test as setup, expect } from '@playwright/test';
import { ADMIN, ADMIN_STORAGE_STATE } from '../support/env';
import { LoginPage } from '../pages/LoginPage';

/** Logs in once through the real UI and saves the session for every UI test. */
setup('authenticate as admin', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/(#.*)?$/);
  await expect(page.locator('#viewerIdentity')).toContainText('Admin');
  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});
