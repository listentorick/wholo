# Database problems

> Part of the [live-ops runbook](../README.md) → [incidents](README.md). Restore: [postgres-restore.md](../postgres-restore.md). Node or volume loss: [disaster-recovery.md](../disaster-recovery.md).

`wholo-postgresql` is a single pod (TimescaleDB on Postgres 16, `max_connections=100`) running on a `local-path` volume pinned to one node. It holds the `wholo`, `keycloak` and `plausible` databases. When it's down, everything is down.

Useful shell:

```bash
PSQL="kubectl -n wholo exec -i deploy/wholo-postgresql -- psql -U wholo"
$PSQL -d wholo -c 'select 1'
```

## Postgres is down

Everything returns 5xx, and `/api/v1/health/ready` reports `db: error`.

```bash
kubectl -n wholo get pods -l app=wholo-postgresql -o wide
kubectl -n wholo describe pod -l app=wholo-postgresql | tail -30
kubectl -n wholo logs deploy/wholo-postgresql --since=30m | tail -50
```

| What you see | Meaning | Do |
|---|---|---|
| `Pending`, "volume node affinity conflict" | Its node is down, and the volume can't move | [node-problems.md](node-problems.md). Bring the node back, or follow [disaster-recovery.md](../disaster-recovery.md) |
| `CrashLoopBackOff`, logs say "No space left on device" | The node's disk is full | [Disk full](#disk-full) |
| `CrashLoopBackOff`, other errors in the logs | Corruption or a bad config | Read the log carefully. If the data directory is damaged, restore ([postgres-restore.md](../postgres-restore.md) part B) |
| `OOMKilled` | Node memory | [node-problems.md](node-problems.md#memory-pressure-and-oomkilled) |

When it comes back, the apps reconnect by themselves. Restart any that stay unready: `kubectl -n wholo rollout restart deploy/wholo-api deploy/wholo-worker`.

## Migration failed during deploy

The new `wholo-api` pod is stuck in `Init:Error` or `Init:CrashLoopBackOff`. **The old api pod keeps serving**, so users are usually unaffected, but the deploy is stuck.

```bash
kubectl -n wholo get pods -l app=wholo-api
kubectl -n wholo logs <new-api-pod> -c migrate
```

Find out how far it got. Prisma records every attempt in `_prisma_migrations`:

```bash
$PSQL -d wholo -c 'SELECT migration_name, started_at, finished_at, rolled_back_at, left(logs, 200)
                   FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5'
```

- **It failed before changing anything** (a bad SQL statement caught up front, a lock timeout): fix forward with a corrected migration in a new commit, or re-pin the previous sha ([rollback.md](../rollback.md)).
- **It failed half-way:** Postgres runs most DDL in a transaction, but not everything. A row with `finished_at` NULL blocks **every** later deploy until it's resolved.
  1. Take a [manual backup](../maintenance.md#backups).
  2. Put the schema back by hand to its pre-migration state, or finish what the migration was doing. Read the migration's SQL to see what applied.
  3. Tell Prisma, from a **running** api pod (not the failing one):
     ```bash
     kubectl -n wholo exec <running-api-pod> -c api -- npx prisma migrate resolve --rolled-back <migration_name>
     # or, if you completed it by hand:
     kubectl -n wholo exec <running-api-pod> -c api -- npx prisma migrate resolve --applied <migration_name>
     ```
  4. Deploy again: a fixed commit, or the previous sha.

Never edit or delete rows in `_prisma_migrations` directly, and never hand-write schema SQL that `schema.prisma` can't describe (ADR-052).

## Disk full

`local-path` doesn't enforce the 5Gi PVC size, so the real limit is the node's disk (about 22 GiB), which it shares with images and logs.

```bash
kubectl -n wholo exec deploy/wholo-postgresql -- df -h /var/lib/postgresql/data
$PSQL -d postgres -c "SELECT datname, pg_size_pretty(pg_database_size(datname)) FROM pg_database ORDER BY 2 DESC"
$PSQL -d wholo -c "SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10"
```

Quick space: prune unused container images on that node (`sudo k3s crictl rmi --prune`, see [maintenance.md → Disk space](../maintenance.md#disk-space)). Longer term: find what grew. The TimescaleDB fact tables (`order_facts`, `order_line_facts`, `delivery_facts`) and `audit_logs` have no retention policy yet.

## Too many connections

The logs say "sorry, too many clients already", or requests hang on connecting.

```bash
$PSQL -d postgres -c "SELECT datname, usename, application_name, state, count(*)
                      FROM pg_stat_activity GROUP BY 1,2,3,4 ORDER BY count(*) DESC"
```

The budget is `max_connections=100`. Each Prisma client uses up to 10 (`connection_limit=10`), and during a rolling deploy the api briefly runs twice. Keycloak and Plausible have their own pools. If one client has run away, restart it (`kubectl -n wholo rollout restart deploy/wholo-<app>`).

## Slow queries or lock waits

```bash
$PSQL -d wholo -c "SELECT pid, now() - query_start AS running, state, wait_event_type, left(query, 120)
                   FROM pg_stat_activity WHERE state <> 'idle' ORDER BY running DESC LIMIT 10"
$PSQL -d wholo -c "SELECT pg_cancel_backend(<pid>)"      # cancel one query; pg_terminate_backend kills the session
```

"Stocdup Platform Health" → *p95 response time by service* shows whether users feel it.
