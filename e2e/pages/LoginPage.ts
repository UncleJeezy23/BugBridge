import { Locator, Page } from '@playwright/test';

export class LoginPage {
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly status: Locator;

  constructor(private readonly page: Page) {
    this.email = page.locator('#email');
    this.password = page.locator('#password');
    this.submit = page.locator('#loginBtn');
    this.status = page.locator('#status');
  }

  async goto(next?: string) {
    await this.page.goto(next ? `/login.html?next=${encodeURIComponent(next)}` : '/login.html');
  }

  async login(email: string, password: string) {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }
}
