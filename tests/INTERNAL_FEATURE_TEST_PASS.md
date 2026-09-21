# BugBridge — Internal Feature Test Pass

This checklist is the release gate for the portfolio demo. It is intentionally organized by feature rather than by a separate test-management tool so the full product can be validated quickly before a public deployment or demo.

Use the result markers below while testing:

- [ ] Not run
- [x] Pass
- [ ] Fail — add a short note under the case
- [ ] Blocked — record the dependency

## 1. Service startup and health

- [ ] APP-001 — Fresh application startup completes without an uncaught error.
- [ ] APP-002 — Database migrations run successfully before server startup.
- [ ] APP-003 — `GET /health` returns HTTP 200 and `ok: true`.
- [ ] APP-004 — Health response reports version `0.6.7`.
- [ ] APP-005 — Health response reports PostgreSQL storage when `DATABASE_URL` is configured.
- [ ] APP-006 — Restarting the service preserves existing tickets, accounts, assignments, notes, and activity.

## 2. Authentication and session handling

- [ ] AUTH-001 — Logged-out user opening the dashboard is directed to login.
- [ ] AUTH-002 — Valid local-account credentials create a session and open the dashboard.
- [ ] AUTH-003 — Invalid credentials return a generic failure and do not disclose whether an account exists.
- [ ] AUTH-004 — Logout invalidates the current session.
- [ ] AUTH-005 — A logged-out browser cannot access protected ticket-list endpoints.
- [ ] AUTH-006 — Session cookie is HttpOnly and uses the configured Secure behavior in HTTPS deployment.
- [ ] AUTH-007 — Changing a password invalidates older sessions and creates a valid replacement session.

## 3. Invitation and access management

- [ ] ACCESS-001 — Admin can add a valid Reviewer account.
- [ ] ACCESS-002 — Adding a user creates a one-time invitation in local-account mode.
- [ ] ACCESS-003 — Invite page displays the intended email and role.
- [ ] ACCESS-004 — Invite cannot be accepted without a valid display name/password.
- [ ] ACCESS-005 — Valid invite activation creates a working account.
- [ ] ACCESS-006 — Accepted invite cannot be reused.
- [ ] ACCESS-007 — Admin can resend/reset an invitation.
- [ ] ACCESS-008 — Reviewer cannot open Admin access-management functions.
- [ ] ACCESS-009 — Admin can promote/demote eligible accounts.
- [ ] ACCESS-010 — Final active Admin cannot be removed or demoted.
- [ ] ACCESS-011 — Removing access prevents future dashboard authorization.
- [ ] ACCESS-012 — Access changes appear in the audit history with the acting identity.

## 4. Employee report submission

- [ ] REPORT-001 — Bug report can be submitted without Reviewer/Admin login.
- [ ] REPORT-002 — Suggestion can be submitted without Reviewer/Admin login.
- [ ] REPORT-003 — Missing intent is rejected.
- [ ] REPORT-004 — Missing problem/suggestion text is rejected.
- [ ] REPORT-005 — Missing impact is rejected.
- [ ] REPORT-006 — Successful submission returns a unique `BUG-...` ticket ID.
- [ ] REPORT-007 — New ticket defaults to `Open`.
- [ ] REPORT-008 — Browser/page/environment metadata persists correctly.
- [ ] REPORT-009 — Submission without a screenshot succeeds.
- [ ] REPORT-010 — Submission with a valid PNG/JPEG screenshot succeeds.
- [ ] REPORT-011 — Unsupported screenshot type is rejected cleanly.
- [ ] REPORT-012 — New report appears in the dashboard after refresh/auto-refresh.

## 5. Chrome extension

- [ ] EXT-001 — Extension loads without manifest/runtime errors.
- [ ] EXT-002 — Popup remains stable without resize-loop behavior.
- [ ] EXT-003 — Page title and full URL populate on a normal HTTPS page.
- [ ] EXT-004 — Browser, OS, viewport, screen, and timestamp capture populate.
- [ ] EXT-005 — Bug/Suggestion selection changes the wording appropriately.
- [ ] EXT-006 — All three impact values submit correctly.
- [ ] EXT-007 — Screenshot capture produces a preview.
- [ ] EXT-008 — Retake replaces the existing screenshot preview.
- [ ] EXT-009 — Submit sends the report directly to the configured backend.
- [ ] EXT-010 — Successful submission shows the returned ticket ID.
- [ ] EXT-011 — Clicking the ticket ID copies only the ID.
- [ ] EXT-012 — Copy report copies the submitted report contents.
- [ ] EXT-013 — Connection settings persist after popup close/reopen.
- [ ] EXT-014 — Restricted browser pages fail gracefully rather than crashing the popup.
- [ ] EXT-015 — Long URLs/text do not create horizontal overflow or a nested report scrollbar.

