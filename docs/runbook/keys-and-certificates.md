# Keys, certificates and expiry

> Part of the [live-ops runbook](README.md). Passwords and other secrets that never expire, and how to rotate them: [secrets.md](secrets.md).

Everything live depends on that is a signing key or a certificate, or that can lapse on a date. One section per type. **Expiry dates are not kept in this repo:** each section says how to read the date; record it in the password manager and put a reminder in a calendar.

## Expiry calendar

| Item | Lifetime | Renews itself? | What breaks when it lapses | Section |
|---|---|---|---|---|
| Visitor-facing TLS certificates | Short, set by Cloudflare | **Yes**, by Cloudflare | Browsers show a certificate warning on every host | [Visitor-facing TLS](#visitor-facing-tls) |
| Cloudflare Origin CA certificate (on the WAF) | Chosen when created; Cloudflare's default is 15 years | **No** | Cloudflare returns **526** for every host | [Cloudflare Origin CA certificate](#cloudflare-origin-ca-certificate) |
| k3s client and server certificates | **365 days** | Only when k3s **restarts** within 120 days of expiry | `kubectl` stops working; nodes and the control plane stop trusting each other | [k3s cluster certificates](#k3s-cluster-certificates) |
| k3s CA certificates | 10 years | **No** | The whole cluster's trust chain | [k3s cluster certificates](#k3s-cluster-certificates) |
| Operator's `kubeconfig` | Same as the k3s admin certificate it was copied with | **No** — re-copy it | Your `kubectl` and `helm` are refused; the cluster itself is fine | [k3s cluster certificates](#k3s-cluster-certificates) |
| Keycloak token-signing keys | No expiry | — | Nothing lapses | [Keycloak signing keys and sessions](#keycloak-signing-keys-and-sessions) |
| Xero connection (per distributor) | Lapses after **60 days** without a refresh | **Yes**, by the worker | That distributor's sync and invoice export stop until they reconnect | [Xero connection tokens](#xero-connection-tokens) |
| R2, InfluxDB and GHCR access tokens | Whatever was chosen when each was created | **No** | See each row | [Access tokens from other services](#access-tokens-from-other-services) |
| Domain registration and paid accounts | Usually yearly | Only if auto-renew is on and the card works | Everything, for the domain | [Accounts and renewals](#accounts-and-renewals) |
| Postgres, SMTP, Keycloak admin and client passwords; the encryption keys | No expiry | — | Nothing lapses | [secrets.md](secrets.md) |

## Visitor-facing TLS

The certificates browsers see are Cloudflare edge certificates. Cloudflare issues and renews them. There is nothing to do.

To confirm they are still being managed: Cloudflare → SSL/TLS → Edge Certificates shows the certificate for `<domain>` and `*.<domain>` as **Active**, with a managed renewal.

## Cloudflare Origin CA certificate

This certificate sits on the WAF appliance and secures the leg from Cloudflare to the WAF. **It does not renew itself.** Its lifetime was chosen when it was created; Cloudflare's default is 15 years.

- **Read the expiry date:** Cloudflare → SSL/TLS → Origin Server lists each origin certificate with its expiry. Record the date in the password manager entry.
- **When it lapses:** Cloudflare returns **526** for every host.
- **Replace it:** Cloudflare → SSL/TLS → Origin Server → Create Certificate (`*.<domain>`), then install the new certificate and key on the WAF. Setup detail: [setup/cluster.md](setup/cluster.md).

## k3s cluster certificates

k3s issues its own certificates so that the control plane, the nodes and `kubectl` can trust each other. They are separate from anything the apps use, and they are the certificates most likely to catch an untouched cluster out.

Per the k3s documentation ([Certificate management](https://docs.k3s.io/cli/certificate)):

- **Client and server certificates are valid for 365 days.** They are renewed automatically **only when k3s starts**, and only if they are expired or within 120 days of expiring (90 days on k3s releases before May 2025).
- **CA certificates are valid for 10 years** and are never renewed automatically.

So a cluster where k3s has not restarted for a year lets its certificates expire. Anything that restarts k3s in the last 120 days renews them: an upgrade ([maintenance.md → Upgrading k3s](maintenance.md#upgrading-k3s)), a node reboot, or a restart of the service.

**Check the dates** (on a node, as root):

```bash
k3s certificate check --output table
```

k3s also raises a Kubernetes warning event when a certificate is within the renewal window:

```bash
kubectl get events -A --field-selector reason=CertificateExpirationWarning
```

**Renew them.** If the check shows less than 120 days left, restarting k3s is enough. Do one node at a time, with the same care as a reboot ([maintenance.md → Rebooting or patching a node](maintenance.md#rebooting-or-patching-a-node)):

```bash
sudo systemctl restart k3s          # on a server node; agents use k3s-agent
k3s certificate check --output table
```

To force new certificates at any time, on the node:

```bash
sudo systemctl stop k3s
sudo k3s certificate rotate
sudo systemctl start k3s
```

**Your `kubeconfig` expires too.** It was copied from a node and carries a client certificate with the same 365-day life. When it lapses, `kubectl` and `helm` on your machine are refused even though the cluster is healthy. After the certificates have been renewed, copy the kubeconfig from the server node again (`/etc/rancher/k3s/k3s.yaml`), and put the node's address back in place of `127.0.0.1`.

How k3s was installed on these nodes is not documented yet ([maintenance.md](maintenance.md#upgrading-k3s)); confirm the service names above against the nodes the first time you do this, and correct this page if they differ.

## Keycloak signing keys and sessions

Keycloak signs every login token with the realm's own keys. The api and the admin and portal apps check tokens against Keycloak's published public keys (ADR-049).

- **The signing keys do not expire and do not rotate on their own.** See them in the Keycloak console → realm → Realm settings → Keys.
- **Replacing them signs everyone out.** If you add a new key with a higher priority and disable the old one, every existing token stops being accepted and all users log in again. Do it only if a key is compromised.
- **What does expire is each user's session,** by design. From the realm import: access tokens last 15 minutes and are refreshed silently; a session lasts 30 days, after which the user logs in again.

## Xero connection tokens

Each distributor connects their own Xero organisation. Stocdup stores an access token and a refresh token for that connection, encrypted.

- **Access tokens** last about 30 minutes and are refreshed automatically whenever they are needed.
- **A refresh token lapses if it is not used for 60 days.** The worker prevents this: once a day it refreshes any connection that has not been refreshed for 25 days.
- **When it lapses anyway** (the worker was down for weeks, or the distributor revoked access in Xero), that connection moves to an error state. The distributor is notified in the admin app and by email, and must reconnect Xero from the Integrations page. Sync and invoice export for that distributor fail until they do. Other distributors are unaffected.
- **The Xero client secret** (`api.xero.clientSecret`) identifies Stocdup's app to Xero. Check in the Xero developer portal whether the current secret has an expiry, and record it. If it stops being accepted, **every** distributor's refresh fails at once, and reconnecting does not help. The api and worker log `accounting.connection.invalid_client` at error level for it. Rotating it: [secrets.md](secrets.md).

## Access tokens from other services

Each of these is a token another service issued. Whether it expires depends on what was chosen when it was created, so **check each one once and record the date**.

| Token | Where to see its expiry | When it lapses |
|---|---|---|
| R2 media token (`api.r2.*`) | Cloudflare → R2 → Manage API tokens | Image uploads and signed image links fail |
| R2 backup token (`postgresql.backup.r2.*`) | Cloudflare → R2 → Manage API tokens | Backups fail and the backup alert fires |
| InfluxDB write token (`telegraf.influx.token`) | Ops-host InfluxDB → Load Data → API Tokens | A gap in metrics; nothing user-facing |
| GHCR pull token (`ghcr-pull` Secret) | GitHub → Settings → Developer settings → Personal access tokens | Only matters if the image packages are made private: new pods cannot pull images |

Replacing each one: [secrets.md](secrets.md).

## Accounts and renewals

Not secrets, but they lapse on a date and take the platform with them:

- **The domain registration.** If it lapses, every host stops resolving. Check the renewal date and that auto-renew is on with a working payment method, at the registrar.
- **Cloudflare, PurelyMail and any other paid account** in [secrets.md → Account logins](secrets.md#account-logins). A failed payment can suspend DNS, the edge, storage or email.

Record each renewal date alongside the login in the password manager.
