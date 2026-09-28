# Email setup

> Part of the [live-ops runbook](../README.md). One-time setup — do this once per environment; day-to-day operation is in the runbook's other pages.

Live sends real mail via PurelyMail (`smtp.purelymail.com`, port 587
STARTTLS), configured through `api.smtp.*` and `keycloak.smtp*` in
values.live.yaml. Two From addresses, both on the `stocdup.com` domain so a
single SPF/DKIM/DMARC setup in Cloudflare covers both:

- `notifications@stocdup.com` — `apps/api` order/invite emails (`api.smtp.*`)
- `noreply@stocdup.com` — Keycloak account emails: verification, password
  reset (`keycloak.smtp*`, `smtpFrom` decoupled from `api.smtp.from`)

Keycloak's realm import only applies on first boot, so changing
`keycloak.smtp*` values after the realm already exists requires forcing a
re-import: drop just Keycloak's own database (not the main `wholo` app
database) and restart its pod —

```bash
kubectl exec -n wholo -it deploy/wholo-postgresql -- psql -U wholo -d wholo -c "DROP DATABASE keycloak;"
kubectl rollout restart deployment/wholo-keycloak -n wholo
```

— which deletes existing realm users/sessions, so only do this when that's
acceptable (e.g. only test/seed users exist).

MailHog is still deployed (ClusterIP-only, ClusterIP ⇒ no public exposure)
as a fallback/local-dev parity fixture, but nothing points at it in live
anymore. UI: `kubectl -n wholo port-forward svc/wholo-mailhog 8025:8025`.

The marketing site's register-interest form sends its own mail (own
`nodemailer`, not `apps/api`'s module) via `www.smtp.*` in values.live.yaml —
same PurelyMail account, ideally a dedicated `leads@stocdup.com` sender, to
`www.leadsTo`. See [marketing-site.md](marketing-site.md).