## 6. Ticket dashboard core

- [ ] DASH-001 — Ticket list loads for an authorized Reviewer/Admin.
- [ ] DASH-002 — Selecting a ticket renders full ticket details.
- [ ] DASH-003 — Ticket ID, type, impact, page, URL, browser, OS, viewport, and screen render correctly.
- [ ] DASH-004 — Screenshot renders only when one exists.
- [ ] DASH-005 — Missing screenshot shows a clean no-screenshot state.
- [ ] DASH-006 — Copy ticket ID works.
- [ ] DASH-007 — Copy ticket link creates a deep link that reopens the same ticket.
- [ ] DASH-008 — Periodic refresh keeps the selected ticket when it still exists.
- [ ] DASH-009 — Backend-health indicator reflects online/offline state.

## 7. Search, filters, and sorting

- [ ] FILTER-001 — Search finds exact BUG ID.
- [ ] FILTER-002 — Search finds intent/problem text.
- [ ] FILTER-003 — Search finds page title/URL text.
- [ ] FILTER-004 — Search finds internal-note text.
- [ ] FILTER-005 — Type filter isolates Bug tickets.
- [ ] FILTER-006 — Type filter isolates Suggestion tickets.
- [ ] FILTER-007 — Impact filter isolates the selected impact.
- [ ] FILTER-008 — Assignee filter isolates a selected assignee.
- [ ] FILTER-009 — Unassigned filter shows only unassigned tickets.
- [ ] FILTER-010 — Date range filters correctly.
- [ ] FILTER-011 — Newest/oldest sort orders work.
- [ ] FILTER-012 — Combined filters return the intersection of criteria.
- [ ] FILTER-013 — Clear filters restores default state.
- [ ] FILTER-014 — No-result state is clear and non-destructive.

## 8. Workflow statuses

Test the complete lifecycle at least once on one ticket:

`Open -> Needs Info -> In Review -> In Development -> Ready for Retest -> Resolved -> Open`

- [ ] STATUS-001 — `Open` transition succeeds.
- [ ] STATUS-002 — `Needs Info` transition succeeds.
- [ ] STATUS-003 — `In Review` transition succeeds.
- [ ] STATUS-004 — `In Development` transition succeeds.
- [ ] STATUS-005 — `Ready for Retest` transition succeeds.
- [ ] STATUS-006 — `Resolved` transition succeeds.
- [ ] STATUS-007 — Reopening `Resolved -> Open` succeeds.
- [ ] STATUS-008 — Failed retest `Ready for Retest -> In Development` succeeds.
- [ ] STATUS-009 — Each transition updates the correct summary count.
- [ ] STATUS-010 — Clicking each summary counter filters to that state.
- [ ] STATUS-011 — `Needs retest` shortcut shows only `Ready for Retest` tickets.
- [ ] STATUS-012 — No-op status update does not create duplicate activity.
- [ ] STATUS-013 — Status persists across service restart.

## 9. Assignment and work queues

- [ ] ASSIGN-001 — Unassigned ticket can be assigned to current user with `Assign to me`.
- [ ] ASSIGN-002 — Ticket can be transferred to another active Reviewer/Admin.
- [ ] ASSIGN-003 — Ticket can be unassigned.
- [ ] ASSIGN-004 — Assigned-to display updates immediately after successful mutation.
- [ ] ASSIGN-005 — Assigned-by metadata is displayed correctly.
- [ ] ASSIGN-006 — `My Tickets` shows tickets assigned to the logged-in user.
- [ ] ASSIGN-007 — `Unassigned Queue` shows only unassigned tickets.
- [ ] ASSIGN-008 — `All Queue` clears queue-specific restrictions.
- [ ] ASSIGN-009 — No-op assignment does not create duplicate activity.
- [ ] ASSIGN-010 — Removing a user's access clears active assignments without deleting historical activity.

## 10. Internal notes

- [ ] NOTE-001 — Empty note is rejected.
- [ ] NOTE-002 — Valid note persists with text, author, and timestamp.
- [ ] NOTE-003 — Authenticated note author comes from server-side identity/profile.
- [ ] NOTE-004 — Multiline note formatting remains readable.
- [ ] NOTE-005 — HTML/script-like text is displayed as text rather than executed.
- [ ] NOTE-006 — Note appears in ticket activity.
- [ ] NOTE-007 — Note persists after restart.
- [ ] NOTE-008 — Failed note submission preserves typed content for retry where possible.

