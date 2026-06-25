#!/usr/bin/env bash
# Creates the four new seed distributor admin users in an already-running local Keycloak instance,
# then updates the Wholo database with the real Keycloak UUIDs.
# Safe to re-run — 409 Conflict (user already exists) is treated as success.
set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
REALM="wholo"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
PG_POD="${PG_POD:-}"

# Auto-detect postgres pod if not provided
if [[ -z "$PG_POD" ]]; then
  PG_POD=$(kubectl get pods -l app.kubernetes.io/name=postgresql -o jsonpath='{.items[0].metadata.name}' 2>/dev/null \
    || kubectl get pods --no-headers | grep postgresql | awk '{print $1}' | head -1)
fi

echo "Using postgres pod: $PG_POD"

pg_exec() {
  kubectl exec -i "$PG_POD" -- psql -U wholo -d wholo -c "$1" -q
}

echo "Obtaining Keycloak admin token from $KEYCLOAK_URL ..."
TOKEN=$(curl -sf \
  -d "client_id=admin-cli" \
  -d "username=$ADMIN_USER" \
  -d "password=$ADMIN_PASS" \
  -d "grant_type=password" \
  "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [[ -z "$TOKEN" ]]; then
  echo "ERROR: Failed to obtain admin token. Is Keycloak running at $KEYCLOAK_URL?" >&2
  exit 1
fi

create_user_and_link() {
  local email="$1" first="$2" last="$3" password="$4"

  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$KEYCLOAK_URL/admin/realms/$REALM/users" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"username\": \"$email\",
      \"email\": \"$email\",
      \"firstName\": \"$first\",
      \"lastName\": \"$last\",
      \"enabled\": true,
      \"emailVerified\": true,
      \"credentials\": [{\"type\": \"password\", \"value\": \"$password\", \"temporary\": false}]
    }")

  if [[ "$HTTP_STATUS" == "201" ]]; then
    echo "  Created in Keycloak: $email"
  elif [[ "$HTTP_STATUS" == "409" ]]; then
    echo "  Already exists in Keycloak: $email"
  else
    echo "  ERROR: Unexpected HTTP $HTTP_STATUS for $email" >&2
    return
  fi

  # Fetch the real UUID Keycloak assigned (works for both new and existing users)
  KC_UUID=$(curl -s -H "Authorization: Bearer $TOKEN" \
    "$KEYCLOAK_URL/admin/realms/$REALM/users?email=$email" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if d else '')")

  if [[ -z "$KC_UUID" ]]; then
    echo "  ERROR: Could not fetch UUID for $email" >&2
    return
  fi

  pg_exec "UPDATE users SET \"keycloakId\" = '$KC_UUID' WHERE email = '$email';"
  echo "  Linked DB keycloakId = $KC_UUID for $email"
}

echo "Creating/linking seed distributor admin users in realm '$REALM' ..."
create_user_and_link "admin@rogersbakery.com"    "Roger"    "Baker" "password123"
create_user_and_link "admin@goo-cheese.co.uk"    "Goo"      "Admin" "password123"
create_user_and_link "admin@croftersfoods.co.uk" "Crofters" "Admin" "password123"
create_user_and_link "admin@cryerandstott.co.uk" "Cryer"    "Admin" "password123"

echo "Done."
