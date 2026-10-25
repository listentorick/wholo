#!/usr/bin/env bash
# Creates (or repairs) the `stocdup-ops` client and its sign-in flow on a
# running Keycloak realm (ADR-078). Run once per realm, local and live, after
# the realm exists. Idempotent: re-running converges both to the state below.
#
# The Ops app signs in through this client. Its flow uses Keycloak's levels of
# authentication: level 1 is the password, level 2 an authenticator-app code
# (OTP). The client asks for level 2, so every Ops token carries `acr: "2"` and
# `azp: "stocdup-ops"` — apps/api grants platform powers and support access
# only to such tokens. A user with no authenticator yet is asked to set one up.
# An existing admin-app session is not reused: the realm's own browser flow
# records no level, so Ops asks for the password again, then the code.
#
# Direct access grants (password grant) stay OFF on this client: that grant
# never runs the browser flow, so it would skip the authenticator.
#
# Until this has run, the client does not exist and nothing can sign in to Ops.
#
#   KEYCLOAK_URL=http://localhost:3080 KEYCLOAK_ADMIN=admin KEYCLOAK_ADMIN_PASSWORD=admin \
#   OPS_URL=http://localhost:3050 scripts/setup-keycloak-ops-client.sh
#
# Live: port-forward Keycloak (`kubectl port-forward svc/wholo-keycloak 3080:3080 -n wholo`),
# use the live admin credentials, and set OPS_URL to the live `global.opsUrl`.
set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:3080}"
REALM="${REALM:-wholo}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
OPS_URL="${OPS_URL:-http://localhost:3050}"
CLIENT_ID="stocdup-ops"
FLOW="stocdup-ops-browser"
# How long a level stays satisfied by an existing session, in seconds.
PASSWORD_MAX_AGE="${PASSWORD_MAX_AGE:-36000}"
OTP_MAX_AGE="${OTP_MAX_AGE:-3600}"

json() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }

echo "Obtaining Keycloak admin token from $KEYCLOAK_URL ..."
TOKEN=$(curl -sf \
  -d "client_id=admin-cli" -d "username=$ADMIN_USER" -d "password=$ADMIN_PASS" -d "grant_type=password" \
  "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" | json 'd["access_token"]') \
  || { echo "ERROR: could not get an admin token. Is Keycloak running at $KEYCLOAK_URL?" >&2; exit 1; }

