# Live environment — self-hosted k3s

Topology and rationale: [ADR-048](../adrs/ADR-048-live-environment-k3s.md).

- Cluster: 3 nodes — `k3s-00` (control-plane, schedulable), `k3s-01`, `k3s-02`. ~2 CPU / 4 GiB RAM / 22 GiB disk each.
- Storage: `local-path` only (node-local, ReclaimPolicy **Delete** — `helm uninstall` destroys data; PVC deletion is unrecoverable).
- Ingress: bundled Traefik; TLS via cert-manager + Let's Encrypt.
- Images: private GHCR packages, published by the `build-images` GitHub Actions workflow on every push to `master` (tags `sha-<shortsha>` + `latest`). Always deploy a pinned `sha-` tag.
- Live config: `helm/wholo/values.live.yaml` (gitignored) — copy from `values.live.example.yaml`.

## One-time GitHub setup

1. Repository → Settings → Secrets and variables → Actions → **Variables**:
   - `LIVE_KEYCLOAK_URL` = `https://auth.<domain>`
   - `LIVE_KEYCLOAK_REALM` = `wholo`

   These are baked into the portal/admin JS bundles at image build time, so
   they must be set **before** the images you intend to deploy are built.
2. Push to `master` (or run the `build-images` workflow manually) and confirm
   the four packages appear: `ghcr.io/listentorick/wholo/{api,portal-api,admin-api,keycloak}`.

## One-time cluster setup

1. **DNS** — A records for `portal.`, `admin.`, `api.`, `auth.<domain>` → one
   or more node IPs (ServiceLB exposes Traefik's 80/443 on every node).
   Verify: `dig +short portal.<domain>`.

2. **Namespace**
   ```bash
   kubectl create namespace wholo
   ```

3. **cert-manager**
   ```bash
   helm repo add jetstack https://charts.jetstack.io
   helm upgrade --install cert-manager jetstack/cert-manager \
     -n cert-manager --create-namespace --set crds.enabled=true
   ```

4. **ClusterIssuers**
   ```bash
   kubectl apply -f deploy/live/cluster-issuer.yaml
   ```
   While iterating, point the ingress annotation in values.live.yaml at
   `letsencrypt-staging` to avoid production rate limits; switch to
   `letsencrypt-prod` once certificates issue.

5. **GHCR pull secret** — create a GitHub PAT (classic) with `read:packages`:
   ```bash
   kubectl -n wholo create secret docker-registry ghcr-pull \
     --docker-server=ghcr.io \
     --docker-username=listentorick \
     --docker-password=<PAT>
   ```

6. **Values**
   ```bash
   cp helm/wholo/values.live.example.yaml helm/wholo/values.live.yaml
   ```
   Fill in the domain, strong passwords, R2 credentials, and a pinned
   `sha-` image tag from the latest `build-images` run.

## Deploy

```bash
helm upgrade --install wholo helm/wholo -n wholo -f helm/wholo/values.live.yaml
```

- Prisma migrations run automatically in the api pod's `migrate` initContainer.
- The demo seed job and Keycloak demo users are **disabled** in live.
- Upgrades: bump the `sha-` tags in values.live.yaml and rerun the same
  command. Postgres/Redis restart via `Recreate` (brief downtime by design);
  the app deployments roll with zero downtime.

## First-run bootstrap (no seed data)

1. Log into the Keycloak admin console at `https://auth.<domain>` with
   `keycloak.adminUser`/`adminPassword` from values.live.yaml.
2. In the `wholo` realm, create the first real user (email as username).
3. Create the distributor organisation and membership for that user via the
   API (or directly in the database) — the user's Keycloak `sub` is resolved
   to organisation/role through the `Membership` table on first login.

## Keycloak realm caveat

`--import-realm` only imports the realm on **first boot**. Later changes to
`keycloak.adminClientUrl` / `portalClientUrl` (redirect URIs) in values do not
propagate to an existing installation — change them in the Keycloak admin
console instead, or delete and re-import the realm.

## Email

Live still runs MailHog: no real email leaves the cluster. The UI is
ClusterIP-only (it has no auth):

```bash
kubectl -n wholo port-forward svc/wholo-mailhog 8025:8025
# open http://localhost:8025
```

Moving to a real SMTP provider later = set `api.smtp.{host,port,secure,from}`
and `keycloak.smtpHost` in values.live.yaml (credentials support in
`mail.service.ts` reads optional `SMTP_USER`/`SMTP_PASS`).

## Backups

A nightly CronJob (`postgresql.backup.enabled`) runs `pg_dumpall` (captures
both the `wholo` and `keycloak` databases) to the `wholo-pg-backups` PVC,
keeping the newest 7 dumps.

```bash
# manual backup now
kubectl -n wholo create job pg-backup-manual --from=cronjob/wholo-pg-backup

# list dumps
kubectl -n wholo run -it --rm ls-backups --image=postgres:16-alpine \
  --overrides='{"spec":{"containers":[{"name":"ls-backups","image":"postgres:16-alpine","command":["ls","-lh","/backups"],"volumeMounts":[{"name":"b","mountPath":"/backups"}]}],"volumes":[{"name":"b","persistentVolumeClaim":{"claimName":"wholo-pg-backups"}}]}}'

# restore (DESTRUCTIVE — restores every database from the dump)
gunzip -c wholo-<ts>.sql.gz | kubectl -n wholo exec -i deploy/wholo-postgresql -- psql -U wholo -d postgres
```

**Limitations**: dumps live on the same cluster's node-local storage. This
protects against application-level corruption and accidental deletion, not
node-disk loss. Copying dumps off-cluster (scp/rclone cron on a node, or a
push to R2) is a recommended follow-up.

## Verification checklist (after deploy)

1. `kubectl -n wholo get pods` — all Running/Ready.
2. `kubectl -n wholo get certificate` — Ready; then
   `curl -sI https://api.<domain>/api/v1/health` → 200 with a valid LE cert.
3. Browse `https://admin.<domain>` → redirected to `auth.<domain>` → log in →
   redirected back (proves baked NEXT_PUBLIC URL, realm redirect URIs, and
   JWKS validation agree). Repeat for the portal.
4. Trigger any email flow; confirm it lands in MailHog with `https://` links.
5. `kubectl -n wholo logs deploy/wholo-worker` — queue consumers up, exactly
   1 replica (ADR-047: the outbox relay must be the only publisher).
6. Run a manual backup job and check a dump appears.
