# Login is broken

> Part of the [live-ops runbook](../README.md) → [incidents](README.md). Setup and realm caveats: [setup/keycloak.md](../setup/keycloak.md). The login flow: [url-map.md → Login flow](../url-map.md#login-flow-where-the-subdomains-interlock).

Keycloak (`wholo-keycloak`, `auth.<domain>`) is the only identity provider. The browser apps redirect there to log in. The BFFs (`wholo-portal-api`, `wholo-admin-api`) validate the returned JWT against Keycloak's JWKS, fetched internally from `http://wholo-keycloak:8080/realms/<realm>/protocol/openid-connect/certs` (ADR-049). The Keycloak admin console is at `https://auth.<domain>/admin/`.

## `auth.<domain>` itself is down

This shows as a Cloudflare 5xx, a Traefik 502, or the login page never loading.

```bash
kubectl -n wholo get pods -l app=wholo-keycloak
kubectl -n wholo logs deploy/wholo-keycloak --since=15m | tail -80
kubectl -n wholo logs deploy/wholo-keycloak -c db-init       # if stuck in Init
```

- **The logs show it can't reach the database:** it's Postgres ([database.md](database.md)), or `KC_DB_PASSWORD` no longer matches the database role after a password change ([secrets.md](../secrets.md)).
- **It is slow to start:** Keycloak takes a minute or two to boot, so wait before digging deeper.
- **Other layers:** see [site-down.md](site-down.md).

## "Realm does not exist" / 404 on the login page

The realm name baked into the portal and admin JS bundles (the GitHub variable `LIVE_KEYCLOAK_REALM`) doesn't match `keycloak.realm` in `values.live.yaml`. That happens when someone changed one of them and not the other, or deployed images built before the variable changed.

**Fix:** make them equal, then rebuild the images ([setup/github.md](../setup/github.md)) and deploy the new sha. Changing Helm values alone can't fix a baked bundle.

## "Invalid parameter: redirect_uri", or a redirect loop

The realm's client redirect URIs (`wholo-portal` and `wholo-admin`, set from `global.portalUrl` / `global.adminUrl`) don't match the URL the app is served from. They are written only at the **first-boot realm import**, so changing `global.*Url` later doesn't update them.

**Fix:** in the admin console, go to realm → Clients → `wholo-portal` or `wholo-admin`, and correct **Valid redirect URIs** (`https://portal.<domain>/*`), **Web origins** and **Valid post logout redirect URIs**.

## Keycloak login works, but the app then shows 401 or "not authorised"

The BFF rejected the token.

```bash
kubectl -n wholo logs deploy/wholo-admin-api --since=15m | grep -i -E 'jwt|jwks|unauthori|401' | tail -20
```

- **JWKS fetch errors:** the BFF can't reach `wholo-keycloak:8080`. Check the Keycloak pod, and that `KEYCLOAK_REALM` in the BFF's ConfigMap matches the realm.
- **The token is valid, but the user has no access:** Stocdup resolves organisation and role from the `memberships` table, not from the token. A brand-new real user needs a membership ([setup/keycloak.md → First real user](../setup/keycloak.md#first-real-user-no-seed-data)). A removed staff member has theirs revoked on purpose.

## Password reset or verification emails don't arrive

Keycloak sends these itself, using the realm's own SMTP settings (realm → Realm settings → Email), **not** the api's SMTP.

- Use the **Test connection** button on that page.
- Check the credentials against PurelyMail ([secrets.md](../secrets.md): Keycloak SMTP is first-boot only, so change it in the console).
- Check Keycloak's logs for `EmailException`.

## A removed staff member can still log in

Removing someone blocks them in Stocdup straight away. The worker then disables their Keycloak login in the background, through the `keycloak-users` queue and the `wholo-api-admin` service-account client (ADR-067).

```bash
kubectl -n wholo logs deploy/wholo-worker --since=1h | grep -i -E 'keycloak|KEYCLOAK_ADMIN_CLIENT_SECRET' | tail -20
```

- **Client or secret errors:** the client is missing on this realm, or its secret doesn't match `keycloak.apiAdminClientSecret`. See [setup/keycloak.md → Service-account client](../setup/keycloak.md#keycloak-service-account-client-team-removal).
- **Immediate lockout:** disable the user by hand in the console (Users → the user → Enabled off) while you fix the queue.

## One user can't log in

- Look them up in the admin console (Users): are they enabled, is their email verified, are there required actions pending?
- Brute-force lockout isn't enabled in the realm import (`bruteForceProtected` is unset). If someone has since turned it on in the console, a locked user's page shows the lock and a button to clear it.
- If they log in fine but see nothing, it's their Stocdup membership, not Keycloak.
