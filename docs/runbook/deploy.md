# Deploy to live

> Part of the [live-ops runbook](README.md). If the release turns out bad, see [rollback.md](rollback.md).

Pushing to `master` does **not** deploy anything. It builds six images, tagged `sha-<7-char sha>`. Live changes only when you pin those tags in `values.live.yaml` and run Helm.

## 1. Pre-flight

1. **Pick the sha:** the commit on `master` you want live. Get it with `git rev-parse --short=7 <commit>`; CI tags with exactly 7 characters.
2. **CI is green for that commit.** In the `build-images` workflow, the `test` job (lint + `turbo test`) is **informational**: it does not gate publishing, so images exist even when tests failed. Check the `test` job's result yourself; don't deploy a red commit.
3. **All six images exist.** The packages are public, so this needs no login:
   ```bash
   SHA=<sha>
   for i in api portal-api admin-api driver-api keycloak www; do
     docker manifest inspect ghcr.io/listentorick/wholo/$i:sha-$SHA >/dev/null \
       && echo "ok   $i" || echo "MISSING $i"
   done
   ```
4. **Find what's live now.** This is your rollback target, so write it down:
   ```bash
   kubectl -n wholo get deploy wholo-api -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
   helm -n wholo history wholo --max 5
   ```
5. **Check for database migrations** between the live sha and the new one:
   ```bash
   git diff --stat <live-sha>..<sha> -- apps/api/prisma/migrations
   ```
   If there are any:
   - Read them. Migrations only go forward, and the api's `migrate` initContainer applies them before the new pod serves. While the rollout runs, the **old** api pod still serves traffic on the **new** schema.
     - Additive changes (new tables, nullable columns) are safe.
     - Renames and drops are not safe unless they were split into separate releases.
   - Take a manual backup first ([maintenance.md → Backups](maintenance.md#backups)) and wait for `backup OK`.
   - **`accounting_data_per_organisation` (ADR-074) needs the accounting tables empty first.** Run the clear-down before deploying. It deletes all accounting connections, synced data, links and invoice-export records; every distributor reconnects and re-maps afterwards. It runs inside the **currently live** api pod (which has `@prisma/client` and `DATABASE_URL`); the script is piped in from your checkout, so nothing needs installing. Without `--yes` it only prints counts:
     ```bash
     kubectl -n wholo exec -i deploy/wholo-api -c api -- node - < apps/api/scripts/clear-accounting-data.js
     kubectl -n wholo exec -i deploy/wholo-api -c api -- node - --yes < apps/api/scripts/clear-accounting-data.js
     ```
     PowerShell has no `<` redirect; pipe instead: `Get-Content apps/api/scripts/clear-accounting-data.js -Raw | kubectl -n wholo exec -i deploy/wholo-api -c api -- node -` (add `--yes` after `node -`).
     If the deploy runs first, the migration fails against the non-empty tables and the new api pod won't start. Don't improvise a fix on the half-migrated schema: restore the backup taken above ([postgres-restore.md](postgres-restore.md)), run the clear-down, then deploy again.
6. **Check whether a value the images bake in has changed.** If `LIVE_KEYCLOAK_URL`, `LIVE_KEYCLOAK_REALM` or the `WWW_*` repository variables changed after this commit was built, the images carry the old values. Re-run the workflow first ([setup/github.md](setup/github.md)).

## 2. Deploy

1. In `helm/wholo/values.live.yaml`, set every `tag: sha-…` line to the new sha. There are six: api (also used by the worker), portal-api, admin-api, driver-api, www and keycloak. Upstream images (Postgres, Redis, Telegraf and so on) are pinned separately and don't change here.
   ```bash
   grep -n 'tag: sha-' helm/wholo/values.live.yaml   # all six should show the new sha
   ```
2. Apply:
   ```bash
   pnpm helm:install:live
   # = helm upgrade --install wholo helm/wholo -n wholo -f helm/wholo/values.live.yaml
   ```
3. Watch it land:
   ```bash
   kubectl -n wholo get pods -w                          # Ctrl-C once everything is Running/Ready
   kubectl -n wholo logs deploy/wholo-api -c migrate     # migration output (new api pod)
   for d in api worker portal-api admin-api driver-api www keycloak; do
     kubectl -n wholo rollout status deploy/wholo-$d --timeout=10m
   done
   ```

What to expect:

- **The app Deployments roll with zero downtime:** the new pod must be Ready before the old one goes.
- **The worker uses `Recreate`:** background jobs pause for a few seconds. That is deliberate, because there must never be two workers (ADR-047).
- **Postgres, Redis and ClickHouse also use `Recreate`,** but they only restart when their own spec changes. A normal release leaves them alone.
- **A migration failure keeps the new api pod in `Init:Error` or `Init:CrashLoopBackOff`.** The old pod keeps serving, so the site stays up. See [incidents/database.md](incidents/database.md#migration-failed-during-deploy).

## 3. Verify

Do this after every deploy. Steps 6–9 matter most after changes to telemetry, logging or backups.

1. `kubectl -n wholo get pods`: everything is Running/Ready, with no restarts climbing.
2. `curl -sI https://portal.<domain>/` returns a response with a valid Cloudflare edge cert (no `-k` needed). `curl -sI http://portal.<domain>/` returns a 301 to https ("Always Use HTTPS" at the edge).
3. Browse `https://admin.<domain>`: you're redirected to `auth.<domain>`, you log in, and you land back on admin. That proves the baked-in Keycloak URL, the realm redirect URIs and JWKS validation agree. Repeat for the portal.
   - `https://www.<domain>/` serves the landing page, and `https://<domain>/` 301s to it.
   - Submitting the register form sends a lead email to `www.smtp.leadsTo`.
   - If analytics is on, a pageview appears in the port-forwarded Plausible dashboard, and `curl -sI https://www.<domain>/js/script.js` returns 200 from the first-party proxy.
4. Trigger an email and check it arrives from PurelyMail with `https://` links. The simplest is Keycloak "Forgot password?" for your own account; an order or invite email also works. (MailHog is not used in live.)
5. `kubectl -n wholo logs deploy/wholo-worker` shows the queue consumers up. `kubectl -n wholo get deploy wholo-worker` shows exactly 1 replica (ADR-047).
6. `kubectl -n wholo logs deploy/wholo-telegraf`: statsd and influxdb_v2 are loaded with no write errors. Submit an order and check it appears on the "Stocdup Order Activity" dashboard (ADR-062).
7. `kubectl -n wholo logs deploy/wholo-telegraf`: `inputs.prometheus` (5 targets, no `connection refused`), `inputs.http_response` and `inputs.kube_inventory` are loaded, with no `forbidden`.
   - `kubectl -n wholo rollout status ds/wholo-telegraf-node` completes.
   - "Stocdup Platform Health" shows availability, node CPU/memory/disk and queue depth (ADR-063).
8. `kubectl -n wholo logs ds/wholo-fluent-bit`: the `loki` output is loaded, with no `connection refused`.
   - `kubectl -n wholo logs deploy/wholo-api | head` is single-line JSON.
   - `{namespace="wholo"}` in Grafana Explore → Loki returns lines (ADR-064).
9. Run a manual backup ([maintenance.md → Backups](maintenance.md#backups)). Its log ends with `backup OK`, a new `postgres/wholo-<ts>.sql.gz.bin` object is in R2, and "Stocdup Backups" shows the run as Succeeded.

If something fails and you can't fix it forward within a few minutes, go to [rollback.md](rollback.md).

## Notes

- Prisma migrations run automatically; nobody runs `migrate deploy` by hand in live.
- The demo seed job and the Keycloak demo users are **disabled** in live (`api.seedJob.enabled: false`, `keycloak.seedUsers: false`). Never enable them.
- Helm keeps the revision history (`helm -n wholo history wholo`). It is the record of what was deployed when.
