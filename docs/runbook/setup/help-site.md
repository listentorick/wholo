# Help site setup

> Part of the [live-ops runbook](../README.md). One-time setup — do this once per environment; day-to-day operation is in the runbook's other pages.

`apps/help` (`help.<domain>`) is a static Docusaurus site served by nginx: no BFF, no
database, no secret, no outgoing calls. Its pages come from `documentation/docs` and are
baked into the image at build time ([ADR-080](../../adrs/ADR-080-help-site.md)).

1. **DNS.** In Cloudflare, add a **Proxied** A record for `help` → the WAF's public IP,
   the same as `www` ([cluster.md](cluster.md)). The existing `*.<domain>` edge and Origin
   CA certificates already cover it.
2. **values.live.yaml** needs a `help:` block and the host (see
   `values.live.example.yaml`):
   - `help.image.tag`: bump the `sha-` tag alongside the others on each promote.
   - `ingress.hosts.help: help.<domain>`, which renders the Traefik IngressRoute.
3. **Site URL.** CI bakes `https://help.stocdup.com` into the image. To use another
   domain, set the repository variable `LIVE_HELP_SITE_URL` ([github.md](github.md)).
4. Deploy as usual ([deploy.md](../deploy.md)). Check `https://help.<domain>/` loads and
   `https://help.<domain>/healthz` returns `ok`.

A docs change reaches live like a code change: push to `master`, bump the `help` tag,
run Helm. A page with a broken link or a missing screenshot fails the `help` image build
in CI, so it never ships.
