# Backup setup

> Part of the [live-ops runbook](../README.md). One-time setup — do this once per environment; day-to-day operation is in the runbook's other pages.

Encrypted, off-cluster Postgres backups ([ADR-069](../../adrs/ADR-069-offsite-encrypted-postgres-backups.md)).
**Restore procedure: [postgres-backup-restore.md](../postgres-restore.md).**

| | |
|---|---|
| What | A full `pg_dumpall` (every database: `wholo`, `keycloak`, `plausible`), gzip-compressed. Each backup is complete and independent — no incrementals, no WAL. |
| Schedule | Every 6 hours, `0 */6 * * *` (`postgresql.backup.schedule`) — recovery point is up to 6h. CronJob `wholo-pg-backup`, `concurrencyPolicy: Forbid`, one retry, 1h deadline. |
| Storage | Cloudflare R2 bucket `stocdup-db-backups`, key prefix `postgres/`, objects named `wholo-<UTC yyyymmddThhmmssZ>.sql.gz.bin`. Nothing is written to node disk; there is no backup PVC. |
| Encryption | In the CronJob, before upload, via an rclone `crypt` remote (NaCl secretbox, authenticated). R2 only ever holds ciphertext. The password + salt are in the `wholo-pg-backup` Secret **and in the password manager** — without them a backup cannot be restored. |
| Verification | Every run reads the object back through the crypt remote and checks it decrypts, gunzips and ends with pg_dumpall's completion trailer. A run that fails deletes its partial object. |
| Retention | 3 days (~12 backups), enforced by an R2 lifecycle rule on the bucket — not by the chart. |
| Monitoring | StatsD gauges → Telegraf → ops InfluxDB: `stocdup_backup_last_run_ts`, `_last_outcome`, `_last_success_ts`, `_size_bytes`, `_duration_s`. Grafana dashboard "Stocdup Backups" (`helm/wholo/dashboards/stocdup-backups.json`). |
| Alerts | "Postgres backup failed" (last attempt failed) and "Postgres backup stale" (newest successful backup older than **13h**, i.e. two missed runs; no data counts as firing). Definitions: `helm/wholo/alerting/stocdup-backups.yaml`. |

The job runs in the Postgres image itself (so `pg_dumpall` matches the server
version); an initContainer copies the static `rclone` binary in from the pinned
`rclone/rclone` image. Postgres' own Deployment, config and data PVC are
untouched.

**One-time setup:**

1. Cloudflare → R2 → create bucket `stocdup-db-backups` (location hint near the
   k3s node; default storage class).
2. Bucket → Settings → Object lifecycle rules → add: prefix `postgres/`, delete
   objects **3 days** after upload. (Also: abort incomplete multipart uploads
   after 1 day.)
3. R2 → Manage API tokens → create a token with **Object Read & Write**,
   **applied to `stocdup-db-backups` only**. Note the access key id + secret and
   the account id.
4. Generate the encryption password and salt — `openssl rand -base64 32`, one
   each. Store **both in the password manager** (with the bucket name and
   account id) before putting them in `values.live.yaml`.
5. `values.live.yaml` → `postgresql.backup.r2.*` and `postgresql.backup.encryption.*`
   (see `values.live.example.yaml`).
6. Ops Grafana → Dashboards → Import → `helm/wholo/dashboards/stocdup-backups.json`,
   pick the Flux data source.
7. Ops Grafana → Alerting → create the two rules from
   `helm/wholo/alerting/stocdup-backups.yaml` (same Flux queries, reduce `last`,
   thresholds `> 13` and `< 1`, no-data state as in the file), in folder
   Stocdup, routed by the default notification policy. Alternatively POST each
   rule to `/api/v1/provisioning/alert-rules` after swapping `datasourceUid`
   `stocdup-influx` for the ops instance's InfluxDB data source uid.
8. *(Recommended)* Bucket → Settings → Bucket lock rules → retain objects under
   `postgres/` for 1 day, so a leaked token can't delete recent backups.

Day-to-day backup operation (manual backup, listing runs, the legacy backup PVC) is in [maintenance.md](../maintenance.md#backups).
