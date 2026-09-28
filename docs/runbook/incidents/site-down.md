# A site is down

> Part of the [live-ops runbook](../README.md) → [incidents](README.md). Request path: [url-map.md](../url-map.md).

The request path is: browser → **Cloudflare** → **WAF appliance** → **Traefik** (a DaemonSet on every node, port 80) → **Service** → **pod**. Work out which layer fails.

## 1. Read the error

| What the browser gets | Where it failed | Look at |
|---|---|---|
| Cloudflare **521** (web server is down) | The WAF refused Cloudflare, or the WAF can't reach the nodes | WAF appliance, then node reachability (step 3) |
| Cloudflare **522 / 524** (timeout) | The WAF or Traefik isn't answering in time | WAF, Traefik pods, node load |
| Cloudflare **525 / 526** (SSL) | The Cloudflare → WAF TLS leg: a WAF cert problem, or the Origin CA cert expired | The WAF's certificate ([maintenance.md → Certificates](../maintenance.md#certificates)) |
| Cloudflare **1xxx** or a block page | A Cloudflare WAF rule | Cloudflare → Security → Events |
| **404** page not found (plain Traefik text) | Traefik has no route for that host | IngressRoutes (step 4) |
| **502 / 503** from Traefik | The route exists but no pod is Ready behind it | The pods (step 5) |
| **504** from Traefik | The pod took too long | Pod logs, database ([database.md](database.md)) |
| The app's own error page or a 5xx JSON | The app itself (usually its BFF) or `apps/api` | Pod logs (step 5) |

## 2. One host or all of them?

- **All hosts** (`www`, `portal`, `admin`, `auth`, `driver`): it's the edge, the WAF, Traefik or a node. Work down from step 3.
- **One host:** it's that host's route or pod. Go to steps 4–5. `portal`, `admin` and `driver` all depend on `wholo-api`, so if all three are 5xx, check the api and the [database](database.md).

## 3. Go around the edge

From the LAN, go straight to a node's Traefik, skipping Cloudflare and the WAF:

```bash
curl -sI -H 'Host: portal.<domain>' http://<node-ip>/
```

- **Works here but fails through Cloudflare:** the problem is the WAF or Cloudflare. Check the WAF upstream and the node IPs, its certificate, and Cloudflare's status and Security events.
- **Fails here too:** the problem is inside the cluster. Continue.

## 4. Traefik and routes

```bash
kubectl -n kube-system get pods -o wide | grep traefik       # one per labelled node, all Running
kubectl -n kube-system logs ds/traefik --since=15m | tail -50
kubectl -n wholo get ingressroute,ingress
kubectl -n wholo describe ingressroute wholo-portal           # Host() must match the real domain
```

- **A node has no Traefik pod:** it's missing the ingress label ([setup/cluster.md](../setup/cluster.md) step 3).
- **Routes are missing:** a `helm upgrade` went wrong, or `ingress.hosts.*` changed. Re-run `pnpm helm:install:live` with the right values.

## 5. The pods behind the route

```bash
kubectl -n wholo get pods -o wide
kubectl -n wholo describe pod <pod>              # Events at the bottom; "Last State" for OOMKilled
kubectl -n wholo logs <pod> --previous           # why it crashed last time
```

| Pod state | Usual cause | Fix |
|---|---|---|
| `ImagePullBackOff` | The `sha-` tag doesn't exist (a typo, or CI hasn't finished), or the GHCR packages went private | Check the tag ([deploy.md](../deploy.md#1-pre-flight) step 3). Fix the values and re-deploy, or [roll back](../rollback.md) |
| `CrashLoopBackOff` | A config or secret is missing or wrong (the logs name the variable), or Postgres/Redis is unreachable | Fix the value in `values.live.yaml`, deploy, restart. If it was caused by a deploy, [roll back](../rollback.md) |
| `Init:Error` on `wholo-api` | The `migrate` initContainer failed. The old pod keeps serving | [database.md → Migration failed](database.md#migration-failed-during-deploy) |
| `OOMKilled` | Hit the memory limit (api: 512Mi) | [node-problems.md → Memory](node-problems.md#memory-pressure-and-oomkilled) |
| `Pending` | No node can take it: a PVC pinned to a down node, or not enough CPU/memory | [node-problems.md](node-problems.md) |
| `Running` but not `Ready` | The readiness probe fails; for the api that means a DB or Redis problem | `wget` the `/api/v1/health/ready` endpoint ([incidents/README.md](README.md)), then [database.md](database.md) |

Once you've fixed the cause, `kubectl -n wholo rollout restart deploy/wholo-<app>` gives the pod a clean start.

## `www` only

The marketing site is standalone (`wholo-www`) and has no other in-cluster dependency, except that its register form uses SMTP. Analytics failing (Plausible or ClickHouse) never takes the site down.
