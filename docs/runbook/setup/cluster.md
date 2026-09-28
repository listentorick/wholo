# Cluster and edge setup

> Part of the [live-ops runbook](../README.md). One-time setup — do this once per environment; day-to-day operation is in the runbook's other pages.

1. **DNS / Cloudflare** — zone on Cloudflare (nameservers delegated from the
   registrar). A records for `www.`, `portal.`, `admin.`, `auth.`, `driver.<domain>` →
   the WAF's public IP, all **Proxied** (`apps/api` gets no public host —
   BFFs reach it over cluster DNS). Cloudflare settings: SSL/TLS mode
   **Full (strict)**, **Always Use HTTPS** on.
   - The bare apex `<domain>` is **not** served by the cluster (the WAF's
     Cloudflare Origin CA cert is `*.<domain>`, which does not cover the
     apex). Add a proxied A record for `<domain>` (any address — Cloudflare
     never connects to it) plus a **Redirect Rule**: *When incoming host
     equals `<domain>` → 301 to `https://www.<domain>${uri.path}`*.
   - `health.<domain>` is **internal only** — not a Cloudflare record. Point
     an internal DNS record (resolvable only on the operator's LAN/VPN) at a
     k3s node directly, bypassing Cloudflare and the WAF, so the
     `healthAccess.allowedIPs` allowlist sees real source IPs
     (`ingress.hosts.health` in values; see [url-map.md](../url-map.md)).

2. **WAF appliance** (in front of the cluster; terminates TLS) — install a
   Cloudflare **Origin CA certificate** (dashboard: SSL/TLS → Origin Server →
   Create Certificate, `*.<domain>`) as its server cert; upstream = k3s
   node(s) port **80** plain HTTP; preserve the `Host` header; send
   `X-Forwarded-Proto: https`; accept inbound 443 only from
   [Cloudflare's IP ranges](https://www.cloudflare.com/ips/).

3. **Traefik node placement + forwarded-headers trust** — label every node
   that should run ingress traffic (currently all 3; this is also the label
   k3s's own ServiceLB uses to decide which nodes it exposes at all, so
   labelling a node here is what makes it an "ingress node"):
   ```bash
   kubectl label node k3s-00 svccontroller.k3s.cattle.io/enablelb=true
   kubectl label node k3s-01 svccontroller.k3s.cattle.io/enablelb=true
   kubectl label node k3s-02 svccontroller.k3s.cattle.io/enablelb=true
   ```
   Then fill the WAF's internal IP into `deploy/live/traefik-config.yaml` and
   apply it:
   ```bash
   kubectl apply -f deploy/live/traefik-config.yaml
   ```
   This runs Traefik as a DaemonSet (one pod per labelled node) with
   `externalTrafficPolicy: Local`, so every ingress node serves traffic from
   its own local pod and Traefik always sees the real client IP — required
   for the `healthAccess.allowedIPs` allowlist to hold regardless of which
   node a request lands on. If a node is later added to or removed from the
   cluster's ingress-facing set, re-run the matching `kubectl label` command
   for it (`...enablelb-` to remove).

4. **Namespace**
   ```bash
   kubectl create namespace wholo
   ```

5. **GHCR pull secret** — only if the packages are made private (they are
   currently public; skip this and leave `imagePullSecrets` unset). Create a
   GitHub PAT (classic) with `read:packages`:
   ```bash
   kubectl -n wholo create secret docker-registry ghcr-pull \
     --docker-server=ghcr.io \
     --docker-username=listentorick \
     --docker-password=<PAT>
   ```

6. **Values**
   ```bash
   cp helm/wholo/values.live.example.yaml helm/wholo/values.live.yaml
   ```
   Fill in the domain, strong passwords, R2 credentials, and a pinned
   `sha-` image tag from the latest `build-images` run.
