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
# Live: port-forward Keycloak to a free port (local Keycloak already has 3080):
# `kubectl port-forward svc/wholo-keycloak 18080:8080 -n wholo`, set KEYCLOAK_URL=http://localhost:18080,
# use the live admin credentials, and set OPS_URL to the live `global.opsUrl`.
set -Eeuo pipefail
# Most calls run inside $(...) or a pipe; make a failure there stop the script too.
shopt -s inherit_errexit
# curl -sf hides the response, so say where it stopped rather than exit silently.
trap 'echo "ERROR: stopped at line $LINENO: $BASH_COMMAND" >&2' ERR

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

# JSON is read with Node (already needed for pnpm), so this runs from Git Bash
# on Windows as well as WSL. `json EXPR` prints EXPR evaluated with `d` = stdin.
json() { node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const d=JSON.parse(s);const v=($1);process.stdout.write(v==null?'':typeof v==='string'?v:JSON.stringify(v))})"; }

# The admin token lives in a file, not a variable: most api calls run in a
# subshell, and a token refreshed there must be seen by every later call.
TOKEN_FILE=$(mktemp)
trap 'rm -f "$TOKEN_FILE"' EXIT
new_token() {
  local token
  token=$(curl -sf \
    -d "client_id=admin-cli" -d "username=$ADMIN_USER" -d "password=$ADMIN_PASS" -d "grant_type=password" \
    "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" | json 'd.access_token' 2>/dev/null) && [[ -n "$token" ]] \
    || { echo "ERROR: could not get an admin token. Is Keycloak running at $KEYCLOAK_URL?" >&2; return 1; }
  printf '%s' "$token" >"$TOKEN_FILE"
}
echo "Obtaining Keycloak admin token from $KEYCLOAK_URL ..."
new_token

