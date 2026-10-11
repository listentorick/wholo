#!/usr/bin/env bash
# Generates an Ed25519 key pair for delivery-link tokens (ADR-076) and prints
# the two values in the form the apps and the Helm chart expect: base64 of the
# DER encoding, on one line each.
#
#   scripts/generate-delivery-token-keys.sh
#
# Nothing is written to disk. The PRIVATE key is a secret: put it straight
# into the values file / password manager and clear your terminal. The public
# key is not secret. See docs/runbook/keys-and-certificates.md.
set -euo pipefail

command -v openssl >/dev/null || { echo "openssl is required" >&2; exit 1; }

private_pem="$(openssl genpkey -algorithm ed25519)"
private_key="$(printf '%s\n' "$private_pem" | openssl pkey -outform DER | base64 | tr -d '\n')"
public_key="$(printf '%s\n' "$private_pem" | openssl pkey -pubout -outform DER | base64 | tr -d '\n')"

cat <<OUT
deliveryToken:
  # SECRET — only the Central API and worker ever hold this.
  privateKey: "${private_key}"
  # Not secret. Newest first; keep the previous key here while links signed
  # with it are still out for delivery.
  publicKeys:
    - "${public_key}"
OUT
