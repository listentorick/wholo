# Writing a docs seed in this repo

The project's seeding notes, named by `seeding.notes` in `scenario-docs.yml` (the leading `_` keeps it from being run as a scenario). The
writing-scenarios skill reads this before writing or checking a seed.

## Where seeds live

- Seeding script: `apps/api/scripts/docs-scenarios/`.
  - `lib/base.ts`: the base every scenario starts from (the Vine & Co distributor, its
    Owner, product types, suppliers, a tax type and a default price list). Read it to see
    what the base already has and what's deliberately empty.
  - `lib/builders.ts`: the shared builders. `scenarios/fixtures.ts`: the shared fixtures.
  - A scenario's seed is `scenarios/<id>.ts`, registered in `scenarios/index.ts`.
- Build only from the shared builders and fixtures, with fixed ids starting `docs-`.
  Add a builder or fixture when one is missing, rather than writing records inline.
- Dates relative to today: `nextWeekday`, `daysFromToday`.
- Values the run needs that only exist after seeding (a delivery link) go in
  `ctx.output` under the key the persona or steps name. They're written to the config's
  `seeding.output` file.

## Images

- A seed whose screens show Vine & Co's storefront (the trade-customer portal, its
  emails) calls `addBranding(prisma)` (`lib/images.ts`) after adding its products: the
  logo, the banner, and a photo on every product with a file in `assets/products/`
  named by its SKU. Other images go through `addImages`.
- Source files live in `apps/api/scripts/docs-scenarios/assets/`. To change one, replace
  the file; the next seed uploads only that image.
- Files go to the cluster's R2 bucket once. An image's id is a hash of its type and
  bytes, so it always gets the same keys, and only keys not already in R2 are uploaded.
  Teardown and `docs:clear` delete the rows, never the files, on purpose.
- Needs `kubectl` access to the cluster (it reads the API's R2 settings). The
  integration spec uses an in-memory store instead (`setImageStore`).

## Sign-ups and email

- A customer who accepts an invitation in the run: add them with
  `addCustomer(prisma, { ...CUSTOMERS.x, status: 'PENDING_INVITE', noContact: true })`
  (a contact user would hold their email and block the sign-up), then
  `addPortalInvitation(prisma, customer, email)`, which writes the invitation and the event
  that has `wholo-worker` email it. Put the address in `output.inviteEmail`.
- The address must be in `DOCS_SIGN_UP_EMAILS` (`lib/ids.ts`): every reset deletes its
  Keycloak account and its MailHog emails (`lib/sign-ups.ts`). Use `.example` addresses.
- `pnpm docs:mail <address>` saves the newest email to that address from MailHog as an
  HTML file (`.scenario-docs/mail/`) and prints its `file://` URL (`mail.open` in the
  config).

## Xero scenarios

- Use `withXero({ synced, before, after })` (`lib/types.ts`).
- Records that should get a suggested match go in `before`: suggestions come from the
  first sync.
- Links go in `after`, through `lib/xero-links.ts`. A change made in Xero goes in
  `after` too (`ctx.xero`, then `syncAgain`).
- What Xero holds comes only from `scenarios/xero-fixtures.ts`, never from data added in
  Xero by hand: add an item or contact there.
- They need the saved connection (`xero-connection.json`) and the worker running; see
  `README.md` beside this file.

## Checking a seed

- `pnpm docs:seed <id>`, check the starting data in the app, then `pnpm docs:teardown`.
- `apps/api/test/docs-scenarios.integration-spec.ts` seeds and tears down every scenario
  and fails if anything is left behind. It doesn't run Xero seeds, so run each of those
  yourself.