api() { curl -sf -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" "$@"; }
ADMIN="$KEYCLOAK_URL/admin/realms/$REALM"

# ── Flow ─────────────────────────────────────────────────────────────────────
# Rebuilt from scratch each run so it always matches this file exactly. It is
# unbound from the client first (a bound flow cannot be deleted).
CLIENT_UUID=$(api "$ADMIN/clients?clientId=$CLIENT_ID" | json 'd[0]["id"] if d else ""')
if [[ -n "$CLIENT_UUID" ]]; then
  api "$ADMIN/clients/$CLIENT_UUID" | python3 -c "
import sys, json
c = json.load(sys.stdin); c['authenticationFlowBindingOverrides'] = {'browser': ''}
print(json.dumps(c))" | api -X PUT -d @- "$ADMIN/clients/$CLIENT_UUID" >/dev/null
fi
FLOW_ID=$(api "$ADMIN/authentication/flows" | json "next((f['id'] for f in d if f['alias']=='$FLOW'), '')")
if [[ -n "$FLOW_ID" ]]; then
  echo "Removing the old $FLOW flow ..."
  api -X DELETE "$ADMIN/authentication/flows/$FLOW_ID" >/dev/null
fi

echo "Creating the $FLOW flow ..."
api -X POST -d "{\"alias\":\"$FLOW\",\"description\":\"Ops app sign-in: password (level 1) then authenticator code (level 2). ADR-078.\",\"providerId\":\"basic-flow\",\"topLevel\":true,\"builtIn\":false}" \
  "$ADMIN/authentication/flows" >/dev/null

add_execution() { # flowAlias provider
  api -X POST -d "{\"provider\":\"$2\"}" "$ADMIN/authentication/flows/$1/executions/execution" >/dev/null
}
add_subflow() { # parentAlias alias
  api -X POST -d "{\"alias\":\"$2\",\"type\":\"basic-flow\",\"provider\":\"registration-page-form\"}" \
    "$ADMIN/authentication/flows/$1/executions/flow" >/dev/null
}
set_requirement() { # flowAlias displayNameOrAlias requirement
  local exec
  exec=$(api "$ADMIN/authentication/flows/$1/executions" | python3 -c "
import sys, json
for e in json.load(sys.stdin):
    if e.get('displayName') == '$2' or e.get('alias') == '$2':
        e['requirement'] = '$3'; print(json.dumps(e)); break")
  api -X PUT -d "$exec" "$ADMIN/authentication/flows/$1/executions" >/dev/null
}
configure_loa() { # flowAlias level maxAge
  local id
  id=$(api "$ADMIN/authentication/flows/$1/executions" | json "next(e['id'] for e in d if e.get('providerId')=='conditional-level-of-authentication')")
  api -X POST -d "{\"alias\":\"$1-level\",\"config\":{\"loa-condition-level\":\"$2\",\"loa-max-age\":\"$3\"}}" \
    "$ADMIN/authentication/executions/$id/config" >/dev/null
}

add_execution "$FLOW" "auth-cookie"
set_requirement "$FLOW" "Cookie" "ALTERNATIVE"
add_subflow "$FLOW" "$FLOW-forms"
set_requirement "$FLOW" "$FLOW-forms" "ALTERNATIVE"

add_subflow "$FLOW-forms" "$FLOW-password"
set_requirement "$FLOW-forms" "$FLOW-password" "CONDITIONAL"
add_execution "$FLOW-password" "conditional-level-of-authentication"
set_requirement "$FLOW-password" "Condition - Level of Authentication" "REQUIRED"
configure_loa "$FLOW-password" 1 "$PASSWORD_MAX_AGE"
add_execution "$FLOW-password" "auth-username-password-form"
set_requirement "$FLOW-password" "Username Password Form" "REQUIRED"

add_subflow "$FLOW-forms" "$FLOW-otp"
set_requirement "$FLOW-forms" "$FLOW-otp" "CONDITIONAL"
add_execution "$FLOW-otp" "conditional-level-of-authentication"
set_requirement "$FLOW-otp" "Condition - Level of Authentication" "REQUIRED"
configure_loa "$FLOW-otp" 2 "$OTP_MAX_AGE"
add_execution "$FLOW-otp" "auth-otp-form"
set_requirement "$FLOW-otp" "OTP Form" "REQUIRED"

FLOW_ID=$(api "$ADMIN/authentication/flows" | json "next(f['id'] for f in d if f['alias']=='$FLOW')")

# ── Client ───────────────────────────────────────────────────────────────────
DESIRED=$(python3 - <<PY
import json
print(json.dumps({
  "clientId": "$CLIENT_ID",
  "name": "Stocdup Ops",
  "description": "The Ops app for Stocdup operators (ADR-078). Requires an authenticator app.",
  "enabled": True, "publicClient": True,
  "standardFlowEnabled": True, "implicitFlowEnabled": False,
  "directAccessGrantsEnabled": False, "serviceAccountsEnabled": False,
  "baseUrl": "$OPS_URL",
  "redirectUris": ["$OPS_URL/*"],
  "webOrigins": ["$OPS_URL"],
  "attributes": {
    "pkce.code.challenge.method": "S256",
    "post.logout.redirect.uris": "$OPS_URL/*",
    # Name the flow's levels "1" and "2" (Keycloak validates the two settings
    # below against this map), so the token's acr is the level apps/api checks.
    "acr.loa.map": json.dumps({"1": 1, "2": 2}),
    # Ask for level 2 on every sign-in, and refuse anything less.
    "default.acr.values": "2",
    "minimum.acr.value": "2",
  },
  "authenticationFlowBindingOverrides": {"browser": "$FLOW_ID"},
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

# The `acr` claim comes from the realm's `acr` client scope; make sure it is a
# default scope of this client.
ACR_SCOPE=$(api "$ADMIN/client-scopes" | json "next((s['id'] for s in d if s['name']=='acr'), '')")
if [[ -z "$ACR_SCOPE" ]]; then
  echo "ERROR: the realm has no 'acr' client scope, so tokens would carry no acr claim." >&2; exit 1
fi
api -X PUT "$ADMIN/clients/$CLIENT_UUID/default-client-scopes/$ACR_SCOPE" >/dev/null

echo "OK: $CLIENT_ID uses the $FLOW flow (password, then authenticator code) at $OPS_URL."
