# Disaster recovery

> Part of the [live-ops runbook](README.md). The restore procedure itself: [postgres-restore.md](postgres-restore.md). The live topology: [overview.md](overview.md).

## Targets

- **RPO (how much data can be lost): up to 6 hours.** Backups run every 6h (`0 */6 * * *`). Take a manual backup before anything risky ([maintenance.md → Backups](maintenance.md#backups)) to shrink that.
- **RTO (how long to recover): not yet measured.** Nobody has timed a full rebuild. Record real timings in the table at the bottom the first time you do one, or rehearse one.
- Only the three Postgres databases are backed up: `wholo`, `keycloak` and `plausible`. Redis (the job queues) and ClickHouse (analytics events) are **not** backed up; see [overview.md → Where state lives](overview.md#where-state-lives).

## Why node loss matters here

Storage is `local-path`, so each PVC is a directory on **one node's** disk. The PV carries a node affinity for that node, so its pod can run nowhere else. It follows that:

- **Stateless pods move on their own.** After a node goes `NotReady`, Kubernetes evicts its pods after about 5 minutes and reschedules them on the other nodes.
- **Postgres, Redis and ClickHouse don't move.** Their pods go `Pending` until their node comes back. If the node is gone for good, so is their data.

Find which node holds each volume:

```bash
kubectl get pv -o custom-columns='PVC:.spec.claimRef.name,NODE:.spec.nodeAffinity.required.nodeSelectorTerms[0].matchExpressions[0].values[0]'
```

## Scenarios

### A pod keeps crashing

This isn't disaster recovery. Go to [incidents/](incidents/README.md).

### A node is down, but it will come back (reboot, power, network)

1. Don't delete PVCs or PVs, and don't force-delete the pending stateful pods.
2. Bring the node back. The stateful pods start on it again once it's `Ready`.
3. Check with [deploy.md → Verify](deploy.md#3-verify).

If the node holds Postgres, the whole app is down until it returns. Decide early whether to wait or to treat the node as lost.

### A node is permanently lost (dead disk or hardware)

If the lost node held **no** PVCs, remove it (`kubectl delete node <node>`), let pods reschedule, and replace the node when convenient ([setup/cluster.md](setup/cluster.md) step 3 for its ingress label).

If it held **Postgres** (and probably Redis and ClickHouse):

1. Treat this as a restore. Anything since the last R2 backup is lost.
2. Remove the node: `kubectl delete node <node>`.
3. Delete the stranded volumes, so the chart can recreate them empty on a healthy node. **DESTRUCTIVE**, but the data is already gone with the node:
   ```bash
   kubectl -n wholo delete pvc wholo-postgresql          # add wholo-redis / wholo-clickhouse if they were on it
   kubectl -n wholo delete pod -l app=wholo-postgresql --force --grace-period=0
   ```
4. Run `pnpm helm:install:live`. This creates fresh PVCs and an empty Postgres. The api's `migrate` initContainer builds an empty schema, which the restore then replaces.
5. Follow [postgres-restore.md → B. Restore into live](postgres-restore.md#b-restore-into-live-disaster-recovery--destructive) with the newest backup.
6. If Redis was lost too, any jobs that were queued but not yet processed are gone. The outbox marks an event published once it is queued, so those jobs are **not** retried on their own. In the worker logs and `outbox_events`, look for work around the loss time: emails, Xero invoice exports, Keycloak disables. Re-trigger what matters.
7. If ClickHouse was lost, Plausible's analytics history is gone. Nothing to restore.
8. Replace the node and label it ([setup/cluster.md](setup/cluster.md) step 3).

### The whole cluster is lost

Rebuild in this order:

1. **Nodes and k3s.** How the three nodes and k3s were first installed **is not documented in this repo**. Record it here the first time you do it.
2. **Cluster setup:** [setup/cluster.md](setup/cluster.md) steps 3–6: ingress labels and `traefik-config.yaml`, namespace, the `values.live.yaml` file (rebuilt from the password manager if the operator's copy is gone).
   - DNS, the WAF and Cloudflare live outside the cluster and are normally untouched.
   - If the node IPs changed, update the WAF upstream and the internal `health.<domain>` record.
3. **Deploy** the last good sha: [deploy.md](deploy.md). Postgres starts empty. Keycloak imports a fresh realm on first boot, which the restore then replaces.
4. **Restore** the newest R2 backup: [postgres-restore.md](postgres-restore.md) part B. That brings back business data, Keycloak users and realm, and Plausible config.
5. **Verify:** [deploy.md → Verify](deploy.md#3-verify), including logging in to admin and portal as real users.
6. **Ops side:** the ops host is separate, so dashboards and alerts survive. If it was lost too, redo [setup/telemetry.md](setup/telemetry.md), [setup/logging.md](setup/logging.md) and the alert step in [setup/backups.md](setup/backups.md).
7. Take a fresh manual backup.

### `values.live.yaml` is lost

Rebuild it from `values.live.example.yaml` plus the password manager, using every row in [secrets.md](secrets.md). Get the current image tags from the cluster: `helm -n wholo get values wholo`. That shows the deployed values, secrets included, so treat the output as secret.

### The backup encryption password or salt is lost

Every existing backup is unreadable, and nothing can recover them. Generate a new pair right away ([setup/backups.md](setup/backups.md) step 4), store it in the password manager, deploy, and take a manual backup so that a restorable backup exists again.

### Cloudflare or R2 outage

Nothing to do inside the cluster. The public site is down at the edge, or backups fail until R2 is back. Watch the backup alerts afterwards.

## Rehearsal

Restore the latest live backup into an isolated database ([postgres-restore.md](postgres-restore.md) part A) at least quarterly, and record the result in its "Tested" table. The first live rehearsal is still pending.

| Date | What was rehearsed or recovered | Time taken | Notes |
|---|---|---|---|
| _none yet_ | | | |
