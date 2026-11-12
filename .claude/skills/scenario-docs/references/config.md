# scenario-docs.yml

Lives at `documentation/scenarios/scenario-docs.yml` unless the user names another
path; its folder is the **scenarios folder** (scenarios, `guides/`, `_terms.md`,
`_inventory.md`). It holds what a scenario refers to
by name (`app`, `persona`, `seed`), so scenarios stay readable. Keep it small: most
entries are optional.

```yaml
# Where generated pages go: <docs_dir>/<audience>/<section path>/<id>.mdx, images in img/<id>/ beside it.
docs_dir: website/docs/scenarios

apps:
  admin:
    url: http://localhost:8080     # where the running app is

default_persona: distributor-owner # when a scenario doesn't say who

personas:
  distributor-owner:
    login:                         # details: auth.md
      path: /login
      username_env: DOCS_DISTRIBUTOR_OWNER_EMAIL     # env var NAMES, never values
      password_env: DOCS_DISTRIBUTOR_OWNER_PASSWORD
      env_file: .env.docs          # optional, git-ignored
      signed_in_check: Delivery Profiles   # text only visible once signed in
    reader_role: an owner account  # optional: shown in "Before you start"
  new-distributor:                 # optional: the same sign-in, before onboarding
    login: { …, signed_in_check: Create your distributorship }
    becomes: distributor-owner     # in a guide: who they are once onboarding is done
  invited-customer:                # optional: someone who starts from an email (auth.md, method: email)
    login: { method: email, output_key: inviteEmail, password_env: DOCS_NEW_CUSTOMER_PASSWORD }

mail:                              # optional: the readers' inbox, for steps done in an email
  open: pnpm docs:mail {address} {subject}   # saves the newest email to {address} as HTML; prints its file:// URL

seeding:                           # optional: one seed per scenario, with teardown
  seed: pnpm docs:seed {scenario}  # base + this scenario's starting data
  teardown: pnpm docs:teardown     # back to the base, after every run
  before_batch: pnpm docs:base     # optional: once before an "all" run
  after_batch: pnpm docs:clear     # optional: once after it, removes the base too
  output: .scenario-docs/runs/{scenario}/seed-output.json  # optional: values the run needs
  notes: documentation/scenarios/_seeding.md   # optional: how to write a seed in this project

seeds:                             # optional, older style: named shared seeds
  demo-distributor: ./scripts/reset-docs-data.sh

audiences:                         # optional: reader groups, each its own sidebar and URL prefix
  - id: distributors               # folder under docs_dir, and URL prefix (/distributors/<id>)
    label: For distributors        # top-menu item
    sections:                      # sidebar groups, in order; nest with `sections`
      - id: getting-started
        label: Getting started
        collapsed: false           # optional: open by default (groups start closed)
      - id: integrations
        label: Integrations
        description: Connect Acme to the other systems you use.  # optional: landing page
        sections:
          - id: xero
            label: Xero
  - id: customers
    label: For trade customers
    sections: [...]
```

Each persona names its audience (`audience: distributors` next to `login`). 

## Seeding

`seeding` gives every scenario its own starting data, so no scenario depends on another
and a run never leaves anything behind. `{scenario}` is replaced with the scenario id.

- `seed` resets to the base and adds that scenario's data. Running it again resets
  again, so it's also the re-seed before the capture pass.
- `teardown` undoes whatever the run did, including records created through the UI.
- `output` is a JSON file the seed writes with values that only exist after seeding (a
  delivery link, an order number). Personas and steps can refer to its keys.
