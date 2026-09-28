# Alert responses

> Part of the [live-ops runbook](../README.md) → [incidents](README.md).

Alert rules live on the ops Grafana (`grafana.home.arpa`). Their definitions are kept in `helm/wholo/alerting/`; how to create them is in [setup/backups.md](../setup/backups.md). The only rules today are the two backup alerts below. See [Alerts that don't exist yet](#alerts-that-dont-exist-yet).

## Postgres backup failed

- **Rule:** `stocdup-backup-failed`, severity critical.
- **Meaning:** the most recent backup run exited non-zero, in the dump, the upload or the read-back check. The alert stays firing until a run succeeds.
- **Urgency:** the previous good backup is still in R2. Fix it within a few hours, before the next run (every 6h) also fails.

```bash
kubectl -n wholo get jobs -l app=wholo-pg-backup --sort-by=.metadata.creationTimestamp | tail -3
kubectl -n wholo logs job/<latest-job>          # ends with "backup FAILED (exit <n>): <object>"
```

| Log shows | Cause | Fix |
|---|---|---|
| rclone `403` / `AccessDenied` / `SignatureDoesNotMatch` | The R2 token was revoked, expired or rotated without updating values | New scoped token → `postgresql.backup.r2.*` → deploy ([secrets.md](../secrets.md)) |
| rclone timeouts / DNS errors | R2 or egress trouble | Check Cloudflare status and node egress, then retry |
| `pg_dumpall` connection errors | Postgres is down, or the password changed | [database.md](database.md) |
| The verify step fails (decrypt, gunzip or trailer check) | Upload corruption, or the encryption values changed mid-run | Retry once. If it repeats, check `postgresql.backup.encryption.*` against the password manager |
| `Job` deadline exceeded | The dump took more than 1h (the database grew, or the node is slow) | Look at the database size ([database.md → Disk full](database.md#disk-full)) |

Then run a [manual backup](../maintenance.md#backups). The alert clears when a run succeeds.

## Postgres backup stale

- **Rule:** `stocdup-backup-stale`, severity critical.
- **Meaning:** the newest **successful** backup is more than 13h old, so at least two runs were missed or failed. It also fires when there's **no data at all**.
- **Urgency:** high. The recovery point is getting worse every hour.

```bash
kubectl -n wholo get cronjob wholo-pg-backup                    # SUSPEND must be False; LAST SCHEDULE recent
kubectl -n wholo get jobs,pods -l app=wholo-pg-backup
```

- **`SUSPEND True`:** someone suspended it, maybe during a restore ([postgres-restore.md](../postgres-restore.md) part B step 1) and never resumed it. `kubectl -n wholo patch cronjob wholo-pg-backup -p '{"spec":{"suspend":false}}'`.
- **Jobs are running and failing:** handle it like [backup failed](#postgres-backup-failed).
- **Jobs are succeeding, but the alert still fires:** the metrics aren't arriving, so this is a **telemetry** problem, not a backup one. The job pushes StatsD gauges to `wholo-telegraf`, which writes to the ops InfluxDB. Check `kubectl -n wholo logs deploy/wholo-telegraf` and InfluxDB reachability ([setup/telemetry.md](../setup/telemetry.md)). Confirm the backups really exist in the R2 bucket (`stocdup-db-backups/postgres/`).
- **No jobs at all:** the CronJob is missing, which means `postgresql.backup.enabled` is false in the deployed values. Check with `helm -n wholo get values wholo`.

## Alerts that don't exist yet

The dashboards show these, but nothing pages you. These are the recommended next rules, all built on data Telegraf already collects:

| Alert | Signal | Suggested condition |
|---|---|---|
| API unavailable | `inputs.http_response` health checks ("API availability") | Any API failing for 3 minutes or more |
| High 5xx rate | HTTP 5xx by service ("5xx % over time by service") | 5xx above 5% for 5 minutes |
| Pod crash-looping | `kube_inventory` container restarts | More than 3 restarts in 15 minutes |
| Node disk | node disk % (`wholo-telegraf-node`) | Above 85% |
| Queue backlog | `stocdup_queue_jobs` waiting or failed | Waiting growing for 15 minutes, or failed above 0 |
| No orders | `stocdup_orders_submitted` | None during trading hours (tune per business) |

Until they exist, check "Stocdup Platform Health" daily. When you add one, write its response section on this page.
