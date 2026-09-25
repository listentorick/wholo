# Restoring Postgres from an R2 backup

How to select, download, decrypt and apply one of the encrypted off-cluster
backups made by the `wholo-pg-backup` CronJob
([ADR-069](../adrs/ADR-069-offsite-encrypted-postgres-backups.md); schedule,
storage and monitoring are in [live-k3s.md → Backups](live-k3s.md#backups)).

Each backup is a complete `pg_dumpall` of the whole Postgres server — every
database (`wholo`, `keycloak`, `plausible`) plus roles — as a gzip-compressed
plain SQL script, encrypted with rclone `crypt`. Applying one restores **all**
databases to that point in time; there is no per-database or point-in-time
restore.

**Always rehearse against an isolated database first** (part A). Only restore
into live (part B) once part A has produced a verified copy of the backup you
intend to use.

## Prerequisites

- **rclone ≥ 1.71** on the machine doing the restore (`rclone version`). Any
  OS; or run it from the `rclone/rclone:1.71.1` image.
- **R2 credentials** with read access to the backup bucket: account id, access
  key id, secret access key. The CronJob's token (Object Read & Write, scoped to
  the bucket) works; it is in the password manager and in `values.live.yaml`.
- **The encryption password and salt** — from the password manager (entry
  "Stocdup Postgres backups"). Both are required; without them the backups
  cannot be decrypted by anyone, including Cloudflare.
- **Docker** (part A) or **kubectl** access to the `wholo` namespace (part B).
- Free disk for the downloaded file (a backup is a few MB compressed; the
  uncompressed SQL is several times larger, but it is streamed, never written).

## 1. Configure rclone (environment only — nothing written to disk)

Run in a shell you will close afterwards. `read -s` keeps the secrets out of
shell history.

```bash
export RCLONE_CONFIG=""                          # no config file

export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
read -r  -p "R2 account id: "        R2_ACCOUNT_ID
read -r  -p "R2 access key id: "     RCLONE_CONFIG_R2_ACCESS_KEY_ID
read -rs -p "R2 secret access key: " RCLONE_CONFIG_R2_SECRET_ACCESS_KEY; echo
export RCLONE_CONFIG_R2_ACCESS_KEY_ID RCLONE_CONFIG_R2_SECRET_ACCESS_KEY
export RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

export RCLONE_CONFIG_R2CRYPT_TYPE=crypt
export RCLONE_CONFIG_R2CRYPT_REMOTE="r2:stocdup-db-backups/postgres"
export RCLONE_CONFIG_R2CRYPT_FILENAME_ENCRYPTION=off
export RCLONE_CONFIG_R2CRYPT_DIRECTORY_NAME_ENCRYPTION=false
read -rs -p "Backup encryption password: " P; echo
read -rs -p "Backup encryption salt: "     S; echo
export RCLONE_CONFIG_R2CRYPT_PASSWORD="$(printf '%s' "$P" | rclone obscure -)"
export RCLONE_CONFIG_R2CRYPT_PASSWORD2="$(printf '%s' "$S" | rclone obscure -)"
unset P S
```

These are exactly the remotes the CronJob uses (`templates/postgres/backup-cronjob.yaml`).
The password and salt are the raw values; the `rclone obscure` step is required.

## 2. Select a backup

```bash
rclone lsl r2crypt:          # size, upload time, name — newest last
```

Names are `wholo-<UTC yyyymmddThhmmssZ>.sql.gz` — the time the dump **started**,
in UTC. Retention is 3 days, so expect about 12 entries. Pick the newest one
taken *before* whatever you are recovering from. Only successful runs leave an
object behind (a failed run deletes its partial upload), and the Grafana
"Stocdup Backups" dashboard / the job logs (`backup OK: <name>`) confirm which
ones succeeded.

```bash
BACKUP=wholo-20260925T120000Z.sql.gz     # ← the one you chose
```

## 3. Download, decrypt and check

```bash
rclone copy "r2crypt:$BACKUP" .          # decrypts on the fly; ./$BACKUP is plain gzip
gzip -t "$BACKUP" && echo "gzip OK"
gunzip -c "$BACKUP" | tail -n 3          # must show: -- PostgreSQL database cluster dump complete
```

A wrong password/salt fails here with a decryption error — nothing is written.
If the trailer line is missing the dump is truncated: do not use it; pick the
previous backup.

Treat the decrypted file as production data: keep it only on an encrypted disk
and delete it when done (`shred -u "$BACKUP"` or equivalent).

## A. Restore into an isolated database (rehearsal / inspection)

Never touches live. Use the same image as live so the TimescaleDB extension
version matches.

```bash
docker run -d --name restore-test -e POSTGRES_PASSWORD=restore \
  timescale/timescaledb:2.17.2-pg16
sleep 15    # wait for init

gunzip -c "$BACKUP" | docker exec -i restore-test psql -U postgres -d postgres -q
```

Expected output: no `ERROR` lines (only `set_config`/`setval` result rows).
The `postgres` superuser is used deliberately so that the dump's
`CREATE ROLE wholo` succeeds.

The same works inside the cluster, isolated in its own namespace:

```bash
kubectl create namespace restore-test
kubectl -n restore-test run pg --image=timescale/timescaledb:2.17.2-pg16 \
  --env=POSTGRES_PASSWORD=restore --restart=Never
kubectl -n restore-test wait --for=condition=ready pod/pg --timeout=120s; sleep 10
gunzip -c "$BACKUP" | kubectl -n restore-test exec -i pg -- psql -U postgres -d postgres -q
# … verify (below, with `kubectl -n restore-test exec pg --` instead of `docker exec restore-test`) …
kubectl delete namespace restore-test
```

### Verify

```bash
q() { docker exec restore-test psql -U postgres -d "$1" -Atc "$2"; }
q postgres "select datname from pg_database order by 1"                 # includes keycloak, plausible, wholo
q wholo    "select count(*) from organisations"
q wholo    "select count(*) from orders"
q wholo    "select max(\"createdAt\") from orders"                    # ≈ just before the backup time
q wholo    "select hypertable_name, num_chunks from timescaledb_information.hypertables"   # delivery_facts, order_facts, order_line_facts
q wholo    "select migration_name from _prisma_migrations order by finished_at desc limit 1"
q keycloak "select count(*) from user_entity"
```

Compare against the source where you can (same queries against live, read-only):
counts should match as of the backup time, the latest migration name should
match the deployed release (or be older, if the backup predates a migration),
and every fact table should be listed as a hypertable.

Clean up: `docker rm -f restore-test`.

## B. Restore into live (disaster recovery — DESTRUCTIVE)

Replaces **every** database on the live server with the backup's contents.
Everything written after the backup's timestamp is lost. Do part A with the
same file first.

1. **Stop writers.** Scale every Postgres client to zero:

   ```bash
   kubectl -n wholo scale deploy \
     wholo-api wholo-worker wholo-admin-api wholo-portal-api wholo-driver-api \
     wholo-keycloak wholo-plausible --replicas=0
   kubectl -n wholo patch cronjob wholo-pg-backup -p '{"spec":{"suspend":true}}'
   kubectl -n wholo get pods          # only postgresql, redis, … remain
   ```

   (Skip `wholo-plausible` if it isn't deployed.)

2. **Make sure Postgres is up.** If the node or its disk was lost, re-deploy
   first (`pnpm helm:install:live`); the chart recreates an empty
   `wholo-postgresql` with a fresh data PVC. Wait for it to be Ready.

3. **Drop the existing databases** (connected to the `postgres` maintenance DB):

   ```bash
   kubectl -n wholo exec deploy/wholo-postgresql -- psql -U wholo -d postgres \
     -c 'DROP DATABASE IF EXISTS wholo WITH (FORCE)' \
     -c 'DROP DATABASE IF EXISTS keycloak WITH (FORCE)' \
     -c 'DROP DATABASE IF EXISTS plausible WITH (FORCE)'
   ```

4. **Apply the backup:**

   ```bash
   gunzip -c "$BACKUP" | kubectl -n wholo exec -i deploy/wholo-postgresql -- \
     psql -U wholo -d postgres -q
   ```

   Exactly one error is expected and harmless: `ERROR: role "wholo" already
   exists` (the server's bootstrap superuser). Any other `ERROR` means stop and
   investigate before bringing apps back.

5. **Verify** with the queries from part A, run through
   `kubectl -n wholo exec deploy/wholo-postgresql -- psql -U wholo -d <db> -Atc "…"`.

6. **Bring everything back:**

   ```bash
   kubectl -n wholo scale deploy wholo-keycloak --replicas=1
   kubectl -n wholo rollout status deploy/wholo-keycloak
   kubectl -n wholo scale deploy wholo-api wholo-admin-api wholo-portal-api \
     wholo-driver-api wholo-plausible --replicas=1
   kubectl -n wholo scale deploy wholo-worker --replicas=1    # exactly 1 (ADR-047)
   kubectl -n wholo patch cronjob wholo-pg-backup -p '{"spec":{"suspend":false}}'
   ```

   Or simply re-run `pnpm helm:install:live`, which restores every replica
   count from the chart.

7. Run the [verification checklist](live-k3s.md#verification-checklist-after-deploy),
   log in to admin and portal, then take a fresh manual backup:
   `kubectl -n wholo create job pg-backup-post-restore --from=cronjob/wholo-pg-backup`.

Note on Redis: queued BullMQ jobs and cached state in Redis are **not** part
of the backup and may reference rows newer than the restored data. The outbox
(in Postgres) is restored consistently with the rest of the data; if workers
log errors about missing rows after a restore, flush the stale queues rather
than the database.

## Tested

| Date | Against | Result |
|---|---|---|
| 2026-09-25 | Local Docker: TimescaleDB 2.17.2-pg16 source with a hypertable (31 chunks) + a `keycloak` DB, backed up by the real `backup.sh` (R2 swapped for a local rclone remote), restored per part A into a fresh instance and per part B into a live-configured instance (`POSTGRES_USER=wholo`) | Both passed: all databases present, row counts and chunk count identical, hypertable chunk-excluded queries correct. Part B produced only the expected `role "wholo" already exists` error. Raw object confirmed not gzip (ciphertext). |
| _pending_ | Live backup from R2, part A into an isolated namespace | Record the result here after the first live backup. |
