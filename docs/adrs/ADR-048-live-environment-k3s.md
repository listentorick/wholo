# ADR-048 — Live Environment on Self-Hosted k3s

**Status**: Accepted
**Date**: 2026-07-04
**Deciders**: Rick Walsh

---

## Context

Wholo needs its first live (non-local) environment. Available infrastructure is
a small self-hosted k3s cluster: 3 nodes (`k3s-00` control-plane + 2 workers),
each ~2 CPU / 4 GiB RAM / 22 GiB disk, with `local-path` as the only
StorageClass (node-local, non-replicated, ReclaimPolicy Delete). ADR-014 chose
Docker/K8s/Helm and recommended managed Kubernetes; ADR-025 made all services
`type: LoadBalancer` for Docker Desktop local dev and explicitly deferred
"ClusterIP + ingress" to a staging/production environment.

Live is an **additional** environment: the local Docker Desktop flow must keep
working unchanged.

## Decision

1. **Self-hosted k3s is accepted as the live platform** at current scale,
   deviating from ADR-014's managed-Kubernetes recommendation. Revisit when a
   cloud target is chosen (this also re-opens ADR-047's managed pub/sub
   trigger).
2. **Image pipeline**: GitHub Actions (`.github/workflows/build-images.yml`)
   builds the four chart images (`api`, `portal-api`, `admin-api`, `keycloak`)
   on every push to `master` and publishes them as **private** GHCR packages
   (`ghcr.io/listentorick/wholo/*`), tagged `sha-<shortsha>` (immutable,
   deployed) and `latest` (convenience). The cluster pulls with a
   `read:packages` PAT secret.
3. **Environment-specific BFF images**: `NEXT_PUBLIC_KEYCLOAK_*` is baked into
   the Next.js bundles at image build time (consequence of the BFF/frontend
   colocation in ADR-044/045), so published portal/admin images are built with
   the live auth URL and are not reusable for other environments. Local dev
   keeps building its own `:local` images. A second remote environment would
   require a build matrix extension or a move to runtime config.
4. **Exposure**: one Ingress (opt-in via `ingress.enabled`) on k3s's bundled
   Traefik, with cert-manager + Let's Encrypt (`deploy/live/cluster-issuer.yaml`)
   terminating TLS for `portal./admin./api./auth.<domain>`. All services become
   ClusterIP in live, fulfilling ADR-025's forward reference. Keycloak runs in
   production mode (`start`, full-URL `KC_HOSTNAME`, `KC_PROXY_HEADERS=xforwarded`).
5. **Durability posture**: single-replica Postgres/Redis on `local-path` with
   `Recreate` strategies (RWO node-local volumes cannot roll), plus a nightly
   `pg_dumpall` CronJob to a dedicated PVC. This is explicitly not HA: pods are
   pinned to whichever node holds their volume, and a lost node disk loses the
   data since the last dump. Accepted for launch scale; off-cluster dump
   copying is the first follow-up, replicated storage or managed Postgres the
   eventual answer.
6. **Config/secrets**: a gitignored `values.live.yaml` (from committed
   `values.live.example.yaml`) passed at deploy time — same pattern as
   `values.local.yaml`. Demo data is fenced out of live: the Prisma seed job
   (`api.seedJob.enabled`) and the Keycloak realm demo users
   (`keycloak.seedUsers`) are both disabled there.
7. **Email**: MailHog is retained in live for now (ClusterIP, port-forward
   access only); no real email leaves the cluster. SMTP settings are
   values-driven for a later provider switch.

## Consequences

- Deploying live is `helm upgrade --install wholo helm/wholo -n wholo -f
  helm/wholo/values.live.yaml` with a pinned `sha-` tag — no build steps on the
  cluster. Runbook: `docs/deployment/live-k3s.md`.
- Local rendering is unchanged by default; every live behaviour is an opt-in
  value.
- Keycloak realm import happens only on first boot; later redirect-URI changes
  are admin-console operations, not Helm upgrades.
- The worker stays at 1 replica in every environment (ADR-047).
- ADR-014's scheduler service remains unimplemented; nothing in this ADR
  depends on it.

## Revisit Triggers

- A second remote environment (staging) — forces the BFF build-args question
  (matrix builds vs runtime config).
- Real customers depending on the data — accelerate off-cluster backups and
  reconsider managed Postgres.
- Real email needed — replace MailHog with a provider via the existing SMTP
  values.
