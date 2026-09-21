# BugBridge Chrome Extension

A Chrome Manifest V3 extension for capturing structured bug reports and product feedback without interrupting the reporter's workflow.

## What it captures

- issue type and impact
- reporter intent and problem description
- active page URL and title
- browser, operating system, viewport, and timestamp
- an optional screenshot of the visible tab

Reports are sent to the configured BugBridge API. A successful submission returns a copyable `BUG-...` ticket ID so the reporter can reference the issue later.

## Configure the API

Open the extension's **Connection settings** and enter the BugBridge backend URL.

Examples:

```text
http://localhost:8787
https://your-demo.example.com
```

The value is stored in Chrome extension storage. Keep production hosts and credentials out of source control.

## Install locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the `extension` directory.
5. Pin BugBridge to the Chrome toolbar.
6. Configure the backend URL in **Connection settings**.

After changing extension code, return to `chrome://extensions` and select **Reload**.

## Permissions

The extension requests active-tab and scripting permissions for page context and screenshot capture. Host access is optional and is requested only for the backend URL configured by the user.

## Related documentation

- `../README.md` — project overview and local setup
- `../docs/ARCHITECTURE.md` — system architecture
- `../docs/INTEGRATION.md` — API and integration boundaries
- `../tests/INTERNAL_FEATURE_TEST_PASS.md` — manual release test pass
