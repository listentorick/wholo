# Node and scheduling problems

> Part of the [live-ops runbook](../README.md) → [incidents](README.md). Maintenance (drain, reboot, disk cleanup): [maintenance.md](../maintenance.md). A node that's gone for good: [disaster-recovery.md](../disaster-recovery.md).

The cluster is three small nodes (about 2 CPU, 4 GiB RAM and 22 GiB disk each). There's little headroom: the pod memory **limits** in `wholo` add up to about 8.6 GiB, and the requests are much lower. Stateful pods (Postgres, Redis, ClickHouse) are pinned to the node that holds their `local-path` volume.

```bash
kubectl get nodes -o wide
kubectl describe node <node> | sed -n '/Conditions:/,/Addresses:/p'
kubectl top nodes; kubectl -n wholo top pods          # k3s ships metrics-server
```

## A node is `NotReady`

1. Find out what's on it:
   ```bash
   kubectl -n wholo get pods -o wide --field-selector spec.nodeName=<node>
   kubectl get pv -o custom-columns='PVC:.spec.claimRef.name,NODE:.spec.nodeAffinity.required.nodeSelectorTerms[0].matchExpressions[0].values[0]'
   ```
2. Stateless pods are evicted after about 5 minutes and rescheduled on the other nodes. Traefik runs on every node, so ingress keeps working.
3. If the node holds a PVC, its pod stays down until the node returns. Postgres there means the whole app is down.
4. Get to the node through its console or SSH: power, network, disk full, `journalctl -u k3s` (`k3s-agent` on the workers).
5. If it won't come back, go to [disaster-recovery.md → Node permanently lost](../disaster-recovery.md#a-node-is-permanently-lost-dead-disk-or-hardware).

## Pods stuck `Pending`

```bash
kubectl -n wholo describe pod <pod> | sed -n '/Events:/,$p'
```

| Event message | Meaning | Do |
|---|---|---|
| `volume node affinity conflict` / `didn't match PersistentVolume's node affinity` | Its volume's node is down or cordoned | Bring the node back, or `kubectl uncordon <node>` |
| `Insufficient memory` / `Insufficient cpu` | No node has room for its **requests** | See [Memory pressure](#memory-pressure-and-oomkilled). Check for a stray extra pod (a leftover restore or debug pod) |
| `node(s) had untolerated taint` | A node is cordoned or tainted (disk or memory pressure) | See the sections below |

## Memory pressure and `OOMKilled`

`kubectl -n wholo describe pod <pod>` shows `Last State: Terminated, Reason: OOMKilled` when a container hit its limit.

| Memory limits (live) | |
|---|---|
| keycloak | 2Gi |
| clickhouse | 1500Mi |
| portal-api, admin-api, driver-api | 768Mi each |
| plausible | 700Mi |
| api, postgresql | 512Mi each |
| www | 384Mi |
| worker, redis | 256Mi each |
| telegraf | 192Mi |
| mailhog | 128Mi |

- **One pod is OOMKilled repeatedly:** it has outgrown its limit, or it's leaking. Check the logs just before the kill. Raise its `resources` in the values as a fix-forward and re-deploy. Watch the node total when you do.
- **Postgres is OOMKilled:** everything drops for a moment. Look for a heavy query around that time ([database.md → Slow queries](database.md#slow-queries-or-lock-waits)) before raising its limit.
- **The node has `MemoryPressure`:** the kubelet starts evicting pods. `kubectl top pods` shows who's using it. A quick relief is scaling down something non-essential: `kubectl -n wholo scale deploy/wholo-mailhog --replicas=0`, or Plausible and ClickHouse if analytics can wait. The next `helm:install:live` restores them.

## Disk pressure

The node condition `DiskPressure=True`, pods evicted with `The node was low on resource: ephemeral-storage`, or Postgres logging "No space left on device".

On the node:

```bash
df -h /var/lib/rancher /var/log
sudo k3s crictl rmi --prune                 # unused images (old sha- tags)
sudo journalctl --vacuum-size=200M          # if the system journal is large
```

If Postgres data is what grew, see [database.md → Disk full](database.md#disk-full). `local-path` volumes live under `/var/lib/rancher/k3s/storage` on the node.

## A node lost its ingress role

The node shows no `traefik` pod (`kubectl -n kube-system get pods -o wide | grep traefik`), or requests the WAF sends to it fail. Re-apply its label ([setup/cluster.md](../setup/cluster.md) step 3):

```bash
kubectl label node <node> svccontroller.k3s.cattle.io/enablelb=true
```
