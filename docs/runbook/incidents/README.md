# Incidents: start here

> Part of the [live-ops runbook](../README.md). Component map: [overview.md](../overview.md).

## First five minutes

1. **Was something just deployed?** Run `helm -n wholo history wholo --max 3`. If the problem started with a deploy and isn't obviously trivial, go straight to [rollback.md](../rollback.md), then investigate.
2. **What's the blast radius?** Is one host down or all of them? Everyone, or one distributor? Logins only, or background work only (emails, Xero)?
3. **Cluster state:**
   ```bash
   kubectl get nodes
   kubectl -n wholo get pods -o wide
   kubectl -n wholo get events --sort-by=.lastTimestamp | tail -30
   ```
   Look for pods that aren't `Running`/`Ready`, climbing `RESTARTS`, `Pending`, `CrashLoopBackOff`, `ImagePullBackOff`, `OOMKilled`, and nodes that aren't `Ready`.
4. **Readiness of the core API.** This checks Postgres and Redis:
   ```bash
   kubectl -n wholo exec deploy/wholo-api -- wget -qO- localhost:3001/api/v1/health/ready
   ```
5. **Logs:**
   ```bash
   kubectl -n wholo logs deploy/wholo-<app> --since=15m
   kubectl -n wholo logs <pod> --previous          # the last crash of a restarting pod
   ```
   Or use Grafana Explore → Loki: `{namespace="wholo", app="wholo-api"} | json | level="error"`. The "Stocdup Platform Health" and "Stocdup Logs" dashboards give the overview.
6. Write down the start time and what you've tried. Add a short write-up to the incident log when it's over.

## Pick a playbook

| Symptom | Playbook |
|---|---|
| A site doesn't load, or shows a Cloudflare 5xx, a 502/504 or a 404 | [site-down.md](site-down.md) |
| Can't log in, redirect loops, "realm does not exist", logged in but getting 401s | [login-broken.md](login-broken.md) |
| Orders accepted but nothing follows: no emails, no Xero invoice, stale dashboards, removed staff can still log in | [orders-email-stuck.md](orders-email-stuck.md) |
| Everything is 5xx, `/ready` says `db: error`, a migration failed during deploy, disk full, slow queries | [database.md](database.md) |
| A node isn't `Ready`, pods are `Pending`, `OOMKilled`, disk or memory pressure | [node-problems.md](node-problems.md) |
| A Grafana alert fired | [alerts.md](alerts.md) |

## Rules while firefighting

- **Never scale `wholo-worker` above 1 replica** (ADR-047).
- **Don't delete PVCs, PVs or the `wholo` namespace**, and don't `helm uninstall`. Storage is `local-path` with ReclaimPolicy Delete, so the data is gone at once.
- **Take a manual backup before any fix that touches data** ([maintenance.md → Backups](../maintenance.md#backups)), if Postgres is up.
- Prefer reversible steps: rollout restart, re-pin the previous sha. Record anything you change by hand in Keycloak or the database; it won't be in git.
