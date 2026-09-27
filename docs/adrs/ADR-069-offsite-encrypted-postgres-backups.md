# ADR-069: Encrypted off-cluster Postgres backups to Cloudflare R2

## Status
Accepted

## Context
Live runs on a single self-hosted k3s node (ADR-048). The only backup was a nightly `pg_dumpall | gzip` CronJob writing to the `wholo-pg-backups` PVC, keeping 7 dumps. That PVC is on the same node-local disk (local-path) as the Postgres data PVC, so losing the disk loses the database and every backup together. The dumps were also unencrypted.

Constraints:

- **Leave Postgres alone.** No config change, restart, image rebuild, or change to its Deployment or data PVC. That rules out anything that needs WAL archiving (`archive_command`) or a sidecar.
- **Wholo is still small.** A full dump is a few MB compressed and takes seconds, so full dumps are cheap.
- **No new operational surface.** One small team runs this. Every new image to build and patch, or service to run, costs something.

## Decision

### 1. A full `pg_dumpall` every 6 hours, streamed to R2
The `wholo-pg-backup` CronJob (`0 */6 * * *`, `concurrencyPolicy: Forbid`, one retry, 1h deadline) runs:

```
pg_dumpall | gzip | rclone rcat r2crypt:wholo-<UTC ts>.sql.gz
```

- **Full dumps.** Each backup is a complete dump of every database: `wholo`, `keycloak` and `plausible`, plus roles. There are no incrementals, so any single object restores on its own.
- **Streamed.** Nothing touches node disk. The chart stops writing to the old backup PVC but keeps it (`helm.sh/resource-policy: keep`) until it is deleted by hand after R2 is proven.
- **Recovery point: up to 6 hours.** We accept that for now. PITR, WAL archiving, CloudNativePG and HA are out of scope, and each would need a Postgres change.

### 2. Encryption: rclone `crypt`, symmetric, applied in the CronJob
The upload goes through an rclone `crypt` remote layered on the R2 (S3) remote. It encrypts before upload with NaCl secretbox (XSalsa20-Poly1305, authenticated), keyed from a password plus salt.

- **R2 only ever sees ciphertext.** The key isn't Cloudflare's; it's ours.
- **Key storage.** The password and salt live in the `wholo-pg-backup` Secret, rendered from the gitignored `values.live.yaml`. They are **also** held in the password manager, because losing the cluster loses the Secret.
- **Readable object names.** File-name encryption is off, so objects keep names like `wholo-20260925T120000Z.sql.gz.bin`. That lets you pick a backup by time and lets the lifecycle rule target the `postgres/` prefix. Timestamps aren't sensitive.

**Considered: `age` with an asymmetric recipient key.** The cluster would hold only the public key, and the private key would stay offline. A leak of the cluster or of `values.live.yaml` would then expose the R2 credentials but still not decrypt old backups.

- **Rejected for now because it needs a custom image.** There is no official `age` image, so we'd have to build, publish and patch one in CI and locally.
- **The extra protection is marginal here.** The same compromise already exposes the live database itself.

Revisit this if backups ever go somewhere with a wider audience than the cluster.

### 3. No custom image
The job runs in `postgresql.image`, the same TimescaleDB image as the server, so `pg_dumpall` always matches the server version.

- An initContainer copies the static `rclone` binary out of a pinned upstream `rclone/rclone` image into an `emptyDir`.
- Nothing is installed at runtime, and nothing new is built.
- All rclone configuration comes from `RCLONE_CONFIG_*` env vars. There is no config file.

### 4. Every run proves its own backup
After upload, the job reads the object back through the crypt remote and pipes it through `gunzip`. It then checks for pg_dumpall's final `PostgreSQL database cluster dump complete` trailer. That proves three things:

- the object decrypts
- it is intact
- it is not truncated

A run that fails before this check passes deletes its object. Otherwise, a dump that died mid-stream could leave a well-formed gzip that looks restorable.

### 5. Retention in R2, not in the job
An R2 object lifecycle rule on the `postgres/` prefix deletes backups after **3 days**, which is about 12 backups. The job never deletes old backups, so the CronJob's credential doesn't need list-and-delete logic to enforce retention.

An optional R2 bucket lock of 1 day keeps a leaked token from wiping recent backups. R2 tokens can't be write-only; the narrowest is Object Read & Write, scoped to the bucket.

### 6. Health via StatsD gauges on the existing telemetry pipeline
The script sends five StatsD gauges over UDP to the in-cluster Telegraf. It uses the same InfluxDB-tag wire format as `@wholo/nest-telemetry` (ADR-062/063). The gauges:

- `stocdup_backup_last_run_ts`
- `stocdup_backup_last_outcome` (1/0)
- `stocdup_backup_last_success_ts` (when the snapshot started)
- `stocdup_backup_size_bytes`
- `stocdup_backup_duration_s`

An `EXIT` trap reports a failure for any non-zero exit.

- **Why timestamps as values.** Telegraf keeps gauges (`delete_gauges = false`), and each timestamp value is the event time itself. So "age of the latest successful backup" comes out as `now − max(last_success_ts)`, and it survives Telegraf restarts.
- **Grafana.** The "Stocdup Backups" dashboard shows the latest run, its outcome, the age of the newest good backup, and size and duration over time. It's committed with the other dashboards.
- **Two alert rules,** provisioned into the local Grafana from `helm/wholo/alerting/` and created by hand on the ops Grafana:
  - **Postgres backup failed:** the last outcome was 0. It stays firing until a run succeeds.
  - **Postgres backup stale:** the newest success is older than **13h**, meaning two runs were missed. No data also counts as firing. This catches everything the script can't report itself: the CronJob suspended or deleted, the pod never scheduled, OOM, or an image-pull failure.

Telemetry is best-effort. A lost UDP datagram can at worst delay the failure alert until the stale rule fires. It can never make a missing backup look healthy.

## Consequences

- **Survives node or disk loss.** Backups are in R2, and restoring needs only rclone, the R2 credentials and the key from the password manager. The procedure is in `docs/deployment/postgres-backup-restore.md` and has been tested against an isolated database.
- **The recovery point gets shorter.** It was 24h and is now 6h.
- **The key is now critical.** If the encryption key is lost, every backup is unrecoverable. It's kept in the password manager alongside `values.live.yaml`.
- **Rotating the key** makes backups taken before the rotation need the old key. With 3-day retention, keep the old key for 3 days after rotating.
- **The old PVC is kept, not deleted.** The upgrade leaves `wholo-pg-backups` and its last dumps in place as a fallback; an operator deletes it once an R2 backup has been restored successfully (see live-k3s.md).
- **Full dumps have a size ceiling.** At some size a full dump every 6 hours stops being cheap. Revisit this ADR, towards WAL-based PITR, when a backup takes minutes rather than seconds or the recovery point needs to be under 6h.
