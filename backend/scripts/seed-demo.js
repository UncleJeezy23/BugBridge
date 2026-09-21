const baseUrl = String(process.env.BASE_URL || 'http://localhost:8787').replace(/\/$/, '');

const tickets = [
  {
    type: 'Bug',
    intent: 'Complete checkout on a mobile device',
    problem: 'The primary checkout button overlaps the sticky footer at narrow viewport widths.',
    impact: 'Makes work difficult',
    url: 'https://example.com/checkout',
    pageTitle: 'Checkout',
    browser: 'Chrome 128',
    os: 'Windows 11',
    viewport: '390x844',
    screen: '1170x2532'
  },
  {
    type: 'Bug',
    intent: 'Filter search results by status',
    problem: 'Rapidly changing filters can leave the results panel in a loading state until the page is refreshed.',
    impact: "Can't continue",
    url: 'https://example.com/search?status=open',
    pageTitle: 'Search Results',
    browser: 'Edge 128',
    os: 'Windows 11',
    viewport: '1440x900',
    screen: '2560x1440'
  },
  {
    type: 'Suggestion',
    intent: 'Use the application in low-light environments',
    problem: 'Add a persistent dark-mode preference that follows the signed-in user across devices.',
    impact: 'Minor issue',
    url: 'https://example.com/settings',
    pageTitle: 'Settings',
    browser: 'Chrome 128',
    os: 'macOS',
    viewport: '1512x982',
    screen: '3024x1964'
  },
  {
    type: 'Suggestion',
    intent: 'Export a filtered ticket list',
    problem: 'Add a confirmation summary before CSV export so users can verify the active filters and expected row count.',
    impact: 'Minor issue',
    url: 'https://example.com/reports',
    pageTitle: 'Reports',
    browser: 'Firefox 130',
    os: 'Windows 11',
    viewport: '1366x768',
    screen: '1920x1080'
  },
  {
    type: 'Bug',
    intent: 'Update my profile information',
    problem: 'Saving a profile succeeds, but the page does not immediately show a success confirmation.',
    impact: 'Makes work difficult',
    url: 'https://example.com/profile',
    pageTitle: 'My Profile',
    browser: 'Safari 18',
    os: 'macOS',
    viewport: '1280x832',
    screen: '2560x1664'
  }
];

async function submit(ticket) {
  const form = new FormData();
  const now = new Date().toISOString();
  for (const [key, value] of Object.entries({ ...ticket, clientTimestamp: now })) {
    form.set(key, value);
  }

  const response = await fetch(`${baseUrl}/api/v1/reports`, {
    method: 'POST',
    body: form
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.reportId) {
    throw new Error(`Seed submission failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body.reportId;
}

async function main() {
  console.log(`Seeding synthetic BugBridge demo tickets -> ${baseUrl}`);
  for (const ticket of tickets) {
    const id = await submit(ticket);
    console.log(`✓ ${id} — ${ticket.intent}`);
  }
  console.log(`Seeded ${tickets.length} synthetic tickets.`);
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
});
