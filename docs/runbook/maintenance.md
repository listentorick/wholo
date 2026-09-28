# Routine maintenance

> Part of the [live-ops runbook](README.md). Rotating secrets: [secrets.md](secrets.md). Recovery: [disaster-recovery.md](disaster-recovery.md).

## Backups

[setup/backups.md](setup/backups.md) covers what is backed up, when, where and how it's monitored. Restores are in [postgres-restore.md](postgres-restore.md).

```bash
# manual backup now (e.g. before a risky migration)
kubectl -n wholo create job pg-backup-manual-$(date +%s) --from=cronjob/wholo-pg-backup
kubectl -n wholo logs -f -l app=wholo-pg-backup --tail=5   # ends with "backup OK: <object> (<bytes> bytes, <n>s)"

# recent runs
kubectl -n wholo get jobs -l app=wholo-pg-backup
```

Lines in the job log saying `pg_dump: warning: there are circular foreign-key constraints` come from TimescaleDB's own catalog tables and are expected. They only matter for data-only dumps, which this is not.

Rehearse a restore into an isolated database at least quarterly ([disaster-recovery.md → Rehearsal](disaster-recovery.md#rehearsal)).

### The legacy backup PVC

The chart no longer writes to the old `wholo-pg-backups` PVC, but it doesn't delete it either. While that PVC exists, the chart re-renders it unchanged with `helm.sh/resource-policy: keep` (`templates/postgres/backup-legacy-pvc.yaml`). Helm never removes it, and its last 7 nightly dumps stay available as a fallback. Nothing writes to it any more; the old CronJob has been replaced.

To read or copy an old dump while it exists:

```bash
kubectl -n wholo run keep-dump --image=postgres:16-alpine --restart=Never \
  --overrides='{"spec":{"containers":[{"name":"keep-dump","image":"postgres:16-alpine","command":["sleep","600"],"volumeMounts":[{"name":"b","mountPath":"/backups"}]}],"volumes":[{"name":"b","persistentVolumeClaim":{"claimName":"wholo-pg-backups"}}]}}'
kubectl -n wholo exec keep-dump -- ls -lt /backups
kubectl -n wholo cp keep-dump:/backups/<file> ./<file>
kubectl -n wholo delete pod keep-dump
```

**Delete it by hand** once an R2 backup has been restored successfully into an isolated database ([postgres-restore.md](postgres-restore.md) part A): `kubectl -n wholo delete pvc wholo-pg-backups`. Later upgrades then render nothing for it.

## Rebooting or patching a node

There are no PodDisruptionBudgets, and the stateful pods are pinned to their node ([disaster-recovery.md → Why node loss matters](disaster-recovery.md#why-node-loss-matters-here)). Work on **one node at a time**, and check what it holds first:

```bash
kubectl get pv -o custom-columns='PVC:.spec.claimRef.name,NODE:.spec.nodeAffinity.required.nodeSelectorTerms[0].matchExpressions[0].values[0]'
```

- **A node with no PVCs:** safe at any time. Stateless pods move and Traefik runs on every node.
  ```bash
  kubectl drain <node> --ignore-daemonsets --delete-emptydir-data
  # patch / reboot the node
  kubectl uncordon <node>
  kubectl -n wholo get pods -o wide        # pods spread back over time; nothing Pending
  ```
- **The node with `wholo-postgresql`:** the **whole app is down** until it's back, because Postgres can't move. Do it in a quiet window and take a manual backup first. Drain it the same way; the Postgres pod goes `Pending` until you uncordon.
- **The node with `wholo-redis`:** background jobs pause. Jobs already queued survive, because Redis keeps them in AOF on its PVC.

Afterwards, check "Stocdup Platform Health" and run a quick smoke test: log in to admin and the portal.

## Upgrading k3s

1. Read the k3s release notes for the target version, especially the bundled Traefik version and deprecated APIs.
2. Upgrade the control-plane node (`k3s-00`) first, then `k3s-01` and `k3s-02`, one at a time, draining each as described above.
3. After each node: `kubectl get nodes` shows it `Ready` at the new version.
4. After all nodes, check that `deploy/live/traefik-config.yaml` still applies: Traefik is a DaemonSet on every labelled node with `externalTrafficPolicy: Local`.
   ```bash
   kubectl -n kube-system get ds traefik -o wide
   kubectl -n kube-system get svc traefik -o jsonpath='{.spec.externalTrafficPolicy}{"\n"}'
   ```
   Then confirm the health allowlist still sees real client IPs: `health.<domain>` answers from an allowed IP and returns 403 from anywhere else.

How k3s was originally installed on the nodes isn't documented yet ([disaster-recovery.md](disaster-recovery.md#the-whole-cluster-is-lost)). Note the method here when you next upgrade.

## Disk space

Each node has about 22 GiB. `local-path` **does not enforce PVC sizes**: `storageSize: 5Gi` is a label, not a limit. The real limit is the node's disk, which Postgres, Redis, ClickHouse, container images and logs all share.

```bash
kubectl describe nodes | grep -E '^Name:|DiskPressure'
kubectl -n wholo exec deploy/wholo-postgresql -- df -h /var/lib/postgresql/data
kubectl -n wholo exec deploy/wholo-postgresql -- psql -U wholo -d postgres -c \
  "SELECT datname, pg_size_pretty(pg_database_size(datname)) FROM pg_database ORDER BY pg_database_size(datname) DESC"
```

"Stocdup Platform Health" also shows node disk %.

To free space on a node, run on the node itself:

```bash
sudo k3s crictl rmi --prune        # removes images no container is using (old sha- tags pile up)
```

If Postgres itself is growing, see [incidents/database.md → Disk full](incidents/database.md#disk-full).

## Certificates

- **Visitor-facing certificates** are Cloudflare edge certificates, issued and renewed by Cloudflare. Nothing to do.
- **Cloudflare Origin CA certificate** on the WAF appliance (the Cloudflare → WAF leg). Its validity was chosen when it was created (Cloudflare's default is 15 years). Record the expiry date in the password manager entry. When it expires, Cloudflare returns **526** for every host. To replace it: Cloudflare → SSL/TLS → Origin Server → Create Certificate (`*.<domain>`), then install it on the WAF.
- Inside the cluster everything is plain HTTP; there are no certificates to maintain.

## Upgrading upstream images

Postgres, Redis, ClickHouse, Plausible, Telegraf, Fluent Bit, MailHog and the rclone image are pinned in `helm/wholo/values.yaml`. Keycloak's base image is pinned in `apps/keycloak/Dockerfile`. Upgrade them through a normal commit and [deploy.md](deploy.md), one component per release. Upgrading any of Postgres, Redis or ClickHouse restarts it (`Recreate`), which means brief downtime.

- **Postgres/TimescaleDB:** minor versions (same `pg16`) are a normal deploy. Run `ALTER EXTENSION timescaledb UPDATE;` in each database that uses it if the TimescaleDB release notes ask for it. A **major** Postgres version can't start on the old data directory: dump, recreate and restore ([postgres-restore.md](postgres-restore.md) part B, from a fresh manual backup). Rehearse it with part A first.
- **Keycloak:** read the upgrade notes. The theme (`apps/keycloak/themes/wholo`) overrides login templates, so check the login, register and reset-password pages after upgrading.
- **Plausible:** its `migrate` initContainer handles schema changes.

## Rotating secrets

See [secrets.md](secrets.md). Remember that changing a Secret doesn't restart the pods that use it.
