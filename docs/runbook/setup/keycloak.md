# Keycloak setup

> Part of the [live-ops runbook](../README.md). One-time setup — do this once per environment; day-to-day operation is in the runbook's other pages.

## First real user (no seed data)

1. Log into the Keycloak admin console at `https://auth.<domain>` with
   `keycloak.adminUser`/`adminPassword` from values.live.yaml.
2. In the app realm (`keycloak.realm` from values.live.yaml), create the
   first real user (email as username).
3. Create the distributor organisation and membership for that user via the
   API (or directly in the database) — the user's Keycloak `sub` is resolved
   to organisation/role through the `Membership` table on first login.

## Realm import is first-boot only

`--import-realm` only imports the realm on **first boot**. Later changes to
`keycloak.adminClientUrl` / `portalClientUrl` (redirect URIs) in values do not
propagate to an existing installation — change them in the Keycloak admin
console instead, or delete and re-import the realm.

## Keycloak service-account client (team removal)

Removing a team member (Team page → **Remove from team**) revokes their access
in Stocdup immediately, and the worker then **disables their Keycloak login** so
they can't sign in at all (ADR-067). That call uses a dedicated service-account
client, `wholo-api-admin`, which holds only `realm-management: manage-users`.

- **Fresh realm:** created by the realm import from
  `keycloak.apiAdminClientSecret` — nothing to do beyond setting that value in
  `values.live.yaml` (`openssl rand -hex 32`).
- **Existing realm** (import is first-boot-only, so this applies to every
  environment that existed before this feature): run once, then redeploy so
  the api/worker pick up the secret:

  ```bash
  # local 3080 → the Service's 8080; the script defaults to KEYCLOAK_URL=http://localhost:3080
  kubectl port-forward svc/wholo-keycloak 3080:8080 -n wholo &
  CLIENT_SECRET='<keycloak.apiAdminClientSecret from values.live.yaml>' \
  REALM=<your realm, e.g. prod> KEYCLOAK_ADMIN=<admin user> KEYCLOAK_ADMIN_PASSWORD=<admin password> \
  scripts/setup-keycloak-api-admin-client.sh
  ```

  Idempotent; it ends by proving the client can obtain a token. Until the
  client exists, removal still works in Stocdup (the person is locked out at
  the API), but the queued Keycloak disables retry and fail — check the worker
  logs for `KEYCLOAK_ADMIN_CLIENT_SECRET` / `Keycloak could not …`.

## Branded emails and error page

Keycloak sends its own emails (verify email, password reset, security notices)
and renders its own error page. Both are themed to match Stocdup: the theme
ships inside the Keycloak image (`apps/keycloak/themes/wholo`), and two realm
settings switch it on — the realm's email theme, and a base URL on the
`wholo-admin` / `wholo-portal` clients (what the error page's "Back to Stocdup"
button links to).

- **Fresh realm:** set by the realm import — nothing to do.
- **Existing realm** (import is first-boot-only): deploy a Keycloak image that
  contains the theme, then run once:

  ```bash
  kubectl port-forward svc/wholo-keycloak 3080:8080 -n wholo &
  REALM=<your realm, e.g. prod> KEYCLOAK_ADMIN=<admin user> KEYCLOAK_ADMIN_PASSWORD=<admin password> \
  ADMIN_URL=<global.adminUrl> PORTAL_URL=<global.portalUrl> \
  scripts/setup-keycloak-branding.sh
  ```

  Idempotent, and it only changes those three settings. Until it has run,
  Keycloak keeps sending its stock emails.

The email templates are generated, not hand-written: the layout and wording live
in `apps/api/src/mail/keycloak-email.ts` (same header and footer as the emails
`apps/api` sends). After changing them, run `pnpm --filter @wholo/api
keycloak:emails`, commit the result and rebuild the Keycloak image.
