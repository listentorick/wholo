# Marketing site and analytics setup

> Part of the [live-ops runbook](../README.md). One-time setup — do this once per environment; day-to-day operation is in the runbook's other pages.

`apps/www` (`www.<domain>`) is a standalone Next.js site — no BFF, no DB. Its
only backends are SMTP (lead emails) and a self-hosted Plausible it proxies
first-party.

**values.live.yaml** needs a `www:` block and a `plausible:` block (see
`values.live.example.yaml`):

- `www.image.tag` — bump the `sha-` tag alongside the others each promote.
- `www.siteUrl: https://www.<domain>`.
- `www.smtp.*` — the lead-email transport (`www.smtp.from` is the sender,
  `www.smtp.leadsTo` the internal recipient; real password in the gitignored
  values.live.yaml).
- `ingress.hosts.www: www.<domain>` — renders the Traefik IngressRoute.
- `plausible.enabled: true`, `plausible.baseUrl: https://www.<domain>`.
- `plausible.secretKeyBase` (`openssl rand -base64 64`) and
  `plausible.totpVaultKey` (`openssl rand -base64 32`) — generate once, keep
  stable (rotating them invalidates sessions / 2FA).

Enabling `plausible` also brings up `wholo-clickhouse` (its event store, a
PVC on node-local storage — same backup caveat as Postgres). Plausible's app
DB is a separate `plausible` database on the shared Postgres, created by the
deployment's `migrate` initContainer.

**Analytics only records anything if the `www` image was built with
`WWW_PLAUSIBLE_ENABLED=1`** (see [github.md](github.md)) — the Helm flag just
runs the server.

**Plausible dashboard** (no ingress — reach it by port-forward):

```bash
kubectl -n wholo port-forward svc/wholo-plausible 8000:8000
# browse http://localhost:8000 — first visit creates the admin user
# (registration is invite-only after that: plausible.disableRegistration)
```

Add the site (`<domain>`, matching `WWW_PLAUSIBLE_DOMAIN`) in the dashboard
on first run.
