# BugBridge — Development Roadmap

This is the canonical roadmap for the portfolio/demo branch.

The product goal is a low-friction employee bug/suggestion workflow paired with a shared QA/development review system that remains portable across hosting and identity providers.

## Current milestone

**v0.6.7 — Portfolio release candidate**

```text
Chrome Extension
      |
      v
Versioned REST API (/api/v1)
      |
      +--> PostgreSQL tickets/access/accounts
      +--> Persisted ticket activity history
      +--> Persistent screenshot storage
      +--> Signed outbound webhooks
      |
      v
Reviewer/Admin Dashboard
      |
      +--> deny-by-default access
      +--> profiles
      +--> assignment / transfer
      +--> All / My / Unassigned / Needs Retest queues
      +--> six-state QA workflow
      +--> activity timeline
      |
      +--> replaceable identity adapter
```

## Completed foundations

### Employee reporting

- Chrome Manifest V3 extension
- Bug/Suggestion form
- employee-reported impact
- browser/page context capture
- screenshot capture/preview
- direct API submission
- configurable backend URL
- copyable BUG ticket IDs

### Shared dashboard

- searchable/filterable ticket queue
- responsive layout
- screenshots and full environment context
- internal notes
- deep links
- automatic shared refresh
- status counters and filters

### Portable backend

- stable `/api/v1` REST API
- OpenAPI/Swagger documentation
- Dockerized runtime
- PostgreSQL repository
- versioned migrations
- file-store development fallback
- persistent file-storage boundary

### Integrations

- signed HMAC-SHA256 outbound webhooks
- `report.created`
- `report.status_changed`
- `report.note_added`
- `report.assignee_changed`
- retry metadata and stable delivery IDs

### Access and collaboration

- Reviewer/Admin roles
- deny-by-default dashboard access
- replaceable identity-provider boundary
- Admin access page
- final-Admin protection
- self-service profiles
- assignment/transfer/unassignment
- Assign to me
- All / My / Unassigned queues
- invitation-only local demo accounts
- scrypt password hashing
- opaque hashed sessions/invites

### Persisted activity

Migration `005_ticket_activity.sql` adds ticket activity for:

```text
report.created
report.status_changed
report.assignee_changed
report.note_added
```

Activity stores actor snapshots and metadata and is written transactionally with PostgreSQL ticket mutations.

### Expanded QA workflow

Supported states:

```text
Open
Needs Info
In Review
In Development
Ready for Retest
Resolved
```

The dashboard includes summary filters for all six states and a dedicated Needs Retest queue. Transitions remain flexible so rework/reopen scenarios can be tested without an arbitrary transition graph.

Migration `006_expand_report_statuses.sql` updates the original PostgreSQL status constraint so all six states are valid in the database as well as the API and UI.

### Portfolio release preparation

Completed release-prep work includes:

- generic portfolio-safe branding
- synthetic-only examples and demo identities
- sanitized environment templates
- v0.6.7 OpenAPI status/version alignment
- Railway startup configuration with migrations before server start
- automated deployment smoke test
- synthetic demo-data seeding script
- feature-based internal release test pass
- consolidated test documentation
- portfolio-specific architecture/deployment documentation
- cleanup of stale milestone test plans and outdated company-specific examples

## Remaining release gate

Before tagging the first portfolio release:

- create the public sanitized repository/mirror
- connect the Railway application service to the public release source
- provision managed PostgreSQL
- attach persistent screenshot storage
- set hosted environment variables/secrets
- generate the Railway HTTPS domain
- run a fresh cloud deployment
- confirm migration 006 is applied
- load synthetic demo data
- run the automated smoke test against the hosted target
- execute the manual critical-path feature pass
- perform a second-browser multi-user spot check
- capture clean portfolio screenshots
- add the live demo URL/screenshots to the public README
- tag the release after QA passes

## Deferred product work

These are useful follow-up improvements but should not block the portfolio release:

- separate employee **Impact** from internal **Priority**
- P1/P2/P3/P4 prioritization
- priority activity history
- Recently Updated queue
- optimistic concurrency/version checks
- activity filtering/collapsing
- stricter transition policy only if real workflow evidence supports it

## Production-hardening candidates

For a real production rollout:

- integrate organization-approved SSO/OIDC/JWT/session identity
- restrict CORS/origins
- structured request/schema validation
- login and API rate limiting
- CSRF review where cookie auth is used
- automated API/repository/auth/workflow tests
- CI migration validation
- object storage for screenshots
- durable webhook outbox/queue if guaranteed delivery is required
- secret rotation requirements
- backup/retention/recovery documentation
- security review for authorization and identity spoofing

## Future product candidates

- Jira/Azure DevOps adapters
- Teams/Slack notifications
- duplicate issue detection
- reporter follow-up workflow
- build/version capture
- console error capture
- failed-network-request capture
- optional screen recording
- product-feedback analytics
- trend and response-time reporting
- saved dashboard views

## Portfolio principles

- public data is synthetic only
- secrets never belong in Git
- dashboard access remains deny-by-default
- there is no public self-registration route
- employee submission stays separate from Reviewer/Admin authorization
- APIs remain versioned and provider-neutral
- PostgreSQL is the recommended shared store
- ticket persistence/history does not depend on email or webhook availability
- identity is replaceable rather than hard-wired to one organization

## Documentation map

- `docs/ARCHITECTURE.md` — system architecture and deployment model
- `docs/INTEGRATION.md` — API/deployment/integration boundaries
- `docs/ACCESS_CONTROL.md` — identity and Reviewer/Admin access
- `docs/LOCAL_AUTH_TESTING.md` — invitation/login demo mode
- `docs/COLLABORATION.md` — profiles and assignment workflow
- `docs/TICKET_ACTIVITY.md` — persisted per-ticket history
- `docs/WORKFLOW_STATES.md` — six-state workflow behavior
- `docs/WEBHOOKS.md` — signed webhook contract
- `docs/PORTFOLIO_DEMO.md` — public-demo deployment/release guidance
- `tests/INTERNAL_FEATURE_TEST_PASS.md` — canonical manual release gate
- `docs/ROADMAP.md` — canonical roadmap
