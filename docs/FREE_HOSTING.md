# Free hosting trial

This branch prepares BugBridge for Render Free (app), Neon Free (PostgreSQL),
and Cloudflare R2 Standard (private screenshots). No computer needs to stay on.
This is deployment preparation, not confirmation of a successful live deployment.

## Accounts and deployment

1. Create a **Free** Neon project at https://console.neon.tech. Copy its PostgreSQL
   connection string, including the supplied TLS options. Use a fresh trial database.
2. In Cloudflare R2, create a private **Standard** bucket. Keep public access disabled.
   Create an Object Read & Write API token scoped to this bucket. Save the S3 endpoint,
   access key ID and secret access key in Render environment variables, never Git.
   R2 requires subscription checkout; use beyond the free allowances is billable.
3. Open https://dashboard.render.com/select-repo?type=blueprint and select
   `UncleJeezy23/BugBridge`, branch `hosting/free-render-r2`, Blueprint `render.yaml`.
   Confirm the service is **Free**. There is no Render database or paid disk in this Blueprint.
4. Fill the prompted values: `DATABASE_URL`, `BOOTSTRAP_ADMIN_EMAIL`, a unique
   `LOCAL_AUTH_BOOTSTRAP_PASSWORD` (10+ characters), and the four R2 values.
   Render starts migrations and the app automatically. Do not paste credentials into chat.
5. Once Render assigns the HTTPS URL, set `PUBLIC_BASE_URL` to that exact URL in
   its Environment settings and redeploy. Sign in at `/login.html`.
6. Remove `LOCAL_AUTH_BOOTSTRAP_PASSWORD` from Render after the first successful
   login. Use the Access page to create reviewers and copy their invitation links.
   SMTP is optional; invitation links work without email configuration.
7. In the Chrome extension's Options page, save the new HTTPS backend URL and
   grant its requested host permission.

## What changed

Uploads use bounded in-memory buffers (10 MB per screenshot) and a storage adapter.
Local mode retains disk storage; R2 mode writes private objects and serves them only
through the existing authorized screenshot endpoint. Failed ticket writes attempt
object cleanup. Email attachments use the buffer rather than a temporary path.
The hosted guard prevents fallback to local ticket/screenshot storage or auth bypass.
Existing disk screenshots are not automatically copied to R2: start with a fresh
trial database, or migrate old objects before switching an existing installation.

## Trial checks

- `/health` reports PostgreSQL ticket storage and `r2` screenshot storage.
- Admin login, reviewer invitation and login work.
- Submit an extension report with a screenshot, then retrieve it in the dashboard.
- A signed-out request cannot retrieve that screenshot or ticket list.
- Notes, assignments and status changes work from a second browser/account.
- Redeploy; the same ticket, account and screenshot still work.
- Run `npm run smoke` using BASE_URL and optionally SMOKE_EMAIL/SMOKE_PASSWORD.

The report-creation endpoint retains its existing unauthenticated behavior. Use
synthetic data for this trial; public submission abuse controls and production
hardening are separate work. Do not publish shared Admin credentials.

## Free-tier behavior

Render Free sleeps after 15 minutes without requests and can take about a minute to
wake. Neon Free and R2 have usage quotas; this setup is not a guarantee of unlimited
free service. R2 overages can incur charges. Render does not persist its local disk,
which is why both tickets and screenshots live elsewhere. Render's free PostgreSQL
expires after 30 days; this setup uses Neon instead. Email delivery is optional and
must be separately configured if wanted.

References: https://render.com/docs/free | https://neon.com/pricing |
https://developers.cloudflare.com/r2/pricing/
