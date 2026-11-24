# Pinned to an exact image tag (never a floating minor like `26.8`) so the
# bundled Java runtime is known. 26.8.2-3 ships Red Hat OpenJDK 21.0.13.1,
# which fixes CVE-2026-114938 ("Java4Shell", pre-auth RCE via the JDK's
# Base64 decoder). Do not go below 26.8.2-3.
FROM quay.io/keycloak/keycloak:26.8.2-3
COPY themes/wholo /opt/keycloak/themes/wholo
