# Orders go through but nothing follows

> Part of the [live-ops runbook](../README.md) → [incidents](README.md).

Symptoms:

- An order is accepted, but the distributor isn't notified.
- No emails arrive.
- Invoices don't reach Xero.
- The analytics or delivery dashboards are stale.
- A removed staff member's Keycloak login isn't disabled.

## How background work flows

1. `wholo-api` writes the business change **and** a row in `outbox_events` in the same database transaction (ADR-034).
2. The **outbox relay** inside `wholo-worker` picks up `PENDING` rows (and `FAILED` rows with fewer than 5 retries), adds a job to the right BullMQ queue in Redis, and only then marks the row `PUBLISHED`.
3. The worker's queue consumers process the jobs. The queues are `notifications`, `notification-delivery`, `accounting-invoice-export`, `accounting-contact-sync`, `accounting-product-sync`, `accounting-tax-type-sync`, `accounting-bulk-import`, `analytics-facts`, `delivery-run-allocation` and `keycloak-users`.

So a stall is in one of three places: the **relay** (outbox rows stay `PENDING` or `FAILED`), the **queue** (jobs pile up in Redis), or a **consumer's dependency** (SMTP, Xero, Keycloak).

## 1. Is the worker up, and is there exactly one?

```bash
kubectl -n wholo get deploy wholo-worker                  # READY 1/1, never more than 1 (ADR-047)
kubectl -n wholo exec deploy/wholo-worker -- wget -qO- localhost:3099/health/ready
kubectl -n wholo logs deploy/wholo-worker --since=30m | grep -i -E '"level":"(error|warn)"' | tail -30
```

If it's crash-looping, read `logs --previous` and treat it like any failing pod ([site-down.md → step 5](site-down.md#5-the-pods-behind-the-route)).

## 2. Is the outbox draining?

```bash
kubectl -n wholo exec deploy/wholo-postgresql -- psql -U wholo -d wholo -c \
  "SELECT status, count(*), min(\"createdAt\") AS oldest FROM outbox_events GROUP BY status"
kubectl -n wholo exec deploy/wholo-postgresql -- psql -U wholo -d wholo -c \
  "SELECT id, \"eventType\", \"retryCount\", left(\"errorMessage\", 120) FROM outbox_events
   WHERE status = 'FAILED' ORDER BY \"createdAt\" DESC LIMIT 20"
```

- **Old `PENDING` rows:** the relay isn't running. The worker is down, or Redis is ([step 3](#3-is-redis-healthy)).
- **`FAILED` rows:** the relay could not add the job to its queue. `errorMessage` says why, which is usually Redis. Rows with fewer than 5 retries are retried automatically.
- **`FAILED` with `retryCount` 5 or more:** these are no longer retried. Once the cause is fixed, and only then, re-queue them by hand (take a [manual backup](../maintenance.md#backups) first):
  ```sql
  UPDATE outbox_events SET status = 'PENDING', "retryCount" = 0, "errorMessage" = NULL
  WHERE status = 'FAILED' AND id IN ('<id>', …);
  ```

## 3. Is Redis healthy?

```bash
kubectl -n wholo get pods -l app=wholo-redis
kubectl -n wholo exec deploy/wholo-redis -- redis-cli ping                        # PONG
kubectl -n wholo exec deploy/wholo-redis -- redis-cli INFO memory | grep used_memory_human
```

Queue depth per queue: the "Stocdup Platform Health" dashboard shows it, or check directly. BullMQ keys are `bull:<queue>:<state>`.

```bash
Q=notifications
kubectl -n wholo exec deploy/wholo-redis -- redis-cli LLEN bull:$Q:wait
kubectl -n wholo exec deploy/wholo-redis -- redis-cli ZCARD bull:$Q:failed
kubectl -n wholo exec deploy/wholo-redis -- redis-cli ZCARD bull:$Q:delayed
```

A growing `wait` with the worker up means a consumer is stuck or very slow. A growing `failed` means jobs are running and failing, so go to step 4.

## 4. The consumer's dependency

| Queue | Depends on | What to check |
|---|---|---|
| `notifications`, `notification-delivery` | SMTP (PurelyMail) | Worker logs for SMTP auth or connection errors. Check `api.smtp.*` credentials ([secrets.md](../secrets.md)) and PurelyMail's status |
| `accounting-*` | Xero | Worker logs. **Disconnected or expired Xero connection:** the distributor must reconnect Xero from the admin app's accounting settings. **A customer with no Xero contact mapping:** the export fails and can be retried after mapping. **Unmapped products** fall back to the line description; that is expected |
| `keycloak-users` | Keycloak admin API (`wholo-api-admin`) | [login-broken.md → removed staff](login-broken.md#a-removed-staff-member-can-still-log-in) |
| `analytics-facts`, `delivery-run-allocation` | Postgres only | Worker logs, then [database.md](database.md) |

After fixing the dependency, jobs that failed within their retry budget are retried by BullMQ.

## Don't

- **Don't scale the worker above 1.** Two relays publish every event twice (ADR-047).
- **Don't `FLUSHALL` Redis** to "unstick" things. That throws away every queued job, and the outbox won't re-send events it already marked `PUBLISHED`. Clearing stale queues is only right after a database restore ([postgres-restore.md](../postgres-restore.md), the note on Redis at the end).
