# Roll back a release

> Part of the [live-ops runbook](README.md). How the release went out: [deploy.md](deploy.md).

The questions to answer first are whether the bad release ran a database migration, and whether the previous code still works against that migrated schema.

```bash
git diff --stat <previous-sha>..<bad-sha> -- apps/api/prisma/migrations
```

| Migrations in the bad release? | Old code still works on the new schema? | Do this |
|---|---|---|
| No | — | [A. Re-pin the previous sha](#a-re-pin-the-previous-sha) |
| Yes | Yes (additive: new tables, nullable columns, new indexes) | [A. Re-pin the previous sha](#a-re-pin-the-previous-sha). The extra schema stays and is harmless |
| Yes | No (a drop, rename or type change the old code relies on) | Prefer to [fix forward](#b-fix-forward). If you can't, [C. Restore from backup](#c-restore-from-backup) |

To find the previous sha: `helm -n wholo history wholo`, then `helm -n wholo get values wholo --revision <n> | grep 'tag: sha-'`. You can also use the value you wrote down during deploy pre-flight.

## A. Re-pin the previous sha

This is the preferred path, because `values.live.yaml` stays the single source of truth.

1. In `helm/wholo/values.live.yaml`, set all six `tag: sha-…` lines back to the previous sha.
2. Run `pnpm helm:install:live`.
3. Watch the rollout and run the checks in [deploy.md → Verify](deploy.md#3-verify).

Prisma does **not** reverse migrations. The old api pod's `migrate` initContainer finds nothing new to apply and starts normally, whether or not the database is ahead of it.

### Why not `helm rollback`?

`helm -n wholo rollback wholo <revision>` works, and it is fine in an emergency if you can't edit the values file. It restores the previous revision's rendered values, but it leaves `values.live.yaml` still saying the bad sha. The next `helm:install:live` would silently re-deploy the bad release. If you use it, set the file to match straight afterwards.

## B. Fix forward

When the schema can't go back cleanly, the usually safer option is a new commit that fixes the bug, or restores whatever the old code needs (for example, add the dropped column back). Push it, wait for CI, and deploy it normally. Nothing is lost that way; a restore always loses data.

## C. Restore from backup

**This is a last resort, and it loses data.** Everything written since the backup is gone: up to 6h, or less if you took the manual pre-deploy backup that [deploy.md](deploy.md#1-pre-flight) asks for when migrations are involved. That includes Keycloak users and sessions, because the dump holds every database.

1. Re-pin the previous sha in `values.live.yaml`. Don't deploy yet.
2. Follow [postgres-restore.md → B. Restore into live](postgres-restore.md#b-restore-into-live-disaster-recovery--destructive). It stops every writer first. Use the newest backup taken **before** the bad deploy.
3. At its step 6 ("Bring everything back"), use the `pnpm helm:install:live` option. It brings every app back at the **previous** sha with the chart's replica counts.
4. Run [deploy.md → Verify](deploy.md#3-verify).

## Things a rollback does not undo

- **Keycloak realm settings.** The realm is imported on first boot only ([setup/keycloak.md](setup/keycloak.md)), so no deploy or rollback changes it. Revert realm changes by hand in the admin console.
- **Values baked into images at build time.** These are `NEXT_PUBLIC_KEYCLOAK_*` in the portal/admin images and `WWW_*` in the www image. Rolling back picks up whatever the old images were built with. Reverting a variable needs a rebuild ([setup/github.md](setup/github.md)).
- **Side effects that already happened.** Emails sent, invoices exported to Xero and Keycloak accounts disabled all stay done. Check the worker logs for what ran during the bad window.
- **Queued jobs.** Jobs enqueued by the bad release stay in Redis and are processed by the old worker. If their payload shape changed, expect those jobs to fail. Check the worker logs and [incidents/orders-email-stuck.md](incidents/orders-email-stuck.md).
