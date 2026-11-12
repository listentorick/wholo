# Stocdup help: scenarios

This folder is the source of the Stocdup help site (help.stocdup.com, `apps/help`,
ADR-080). The `writing-scenarios` and `scenario-docs` skills
(`.claude/skills/`) work from it; see their READMEs for how they work in general. This
file covers what's specific to this repo.

## Files

| File | What it is |
|---|---|
| `scenario-docs.yml` | The skills' config: app URLs, personas and sign-in, seed commands, the help's audiences and sections. Credentials live in `.env.docs` (git-ignored), never here. |
| `<id>.md` | One scenario per task. |
| `guides/` | Getting-started guides and the overview. |
| `_terms.md` | What every option and status the help names means, with its source in the code. |
| `_inventory.md` | Every task, grouped as the help's menus are. |
| `_seeding.md` | How to write a scenario's seed in this repo (`seeding.notes` in the config). |

Pages are written to `documentation/docs/<audience>/<section>/<id>.mdx`; the help site
builds that folder. A broken link or missing image fails its build. After any change,
rebuild and restart it: `docker build -t wholo/help:local -f apps/help/Dockerfile .`,
then `kubectl rollout restart deployment/wholo-help`.

## Starting data

Every scenario starts from the docs base, the Vine & Co distributor, plus its own seed
(`apps/api/scripts/docs-scenarios/`, see `_seeding.md`). Needs the Postgres
port-forward.

```bash
pnpm docs:base            # the base only
pnpm docs:seed <id>       # base + this scenario's data
pnpm docs:teardown        # back to the base
pnpm docs:clear           # remove all docs data (saves the Xero connection first)
pnpm docs:xero-data       # put Xero's Demo Company (UK) into a known state
```

The demo data (`pnpm db:seed`) uses the same slug and sign-in users; the docs commands
refuse to run while it's loaded.

## Xero scenarios

Vine & Co is connected to Xero's Demo Company (UK) from the saved connection
(`apps/api/scripts/docs-scenarios/xero-connection.json`). They need `wholo-worker`
running (it does the syncs) and internet access to Xero. Every reset and clear saves the
connection's newest token, so finish a batch with `pnpm docs:clear`. If Xero rejects the
saved connection, connect again once as James at https://admin.localhost:8443 on the
base, then run the teardown to save it.