# `api CURL_ARGS... URL` logs each call with its status. On a 401 (the admin
# token lasts 60 seconds, and is occasionally refused sooner) it gets a new
# token and tries once more; any other error prints Keycloak's reply and stops.
api() {
  local args=() method=GET out code attempt
  # A body read from stdin (`-d @-`) is read once here so a retry can resend it.
  for a in "$@"; do
    if [[ "$a" == "@-" ]]; then args+=("$(cat)"); else args+=("$a"); fi
  done
  for ((i = 0; i < ${#args[@]}; i++)); do
    case "${args[i]}" in -X) method=${args[i+1]} ;; -d) [[ $method == GET ]] && method=POST ;; esac
  done
  for attempt in 1 2; do
    # A connection failure (Keycloak gone, port-forward dropped) is an error,
    # not an empty success: curl exits non-zero and reports status 000.
    if ! out=$(curl -sS -w '\n%{http_code}' -H "Authorization: Bearer $(<"$TOKEN_FILE")" -H "Content-Type: application/json" "${args[@]}"); then
      echo "ERROR: could not reach Keycloak for $method ${args[-1]}" >&2; return 1
    fi
    code=${out##*$'\n'}; out=${out%$'\n'*}
    echo "  $method ${args[-1]#"$KEYCLOAK_URL"} → $code" >&2
    if [[ $code == 401 && $attempt == 1 ]]; then echo "  (token refused, getting a new one)" >&2; new_token || return 1; continue; fi
    break
  done
  if [[ ! $code =~ ^[0-9]{3}$ ]] || (( code == 0 || code >= 400 )); then
    echo "ERROR: HTTP $code from $method ${args[-1]}" >&2; echo "$out" >&2; return 1
  fi
  printf '%s' "$out"
}
ADMIN="$KEYCLOAK_URL/admin/realms/$REALM"

# ── Flow ─────────────────────────────────────────────────────────────────────
# Rebuilt from scratch each run so it always matches this file exactly. It is
# unbound from the client first (a bound flow cannot be deleted).
CLIENT_UUID=$(api "$ADMIN/clients?clientId=$CLIENT_ID" | json 'd.length ? d[0].id : ""')
if [[ -n "$CLIENT_UUID" ]]; then
  api "$ADMIN/clients/$CLIENT_UUID" | json '({ ...d, authenticationFlowBindingOverrides: { browser: "" } })' \
    | api -X PUT -d @- "$ADMIN/clients/$CLIENT_UUID" >/dev/null
fi
FLOW_ID=$(api "$ADMIN/authentication/flows" | json "(d.find((f) => f.alias === '$FLOW') || {}).id || ''")
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
  exec=$(api "$ADMIN/authentication/flows/$1/executions" \
    | json "({ ...d.find((e) => e.displayName === '$2' || e.alias === '$2'), requirement: '$3' })")
  api -X PUT -d "$exec" "$ADMIN/authentication/flows/$1/executions" >/dev/null
}
configure_loa() { # flowAlias level maxAge
  local id
  id=$(api "$ADMIN/authentication/flows/$1/executions" | json "d.find((e) => e.providerId === 'conditional-level-of-authentication').id")
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

FLOW_ID=$(api "$ADMIN/authentication/flows" | json "d.find((f) => f.alias === '$FLOW').id")

# ── Client ───────────────────────────────────────────────────────────────────
DESIRED=$(CLIENT_ID="$CLIENT_ID" OPS_URL="$OPS_URL" FLOW_ID="$FLOW_ID" node -e '
const { CLIENT_ID, OPS_URL, FLOW_ID } = process.env;
process.stdout.write(JSON.stringify({
  clientId: CLIENT_ID,
  name: "Stocdup Ops",
  description: "The Ops app for Stocdup operators (ADR-078). Requires an authenticator app.",
  enabled: true, publicClient: true,
  standardFlowEnabled: true, implicitFlowEnabled: false,
  directAccessGrantsEnabled: false, serviceAccountsEnabled: false,
  baseUrl: OPS_URL,
  redirectUris: [`${OPS_URL}/*`],
  webOrigins: [OPS_URL],
  attributes: {
    "pkce.code.challenge.method": "S256",
    "post.logout.redirect.uris": `${OPS_URL}/*`,
    // Name the flow levels "1" and "2" (Keycloak validates the two settings
    // below against this map), so the token acr is the level apps/api checks.
    "acr.loa.map": JSON.stringify({ 1: 1, 2: 2 }),
    // Ask for level 2 on every sign-in, and refuse anything less.
    "default.acr.values": "2",
    "minimum.acr.value": "2",
  },
  authenticationFlowBindingOverrides: { browser: FLOW_ID },
}));
')

CLIENT_UUID=$(api "$ADMIN/clients?clientId=$CLIENT_ID" | json 'd.length ? d[0].id : ""')
if [[ -z "$CLIENT_UUID" ]]; then
  echo "Creating client $CLIENT_ID ..."
  api -X POST -d "$DESIRED" "$ADMIN/clients" >/dev/null
  CLIENT_UUID=$(api "$ADMIN/clients?clientId=$CLIENT_ID" | json 'd[0].id')
else
  echo "Client $CLIENT_ID exists — converging it ..."
  api -X PUT -d "$DESIRED" "$ADMIN/clients/$CLIENT_UUID" >/dev/null
fi

# The `acr` claim comes from the realm's `acr` client scope; make sure it is a
# default scope of this client.
ACR_SCOPE=$(api "$ADMIN/client-scopes" | json "(d.find((s) => s.name === 'acr') || {}).id || ''")
if [[ -z "$ACR_SCOPE" ]]; then
  echo "ERROR: the realm has no 'acr' client scope, so tokens would carry no acr claim." >&2; exit 1
fi
api -X PUT "$ADMIN/clients/$CLIENT_UUID/default-client-scopes/$ACR_SCOPE" >/dev/null

echo "OK: $CLIENT_ID uses the $FLOW flow (password, then authenticator code) at $OPS_URL."
