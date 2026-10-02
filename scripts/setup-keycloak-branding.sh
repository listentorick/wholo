#!/usr/bin/env bash
# Applies the Stocdup branding settings to an ALREADY-RUNNING Keycloak realm:
#   - the realm's email theme (`wholo`), so Keycloak's own emails (verify email,
#     password reset, security notices) use the Stocdup layout;
#   - a base URL on the `wholo-admin` and `wholo-portal` clients, which is what
#     the themed error page links to ("Back to Stocdup").
# Fresh realms get both from the Helm realm import
# (helm/wholo/templates/keycloak/realm-secret.yaml) — but import only runs on
# first boot, so any existing local/live realm needs this once. The Keycloak
# image must already contain the theme (apps/keycloak/themes/wholo/email).
#
# Idempotent: safe to re-run. Each update is read-merge-write, so nothing else
# on the realm or the clients is touched.
#
#   KEYCLOAK_URL=http://localhost:3080 KEYCLOAK_ADMIN=admin KEYCLOAK_ADMIN_PASSWORD=admin \
#   ADMIN_URL=http://localhost:3020 PORTAL_URL=http://localhost:3010 \
#   scripts/setup-keycloak-branding.sh
#
# Live: point KEYCLOAK_URL at the Keycloak admin endpoint (e.g. via
# `kubectl port-forward svc/wholo-keycloak 3080:8080 -n wholo`), use the live
# admin credentials and realm, and set ADMIN_URL / PORTAL_URL to global.adminUrl
# / global.portalUrl from your values file.
set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:3080}"
REALM="${REALM:-wholo}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
ADMIN_URL="${ADMIN_URL:-http://localhost:3020}"
PORTAL_URL="${PORTAL_URL:-http://localhost:3010}"
EMAIL_THEME="wholo"

json() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }
# Read a JSON object on stdin, set one top-level key, print the result.
with_key() { python3 -c "import sys,json; d=json.load(sys.stdin); d[sys.argv[1]]=sys.argv[2]; print(json.dumps(d))" "$1" "$2"; }

echo "Obtaining Keycloak admin token from $KEYCLOAK_URL ..."
TOKEN=$(curl -sf \
  -d "client_id=admin-cli" -d "username=$ADMIN_USER" -d "password=$ADMIN_PASS" -d "grant_type=password" \
  "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" | json 'd["access_token"]') \
  || { echo "ERROR: could not get an admin token. Is Keycloak running at $KEYCLOAK_URL?" >&2; exit 1; }

api() { curl -sf -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" "$@"; }
ADMIN="$KEYCLOAK_URL/admin/realms/$REALM"

echo "Setting the realm email theme to '$EMAIL_THEME' ..."
api "$ADMIN" | with_key emailTheme "$EMAIL_THEME" | api -X PUT -d @- "$ADMIN" >/dev/null

set_base_url() {
  local client_id="$1" base_url="$2" uuid
  uuid=$(api "$ADMIN/clients?clientId=$client_id" | json 'd[0]["id"] if d else ""')
  [[ -n "$uuid" ]] || { echo "ERROR: client $client_id not found in realm $REALM." >&2; exit 1; }
  echo "Setting $client_id base URL to $base_url ..."
  api "$ADMIN/clients/$uuid" | with_key baseUrl "$base_url" | api -X PUT -d @- "$ADMIN/clients/$uuid" >/dev/null
}
set_base_url wholo-admin "$ADMIN_URL"
set_base_url wholo-portal "$PORTAL_URL"

echo "Verifying ..."
[[ "$(api "$ADMIN" | json 'd.get("emailTheme")')" == "$EMAIL_THEME" ]] \
  || { echo "ERROR: the realm email theme was not applied." >&2; exit 1; }
for pair in "wholo-admin=$ADMIN_URL" "wholo-portal=$PORTAL_URL"; do
  [[ "$(api "$ADMIN/clients?clientId=${pair%%=*}" | json 'd[0].get("baseUrl")')" == "${pair#*=}" ]] \
    || { echo "ERROR: ${pair%%=*} base URL was not applied." >&2; exit 1; }
done
echo "OK: email theme and client base URLs are set."
