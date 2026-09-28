# GitHub setup (image builds)

> Part of the [live-ops runbook](../README.md). One-time setup — do this once per environment; day-to-day operation is in the runbook's other pages.

1. Repository → Settings → Secrets and variables → Actions → **Variables**:
   - `LIVE_KEYCLOAK_URL` = `https://auth.<domain>`
   - `LIVE_KEYCLOAK_REALM` — MUST equal `keycloak.realm` in values.live.yaml
     (the realm the chart imports); the browser bundles bake this name and
     Keycloak 404s the login page if they disagree.

   These are baked into the portal/admin JS bundles at image build time, so
   they must be set **before** the images you intend to deploy are built.
   - Marketing site (`apps/www`) build args, also baked at image build time
     (all optional — omit to ship analytics off and a single hero):
     - `WWW_PLAUSIBLE_ENABLED` = `1` to load the analytics script
     - `WWW_PLAUSIBLE_DOMAIN` = `<domain>` (the Plausible site name; defaults
       to `stocdup.com`)
     - `WWW_EXPERIMENT_HERO_VARIANTS` = e.g. `growth,operations` to turn on
       the hero A/B split (blank ⇒ `/` stays static, single hero)
2. Push to `master` (or run the `build-images` workflow manually) and confirm
   the six packages appear:
   `ghcr.io/listentorick/wholo/{api,portal-api,admin-api,driver-api,keycloak,www}`.
