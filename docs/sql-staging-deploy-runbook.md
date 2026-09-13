# SQL staging deployment runbook

## Preconditions

- Production remains `erpBackendMode=gas`.
- A backup/export of the staging database exists.
- The private configuration is stored outside both site document roots and is
  readable only by the PHP user.
- The configuration provides `db.dsn`, `db.user`, `db.password`, and
  `badges.gas_url`. No values are committed to Git.

## Deploy order

1. Run the local verification gate:

```bash
npm run test:contract
php tests/php/approvals-test.php
php tests/php/approvals-authorization-test.php
php tests/php/api-shell-test.php
```

2. Upload the PHP API and migration files to staging only. Keep operations
   scripts outside the document root, for example `erp-ops/scripts` and
   `erp-ops/migrations`.

```bash
export ERP_FTP_HOST='…'
export ERP_FTP_USER='…'
export ERP_FTP_PASSWORD='…'
python3 scripts/deploy-staging-api.py
python3 scripts/staging-approvals-auth-smoke.py
```
3. Run `ERP_API_SRC=/absolute/path/to/staging/api/src php /absolute/path/to/erp-ops/scripts/sql-migrate.php`
   through the server shell. Migrations are applied by the database connection itself
   (`erp_database`), so this step verifies rather than performs them: it prints
   `applied/total` and exits non-zero if any migration is missing. Do not continue on a
   non-zero exit — the schema the API expects is not the schema on the server.

   `ERP_MIGRATIONS_DIR` is no longer needed: the script derives the directory from
   `ERP_API_SRC`, so it always reports on the files the runtime actually applies. A
   second copy of the migrations used to sit in `erp-ops/` and drifted five files
   behind — the script reported on that copy while entirely different files were being
   applied. Do not recreate it.
4. Run `ERP_API_SRC=/absolute/path/to/staging/api/src php /absolute/path/to/erp-ops/scripts/sql-import-workshop-badges.php`; retain its JSON result as
   the initial catalog-sync audit record.
5. Confirm the sync report has the expected workshop counts and no error.
6. Run authenticated staging QA for login restoration, personnel, catalog,
   issue, delete, handover, executor scope, manager scope, and rollback.

## Catalog bridge schedule

On staging, run the import every 15 minutes with a non-blocking `flock` lock
and log it outside the document root. The import is one-way: Google Sheets is
the catalog authoring source; SQL receives a reconciled operational copy.
Review the last `erp_catalog_sync_runs` row and the operations log after a
source-table change. Do not enable the schedule on production until the
separate production gate is approved.

## Notification schedules

Four notification jobs run on a schedule. None is triggered by user
activity, so an unscheduled job fails silently — nobody gets notified and
nothing errors.

| Job | Script | HTTP route | What it sends |
| --- | --- | --- | --- |
| Pending approvals | `scripts/push-notify-approvals.php` | `POST /api/internal/push-notify` | Reminds approvers of invoices awaiting their decision |
| Supply status changes | `scripts/supply-notify-status.php` | `POST /api/internal/supply-notify-status` | Tells a supply request's author that its status changed |
| Approval status changes | `scripts/approvals-notify-status.php` | `POST /api/internal/approvals-notify-status` | Tells an invoice's author that its approval status changed |
| ПТО (ИД/КС) status changes | `scripts/pto-notify-status.php` | `POST /api/internal/pto-notify-status` | Tells everyone in ПТО that an ИД or КС record's status changed |

The third and fourth jobs are safety nets, not the primary path:
`erp_supply_work_create_invoice` and `erp_approvals_decide` already call
`erp_approvals_notify_status_changes()` inline right after their own commit,
and `erp_ed_update`/`erp_ks_update` likewise call `erp_ed_notify_status_changes()`
/`erp_ks_notify_status_changes()` — so the relevant audience normally hears
about a status change within the same request. These schedules only catch the
case where that inline send failed.

A third script, `scripts/push-broadcast.php`, is not scheduled — it is a
one-off announcement for a release:

```
php scripts/push-broadcast.php "Заголовок" "Текст" "/register"
```

It reports how many subscriptions and employees it reached. Note that a
notification only arrives for employees who granted permission in the app;
the count of subscriptions is normally far below the headcount.

**"Accepted by the push service" is not "shown to a person."** Apple and FCM
return success for a device whose notifications were later switched off, so the
send count alone proves nothing. Every send therefore opens a row in
`erp_push_deliveries` with a one-time token that travels inside the
notification; the service worker returns it after `showNotification` succeeds,
and the row gets its delivery time. The report prints both numbers plus a
per-device breakdown, and waits (25 s by default, fourth argument) for
confirmations before printing — a phone that is awake confirms within seconds,
a sleeping one confirms later. Rows outlive the run, so a late count can be
read back by broadcast id.

A row that never gets `delivered_at` means the notification was not shown. The
usual causes are on the device: notifications disabled for the web app, or the
app not installed to the Home Screen (iOS delivers web push only to an
installed PWA). The confirmation deliberately fires only after the notification
is actually shown, so this distinction survives into the report.

The script lives in the repository, not on the server: deployment uploads the
built site, not `scripts/`. Run it from the **Разослать уведомление** workflow
(Actions → Run workflow → title, body, target path). It copies the script into a
per-run temp directory over the same SSH credentials the deploy uses, runs it
with `ERP_API_SRC` pointing at the deployed API, and removes the directory
afterwards — nothing persistent is added to the webroot.

The broadcast deliberately has **no HTTP route**, unlike the two scheduled jobs.
An externally reachable "notify everyone" endpoint is a bad idea even behind a
token; the manual workflow gives the same reach plus a run history and the
notification text in the log.

Run any of the three as a CLI job (preferred — no token needed, it reads the
private config directly) or over HTTP with the `X-Cron-Token` header matching
`push.cron_token` in `erp-api-config.php`. Every 5 minutes is enough for all;
they are idempotent, so an overlapping run sends nothing twice.

The supply job detects a change by comparing `status` against
`notified_status` on `erp_supply_requests`. It marks a request notified even
when delivery fails, so a broken push endpoint costs one missed message
rather than a permanent retry loop. New requests are created with
`notified_status` already set, so ordering never notifies the author of the
status they just saw on screen.

## Rollback

Set staging `erpBackendMode=gas` and redeploy the static frontend. SQL tables
and audit history remain intact for investigation; do not delete them as part
of rollback.
