# Live-ops runbook

This is how the live Stocdup environment (self-hosted k3s) is set up, deployed, operated and recovered. Local development is not covered here; see `CLAUDE.md`.

## I need to…

| Situation | Go to |
|---|---|
| Understand what runs where and what depends on what | [overview.md](overview.md), [url-map.md](url-map.md) |
| Ship a new release to live | [deploy.md](deploy.md) |
| Back out a bad release | [rollback.md](rollback.md) |
| Something is broken right now | [incidents/README.md](incidents/README.md) |
| An alert fired | [incidents/alerts.md](incidents/alerts.md) |
| Rotate or find a secret | [secrets.md](secrets.md) |
| Reboot or upgrade a node, free disk, check certs, run a backup by hand | [maintenance.md](maintenance.md) |
| Recover from a lost node or build the cluster again | [disaster-recovery.md](disaster-recovery.md) |
| Restore Postgres from R2 | [postgres-restore.md](postgres-restore.md) |
| See marketing-site traffic and sign-up conversions | [analytics.md](analytics.md) |
| Set up an environment (one-time) | [setup/](#one-time-setup) below |

## Before you start: access

You need:

- **`kubectl` access to the live cluster.** Every command here assumes namespace `wholo` (`-n wholo`), and all resources are named `wholo-*`.
  - Check you are pointed at live, not local Docker Desktop, before running anything: `kubectl config current-context`.
- **`helm/wholo/values.live.yaml`.** It is gitignored and holds every live secret and the pinned image tags.
  - It lives only on the operator's machine, plus the password manager (see [secrets.md](secrets.md)). Losing it means rebuilding it from the password manager.
- **The password manager entries** listed in [secrets.md](secrets.md). The backup encryption password and salt matter most.
- **LAN/VPN access** to the ops host (`grafana.home.arpa`, `influxdb.home.arpa`, `loki.home.arpa`) and to the internal `health.<domain>` record.
- **Accounts:** Cloudflare (DNS, R2), GitHub (repository and Actions), PurelyMail, and the Xero developer app.

## Dashboards and logs

All of these are on the ops Grafana (`http://grafana.home.arpa:3000`):

- **Stocdup Platform Health:** availability, HTTP errors and latency, pod restarts, node CPU/memory/disk, queue depth.
- **Stocdup Order Activity:** orders submitted and their value.
- **Stocdup Backups:** the last run, its outcome and age.
- **Stocdup Logs:** log volume by app and level, error and 5xx counts.
- **Logs:** Explore → Loki. Labels are `namespace`, `app` (for example `wholo-api`), `container`, `node` and `environment`.
  - All errors from one app: `{namespace="wholo", app="wholo-api"} | json | level="error"`.

## One-time setup

In order, for a new environment:

1. [setup/github.md](setup/github.md): repository variables baked into the images, and the first image build.
2. [setup/cluster.md](setup/cluster.md): DNS/Cloudflare, WAF, Traefik, namespace, values file.
3. [deploy.md](deploy.md): first `helm upgrade --install`.
4. [setup/keycloak.md](setup/keycloak.md): first real user, realm caveats, service-account client.
5. [setup/email.md](setup/email.md): PurelyMail, SPF/DKIM/DMARC.
6. [setup/backups.md](setup/backups.md): R2 bucket, token, encryption keys, alerts.
7. [setup/telemetry.md](setup/telemetry.md) and [setup/logging.md](setup/logging.md): the ops-host InfluxDB, Grafana and Loki side.
8. [setup/marketing-site.md](setup/marketing-site.md): the marketing site (`www`) and its web analytics (Plausible). What Plausible is: [overview.md](overview.md#web-analytics-plausible).

## Conventions in this runbook

- `<domain>` is the live domain. `<sha>` is a 7-character commit sha.
- Commands are written for the live cluster and are safe unless marked **DESTRUCTIVE**.
- If a step here turns out to be wrong, fix the doc in the same change as the fix.
