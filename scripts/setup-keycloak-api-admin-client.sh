#!/usr/bin/env bash
# Creates (or repairs) the `wholo-api-admin` service-account client on an
# ALREADY-RUNNING Keycloak realm. Fresh realms get it from the Helm realm
# import (helm/wholo/templates/keycloak/realm-secret.yaml) — but import only
# runs on first boot, so any existing local/live realm needs this once.
#
# The worker uses this client (client-credentials) to disable a removed team
# member's Keycloak login (ADR-067). It holds ONLY realm-management:manage-users.
#
# Idempotent: safe to re-run; it converges the client to the desired state and
# re-applies the secret you give it.
#
#   CLIENT_SECRET='<same value as keycloak.apiAdminClientSecret in your values file>' \
#   KEYCLOAK_URL=http://localhost:3080 KEYCLOAK_ADMIN=admin KEYCLOAK_ADMIN_PASSWORD=admin \
#   scripts/setup-keycloak-api-admin-client.sh
#
# Live: point KEYCLOAK_URL at the Keycloak admin endpoint (e.g. via
# `kubectl port-forward svc/wholo-keycloak 3080:3080 -n wholo`) and use the live
# admin credentials + the live apiAdminClientSecret.
set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:3080}"
REALM="${REALM:-wholo}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
CLIENT_ID="wholo-api-admin"
: "${CLIENT_SECRET:?Set CLIENT_SECRET to the value of keycloak.apiAdminClientSecret}"

json() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }

echo "Obtaining Keycloak admin token from $KEYCLOAK_URL ..."
TOKEN=$(curl -sf \
  -d "client_id=admin-cli" -d "username=$ADMIN_USER" -d "password=$ADMIN_PASS" -d "grant_type=password" \
  "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" | json 'd["access_token"]') \
  || { echo "ERROR: could not get an admin token. Is Keycloak running at $KEYCLOAK_URL?" >&2; exit 1; }

api() { curl -sf -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" "$@"; }
ADMIN="$KEYCLOAK_URL/admin/realms/$REALM"

DESIRED=$(python3 - <<PY
import json
print(json.dumps({
  "clientId": "$CLIENT_ID",
  "name": "Wholo API (user administration)",
  "description": "Service account used by the worker to disable removed team members' logins. Holds only realm-management manage-users.",
  "enabled": True, "publicClient": False, "secret": "$CLIENT_SECRET",
  "serviceAccountsEnabled": True, "standardFlowEnabled": False,
  "implicitFlowEnabled": False, "directAccessGrantsEnabled": False,
}))
PY
)

CLIENT_UUID=$(api "$ADMIN/clients?clientId=$CLIENT_ID" | json 'd[0]["id"] if d else ""')
if [[ -z "$CLIENT_UUID" ]]; then
  echo "Creating client $CLIENT_ID ..."
  api -X POST -d "$DESIRED" "$ADMIN/clients" >/dev/null
  CLIENT_UUID=$(api "$ADMIN/clients?clientId=$CLIENT_ID" | json 'd[0]["id"]')
else
  echo "Client $CLIENT_ID exists — converging it ..."
  api -X PUT -d "$DESIRED" "$ADMIN/clients/$CLIENT_UUID" >/dev/null
fi

SA_USER_ID=$(api "$ADMIN/clients/$CLIENT_UUID/service-account-user" | json 'd["id"]')
RM_UUID=$(api "$ADMIN/clients?clientId=realm-management" | json 'd[0]["id"]')
ROLE=$(api "$ADMIN/clients/$RM_UUID/roles/manage-users")

echo "Granting realm-management:manage-users to the service account ..."
api -X POST -d "[$ROLE]" "$ADMIN/users/$SA_USER_ID/role-mappings/clients/$RM_UUID" >/dev/null

echo "Verifying the client can authenticate ..."
curl -sf -d "grant_type=client_credentials" -d "client_id=$CLIENT_ID" -d "client_secret=$CLIENT_SECRET" \
  "$KEYCLOAK_URL/realms/$REALM/protocol/openid-connect/token" >/dev/null \
  && echo "OK: $CLIENT_ID can obtain a token." \
  || { echo "ERROR: the client could not obtain a token with the given secret." >&2; exit 1; }