## 11. Activity timeline

- [ ] ACT-001 — New ticket receives exactly one `report.created` event.
- [ ] ACT-002 — Status change records `report.status_changed`.
- [ ] ACT-003 — Assignment change records `report.assignee_changed`.
- [ ] ACT-004 — Internal note records `report.note_added`.
- [ ] ACT-005 — Events display in chronological order.
- [ ] ACT-006 — Actor email/name snapshots are correct.
- [ ] ACT-007 — Backfilled events are identified as historical where applicable.
- [ ] ACT-008 — Activity survives account/profile changes.
- [ ] ACT-009 — Activity survives service restart.
- [ ] ACT-010 — Activity updates in a second browser after refresh/auto-refresh.

## 12. Webhooks

Only run this section when a receiver and secret are configured.

- [ ] HOOK-001 — `report.created` is delivered.
- [ ] HOOK-002 — `report.status_changed` is delivered with old/new status.
- [ ] HOOK-003 — `report.note_added` is delivered.
- [ ] HOOK-004 — `report.assignee_changed` is delivered.
- [ ] HOOK-005 — Signature verifies with configured HMAC-SHA256 secret.
- [ ] HOOK-006 — Delivery ID remains stable across retries.
- [ ] HOOK-007 — Webhook receiver outage does not block ticket persistence/mutation.

## 13. Multi-user behavior

- [ ] MULTI-001 — Two authenticated browsers can view different tickets simultaneously.
- [ ] MULTI-002 — User A status change becomes visible to User B.
- [ ] MULTI-003 — User A note and User B status change both persist when performed close together.
- [ ] MULTI-004 — Two near-simultaneous notes are both retained.
- [ ] MULTI-005 — Assignment transfer becomes visible to both users.
- [ ] MULTI-006 — Auto-refresh does not erase note text currently being composed.

## 14. API and documentation

- [ ] API-001 — `/api/docs` loads Swagger UI.
- [ ] API-002 — `/api/openapi.json` loads a valid OpenAPI document.
- [ ] API-003 — OpenAPI version is `0.6.7`.
- [ ] API-004 — OpenAPI status enum lists all six supported states.
- [ ] API-005 — Protected endpoints reject unauthenticated access.
- [ ] API-006 — Employee report submission endpoint remains accessible without dashboard authorization.
- [ ] API-007 — `npm run smoke` completes successfully against the deployed target when configured.

## 15. Portfolio/public-safety pass

- [ ] SAFE-001 — Repository contains no `.env` file or committed credentials.
- [ ] SAFE-002 — No real customer information appears in tickets, screenshots, fixtures, docs, or examples.
- [ ] SAFE-003 — No private/internal URLs appear in the public branch.
- [ ] SAFE-004 — No company-only email addresses appear in the public branch.
- [ ] SAFE-005 — Public UI uses generic branding/assets only.
- [ ] SAFE-006 — Demo data is synthetic and clearly non-production.
- [ ] SAFE-007 — SMTP/webhook secrets exist only as deployment variables.
- [ ] SAFE-008 — Public README does not imply the demo is an authorized company production system.

## 16. Responsive and accessibility regression

- [ ] A11Y-001 — Desktop dashboard has no unintended horizontal page scroll.
- [ ] A11Y-002 — Dashboard remains usable on a narrow/mobile viewport.
- [ ] A11Y-003 — Extension popup remains usable on narrow Chrome window sizes.
- [ ] A11Y-004 — Primary interactive controls are keyboard reachable.
- [ ] A11Y-005 — Visible focus indication exists for primary controls.
- [ ] A11Y-006 — Important state is understandable without color alone.
- [ ] A11Y-007 — Form controls have visible labels.

## Final release gate

Before the public URL is added to a portfolio or GitHub profile:

- [ ] Fresh Railway deployment succeeds.
- [ ] Migration 006 has been applied.
- [ ] Synthetic demo data is loaded.
- [ ] Automated smoke test passes.
- [ ] Manual critical-path test passes: login -> ticket -> assignment -> status lifecycle -> note -> activity -> logout.
- [ ] Second-browser multi-user spot check passes.
- [ ] Public-safety pass is complete.
- [ ] Final screenshots contain synthetic data only.

## Test run record

Date: ____________________

Build/commit: ____________________

Environment: ____________________

Tester: ____________________

Result: PASS / PASS WITH KNOWN ISSUES / FAIL

Known issues / notes:

- 
