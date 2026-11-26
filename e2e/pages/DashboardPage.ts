import { Locator, Page, expect } from '@playwright/test';
import type { Status } from '../support/env';

export class DashboardPage {
  readonly identity: Locator;
  readonly accessLink: Locator;
  readonly logoutButton: Locator;
  readonly health: Locator;
  readonly search: Locator;
  readonly ticketList: Locator;
  readonly detail: Locator;
  readonly detailIntent: Locator;
  readonly detailProblem: Locator;
  readonly statusSelect: Locator;
  readonly detailStatus: Locator;
  readonly noteText: Locator;
  readonly addNote: Locator;
  readonly notesList: Locator;
  readonly activityList: Locator;

  constructor(private readonly page: Page) {
    this.identity = page.locator('#viewerIdentity');
    this.accessLink = page.locator('#accessLink');
    this.logoutButton = page.locator('#logoutBtn');
    this.health = page.locator('#health');
    this.search = page.locator('#searchInput');
    this.ticketList = page.locator('#ticketList');
    this.detail = page.locator('#ticketDetail');
    this.detailIntent = page.locator('#detailIntent');
    this.detailProblem = page.locator('#detailProblem');
    this.statusSelect = page.locator('#statusSelect');
    this.detailStatus = page.locator('#detailStatus');
    this.noteText = page.locator('#noteText');
    this.addNote = page.locator('#addNoteBtn');
    this.notesList = page.locator('#notesList');
    this.activityList = page.locator('#activityList');
  }

  async goto() {
    await this.page.goto('/');
    await expect(this.identity).toBeVisible();
  }

  /** Deep-links straight to a ticket, as a copied "ticket link" would. */
  async openTicket(id: string) {
    await this.page.goto(`/#${encodeURIComponent(id)}`);
    await expect(this.detail).toBeVisible();
  }

  ticketCard(id: string): Locator {
    return this.ticketList.locator(`.ticketCard[data-id="${id}"]`);
  }

  async setStatus(status: Status) {
    await this.statusSelect.selectOption(status);
    await expect(this.detailStatus).toHaveText(`Status changed to ${status}.`);
  }

  async addInternalNote(text: string) {
    await this.noteText.fill(text);
    await this.addNote.click();
  }
}
