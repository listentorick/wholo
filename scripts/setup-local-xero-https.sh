#!/usr/bin/env bash
# Sets up local HTTPS for the admin app so a real Xero developer app can be
# tested (Xero requires an HTTPS redirect URI, even for local dev). Routes
# only admin.localhost through the Traefik ingress already running in this
# Docker Desktop cluster — apps/api is never given a public route.
#
# Safe to re-run:
#  - cert/key are only (re)generated if missing
#  - the k8s TLS secret is applied idempotently (kubectl apply, not create)
#  - the Keycloak wholo-admin client update is read-merge-write: it adds the
#    admin.localhost:8443 origin alongside whatever is already registered
#    (e.g. http://localhost:3020) rather than replacing it.
set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
REALM="wholo"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
NEW_ORIGIN="${NEW_ORIGIN:-https://admin.localhost:8443}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="$SCRIPT_DIR/../helm/wholo/.local-certs"
mkdir -p "$CERT_DIR"
CERT_FILE="$CERT_DIR/admin-localhost-cert.pem"
KEY_FILE="$CERT_DIR/admin-localhost-key.pem"

echo "== 1. Self-signed cert for admin.localhost =="
if [[ -f "$CERT_FILE" && -f "$KEY_FILE" ]]; then
  echo "  Cert already exists at $CERT_FILE — leaving it in place."
else
  openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
    -keyout "$KEY_FILE" -out "$CERT_FILE" \
    -subj "/CN=admin.localhost" -addext "subjectAltName=DNS:admin.localhost"
  echo "  Generated $CERT_FILE / $KEY_FILE"
fi

echo "== 2. k8s TLS secret (wholo-tls) =="
kubectl create secret tls wholo-tls --cert="$CERT_FILE" --key="$KEY_FILE" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "== 3. Keycloak wholo-admin client: add $NEW_ORIGIN (read-merge-write) =="
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

CLIENT_UUID=$(curl -sf -H "Authorization: Bearer $TOKEN" \
  "$KEYCLOAK_URL/admin/realms/$REALM/clients?clientId=wholo-admin" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")

if [[ -z "$CLIENT_UUID" ]]; then
  echo "ERROR: Could not find the wholo-admin client in realm $REALM" >&2
  exit 1
fi

CLIENT_REPR=$(curl -sf -H "Authorization: Bearer $TOKEN" \
  "$KEYCLOAK_URL/admin/realms/$REALM/clients/$CLIENT_UUID")

MERGED=$(NEW_ORIGIN="$NEW_ORIGIN" python3 -c "
import json, os, sys

client = json.loads(sys.stdin.read())
origin = os.environ['NEW_ORIGIN']
redirect_uri = origin + '/*'

redirect_uris = client.setdefault('redirectUris', [])
if redirect_uri not in redirect_uris:
    redirect_uris.append(redirect_uri)

web_origins = client.setdefault('webOrigins', [])
if origin not in web_origins:
    web_origins.append(origin)

attrs = client.setdefault('attributes', {})
existing_logout = attrs.get('post.logout.redirect.uris', '')
logout_entries = [e for e in existing_logout.split('##') if e]
if redirect_uri not in logout_entries:
    logout_entries.append(redirect_uri)
attrs['post.logout.redirect.uris'] = '##'.join(logout_entries)

print(json.dumps(client))
" <<< "$CLIENT_REPR")

curl -sf -X PUT "$KEYCLOAK_URL/admin/realms/$REALM/clients/$CLIENT_UUID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$MERGED"

echo "  Updated. Verifying ..."
VERIFY=$(curl -sf -H "Authorization: Bearer $TOKEN" \
  "$KEYCLOAK_URL/admin/realms/$REALM/clients/$CLIENT_UUID")

python3 -c "
import json, sys
client = json.loads(sys.stdin.read())
print('  redirectUris:', client.get('redirectUris'))
print('  webOrigins:', client.get('webOrigins'))
print('  post.logout.redirect.uris:', client.get('attributes', {}).get('post.logout.redirect.uris'))
" <<< "$VERIFY"

echo "Done. Keep 'kubectl port-forward svc/traefik -n traefik 8443:443' running, then browse https://admin.localhost:8443"