- A scenario whose frontmatter names a `seed` from `seeds` uses that instead.
- `notes` is the project's own guide to writing seeds: where they live, the builders
  and helpers to use, special cases (an outside system's test data), and how to check
  a seed. `writing-scenarios` reads it before writing or checking one; keep
  project-specific seeding knowledge there, not in the skills. Start its name with `_`
  so it isn't taken for a scenario.

## Mail

Some tasks start in, or pass through, the reader's email: an invitation, a "verify your
email" message. `mail.open` is a command that saves the newest email sent to
`{address}`, whose subject contains `{subject}` (a word or two from the subject the run
expects; empty for any), as an HTML file and prints its `file://` URL (the project decides where test
email goes, e.g. a local mail catcher). The run opens that URL in the browser and acts
on the email the way the reader would: reads it, and clicks its link. Without `mail`, a
scenario with a step in an email can't run; say so rather than skipping the step.

## Audiences and sections

**Audiences come first.** An audience is one kind of reader, usually the users of one
app (distributors in the admin app, trade customers in the portal, drivers with a
delivery link). Readers of different apps work in different businesses and never see
each other's screens, so each audience gets its own sidebar, its own top-menu item and
its own URL prefix; a reader never wades through another audience's tasks. Internal
apps (staff-only tools) have no audience and no pages.

- **A persona belongs to one audience** (`audience:` on the persona). A scenario's page
  goes to its persona's audience, so the scenario never names the audience itself.
- **Sections group pages within an audience.** A scenario names its group with
  `section:`, a path through that audience's `sections` (`integrations/xero/products`).
  Order sections the way the app's own menu does, after Getting started, so the help
  reads in the order the product does. Use the app's menu words for the labels.
- **Nest when a group gets long.** More than about 7 pages in one group is hard to scan:
  split it into sub-groups (Xero → Setting up, Tax types, Products, Customers, Invoices).
- **A group can have a landing page:** its `description` becomes a page listing the
  group's pages under that text. Give one to groups whose tasks have an order a reader
  should follow (connect, then link, then invoice).
- **Groups start closed** except those marked `collapsed: false` (Getting started).
- **Where a page goes:** `<docs_dir>/<audience>/<section path>/<id>.mdx`, images in
  `img/<id>/` beside it. Its URL is `/<audience>/<id>` (`slug` in its front matter), so
  moving a page between sections never changes its URL. The overview (`kind: overview`)
  is the exception: it's in `<docs_dir>` itself and belongs to no audience.
- **Order within a group** comes from the scenario's `order:` (`sidebar_position`);
  pages without one follow, alphabetically by title.
- **Tasks that cross audiences** (the customer orders, the distributor accepts, the
  driver delivers) are separate scenarios, one per persona, joined by `related` links
  across audiences. The overview explains the whole flow once.

**The layout is applied by `scripts/relayout.py`**, never by hand:

```bash
python3 <this-skill>/scripts/relayout.py --where <id>   # where <id>'s page belongs
python3 <this-skill>/scripts/relayout.py                # move pages, write headings, fix links
python3 <this-skill>/scripts/relayout.py --check        # report anything out of place
```

It moves every page and its images to where the config and the scenario's `section` and
`order` put it, sets `slug` and `sidebar_position`, writes each group's
`_category_.json` and removes empty ones, rewrites links between pages, and writes
`<docs_dir>/_audiences.json`, from which the help site builds one sidebar and one menu
item per audience that has pages. It also refreshes the list of audiences on the home
page (between its `audiences:start` / `audiences:end` markers). It needs no browser
and no seed, so regrouping the help is a config and frontmatter change plus one run.

Without `audiences` (a product with one kind of reader), top-level `sections` work the
same way without the audience level: pages go to `<docs_dir>/<section>/<id>.mdx`.

## Rules

- **The app is assumed to be running.** Use `url`. If it's not set, find it (README,
  `CLAUDE.md`, `.env*` files, the dev setup), confirm with the user, and add it. If the
  URL doesn't answer, stop and say so; don't try to start or deploy the app.
- **Missing entries:** ask the user for exactly what's missing and add it, so it's asked
  once per project. Don't invent a seed command or sign-in flow.
- **Always tear down.** After every scenario that ran `seeding.seed`, run
  `seeding.teardown`, whether it passed or failed.
- **Seeds are the user's commands.** Run them only as written, from the repo root. Read
  a seed script before its first run; if it looks like it targets anything that isn't a
  local or docs environment, stop and confirm with the user.
- **Credentials:** see [auth.md](auth.md). Never print, log or write the values.
