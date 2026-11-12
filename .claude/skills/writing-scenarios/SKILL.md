---
name: writing-scenarios
description: Draft task scenario files (by default in documentation/scenarios/) from an understanding of the application (its code, seed data and UI), for the scenario-docs skill to turn into how-to pages. Use when the user asks to write, create, draft or suggest a scenario, asks what tasks or features should be documented, wants to find undocumented tasks or check documentation coverage, or wants scenarios for a new feature, page, role or release, even if they don't say "scenario". Also drafts the getting-started guide for each persona and the product overview (introduction), asking the user what "up and running" means for the product.
---

# Writing scenarios

A scenario describes **one task a user wants to perform**: who, why, the logical steps,
the starting data, and how you know it's done. `scenario-docs` later performs it in the
app and writes the how-to page. This skill works out what those tasks are and drafts the
files.

Two things make a scenario good, and both come from really understanding the app:

- **It's a real user's task, in their words.** "Set up a delivery profile", not
  "DeliveryProfileForm CRUD". Steps are intentions ("Choose the delivery days"), not
  clicks, so the scenario survives UI changes.
- **It will actually run.** The persona can do it, its own seed creates exactly the
  data it relies on, the names it invents don't collide with that data, and the end
  state is something you can see on screen.
- **It stands alone.** Every scenario ships with its own seed, and never relies on
  another scenario having run. If it needs a customer that "add a customer" would
  create, its seed creates that customer.

Besides task scenarios, this skill drafts two files that span tasks (format:
`scenario-docs/references/guide-format.md`):

- a **getting-started guide** per persona: an ordered journey through existing
  scenarios to that persona's "up and running", worked out with the user (section 4);
- the **overview**: what the product is, who uses it, and its main ideas, built from
  the scenarios' Concept sections (section 5).

## 0. Setup

1. **Format:** read `.claude/skills/scenario-docs/references/scenario-format.md` (or
   wherever `scenario-docs` is installed). That's the format to write. If
   `scenario-docs` isn't installed, say so: the scenarios are only useful with it.
2. **Config:** read the scenario-docs config (`documentation/scenarios/scenario-docs.yml`
   unless the user names another) for persona names, seeds and the docs folder. Its
   folder is the **scenarios folder**: scenarios, `guides/`, `_terms.md` and
   `_inventory.md` all live there. Scenarios must use those exact persona names. If there's
   no config yet, note the personas and seeds you find in the code and suggest entries
   in the report (don't write credentials or seed commands yourself).
3. **What exists:** list the scenarios folder (and its `guides/`) and the docs
   folder, so you don't duplicate a scenario, guide or page.
4. **Audiences and sections** (`scenario-docs/references/config.md`, "Audiences and
   sections"): the help is split first by reader (usually one audience per app the
   config lists), then into groups that follow that app's own menu. Every
   file you write gets a `section:` (a path through its persona's audience's
   `sections`, e.g. `integrations/xero/products`) and an `order:` (where it sits in that
   group: the order a reader would do the tasks in). If no existing group fits, add one
   to the config in the app's menu order, with the app's menu words; when a group would
   pass about 7 pages, split it into sub-groups and say so in the report. A task in an
   app with no audience yet (a new app) needs a new audience and persona: propose them
   in the report rather than adding them. Internal staff tools get no audience.

## 1. Understand the app

Build the picture from the **code first**: it shows every task, including ones you can't
reach from the main menu, and who is allowed to do what. Start broad (the routes and
the navigation menu), then go deep only on the areas you're writing scenarios for.
Gather:

- **Areas and navigation**: the menu or sidebar is the route users actually take. Take
  its labels from what's shown on screen (i18n files, template text, button text),
  never from component, model or table names. Screens not in the menu are usually
  reached from a list page or a button; find where they're linked from.
- **Personas**: role and permission checks, and which areas and actions each persona
  can reach. Only write a task for a persona who can do it.
- **Tasks**: things a user starts and finishes with a visible result: forms that
  create or edit something, actions with real effects (submit, approve, assign, cancel,
  export, invite), multi-step flows and wizards, and settings that change behaviour.
  **Group by the user's goal:** "add to basket", "choose a delivery date" and "submit"
  are steps of *Place an order*, not three tasks.
- **Choices and states the reader meets**: for each task, every option the reader
  picks (a status, a classification, a radio setting, a dropdown of fixed values) and
  every status they're shown afterwards (badges, row statuses). Find what each option
  *does* in the code (the queries and checks that read it: who can see an Active
  product, what happens to a Draft), not just its label. These go in the terms file
  (section 3a), with every option, not just the one the scenario uses.
- **Rules a reader would trip over**: validation, cut-offs, conditional fields, things
  only possible after another step, irreversible actions, effects on other records
  (deleting a profile leaves its customers without dates). These become steps, `Note:`
  hints, `Mention:` doc notes or related scenarios.
- **Seeding**: if the config has `seeding`, read its `notes` file (the project's guide
  to writing seeds: where they live, the helpers to use, special cases) and the script
  its commands run: the base every scenario starts from, the shared builders and
  fixtures, and a couple of existing scenario seeds. Note what the
  base already has and what's deliberately empty. Without `seeding`, read the named seed
  scripts instead, or note what data the scenario relies on so a reviewer can check it.
- **Existing docs**: pages, README or help content that already explain a task, and
  the words they use. Hand-written pages are good candidates for a scenario, which
  would keep them current.

Then **look at the running app** if it's up, through the `screenshotting-apps` skill
(load it; its Phase 2 site mapping is exactly this) at the URL in the config. Use it to confirm navigation labels and where things live. **Look, don't change:** no submitting forms or clicking actions
with effects, since the data may not have been reset and other people may rely on it.
To see a scenario's starting state, run its seed (`seeding.seed`), look, then run
`seeding.teardown`.
If the app isn't running, work from the code and say the labels are unconfirmed.
The running app may be an older build than the code; when they disagree, trust the
code for what's coming and mention the gap.

Keep the code-level detail out of the scenario. It's there so the scenario is right.

## 2. Inventory mode ("what should we document?")

When the user wants coverage or ideas rather than one named task, write or update
`_inventory.md` in the scenarios folder (the leading `_` keeps `scenario-docs` from
treating it as a scenario):

```markdown
# Task inventory

Generated by writing-scenarios on 2026-11-04 from the code and the running app.

## For distributors

### Delivery setup
| Task | Scenario | Notes |
|---|---|---|
| Set up a delivery profile | delivery-profile-setup | |
| Assign a delivery profile to a customer | — | Needs a profile first |
| Block a delivery date for everyone | — | Holiday closures; seen in DeliveryCalendar |

### Orders
…
```

- Group by audience, then by the sections in the config (the same groups the help's menu
  shows), so the inventory reads like the menu. Note tasks that cross audiences (the
  customer orders, the distributor accepts) in both, as separate rows.
- One row per task, named as the user would say it (verb + object).
- `Scenario` is the file id if one exists, else `—`.
- `Notes`: a dependency, a gotcha, or why it matters.

Add a **Guides** table at the end: one row per persona, with its guide id (or `—`),
and in Notes the outcome that means "up and running" for them, if it has been agreed.

Then **recommend a first batch** of about 3–6 missing tasks and ask which to write
(AskUserQuestion with the recommendation first, if available). Favour the tasks most
users need, the ones that go wrong (the gotchas you found), and ones other scenarios
depend on.

## 3. Write a scenario and its seed

`<id>.md` in the scenarios folder, where `<id>` is the task in kebab-case
(`assign-delivery-profile`). Never overwrite an existing scenario: if one exists for
the task, say so, and propose changes in the report rather than editing it.

```markdown
---
status: draft
persona: distributor-owner
section: customers
order: 3
related: [delivery-profile-setup]
---
# Assign a delivery profile to a customer

## Goal
Put Acme Bakery on the Western Suburbs delivery profile.

## Concept
A delivery profile is a delivery schedule shared by a group of customers. A customer's
profile decides which delivery dates they can choose when they order; a customer with
no profile can't choose any. Putting each customer on the right profile means they can
only book deliveries you can make.

## Starting data
- A customer called Acme Bakery exists, with no delivery profile
- A delivery profile called Western Suburbs exists

## Steps
1. Open Acme Bakery's customer record
2. Set its delivery profile to Western Suburbs
3. Save the customer

## Done when
Acme Bakery shows Western Suburbs as its delivery profile.

## Doc notes
- Audience: distributor owner, no technical background
- Mention: changing a customer's profile changes which delivery dates they can choose

## Open questions
- Does reassigning affect orders the customer has already placed? (Not clear from the code.)
```

Guidelines:

- **One persona, one app.** A task that crosses apps (the customer orders, the
  distributor accepts) is a scenario per persona, linked with `related` (which may
  cross audiences); never one scenario that switches app.
- **One task, 3–8 steps.** If it needs what another task creates, its seed creates
  that directly; link the other task in `related` if the page should point to it.
  `related` never means "run this first". If it has more than ~8 steps,
  it's probably two tasks.
- **Steps are intentions**, in the order a user thinks of them, named with the app's
  labels where it helps ("Set its delivery profile"). No clicks, selectors, URLs or
  component names.
- **Values are concrete and repeatable:** exact names, quantities and times; relative
  dates ("a Thursday next month"). Reuse seed records by their exact names. For things
  the task creates, choose names that aren't in the seed, and say so in starting data if
  a clash would matter ("No profile named Western Suburbs exists").
- **Starting data only lists what the task needs**, and is exactly what the scenario's
  seed adds to the base (the base itself needn't be listed). Leave `seed:` out of the
  frontmatter; the scenario's own seed runs by its id.
- **Done when is visible:** something a person can see on screen afterwards, not
  "the database row is updated".
- **Goal is the task's outcome**, in a sentence or two: what the user will do and have
  at the end, in their words. It becomes the page intro, so keep it general (example
  values go in the steps). The reason the task matters goes in Concept, not here;
  only when there's no Concept can Goal carry a short reason. Take it from UI copy,
  help text, product docs or comments. If you're guessing, say so in Open questions.
- **Concept explains the idea behind the task** for someone meeting it for the first
  time, in 2–5 sentences: what it is, what it controls, and why it matters (what goes
  wrong if it's missing or wrong). Build it from the code, since that's what really
  decides behaviour (e.g. how a profile turns into the dates a customer can pick), then
  phrase it in the user's words, with no code terms. Every claim must be something you
  found, not inferred: the page states it as fact and the run can't check it. Put
  anything you're unsure of in Open questions instead. Leave Concept out for tasks with
  no idea behind them, and don't repeat the same Concept across scenarios word for
  word: each one explains the idea from its own task's angle.
- **Hints only where they earn it:** a `Note:` for a rule users wouldn't guess (taken
  from the code, e.g. "overrides only appear after the profile is created"), `Explain:`
  for context the page needs. Leave screenshots and checks to `scenario-docs`.
- **`status: draft` always.** A person removes it once they've reviewed the scenario.
  `scenario-docs` skips drafts in "all" runs, so nothing you guessed gets published
  unseen.
- **Open questions** is for anything you inferred rather than saw: the goal, a rule, a
  data assumption, an unconfirmed label. Leave it out if there are none. A reviewer
  should be able to clear it in a minute.

### The seed

With `seeding` configured, write the scenario's seed alongside it, where and how the
project's seeding notes (`seeding.notes` in the config) say. Whatever the project:

- Reuse the project's shared builders and fixtures; add one when it's missing, rather
  than writing records inline in a seed.
- Create exactly the starting data, nothing more: an empty list and a full one look
  different on screen.
- Dates relative to today, so the data never goes stale.
- Values the run needs that only exist after seeding (a delivery link) go in the seed's
  output (`seeding.output`) under the key the persona or steps name.
- Data held by an outside system the app connects to comes from the project's fixtures
  for it, never from data added there by hand, so a run can be repeated.
- A task that starts in the reader's email (an invitation) needs the config's `mail`
  setting and a persona with `method: email` (scenario-docs `references/auth.md`): the seed
  sends the email the way the app does, writes the address to the output, and every
  reset removes any account the run creates by signing up.
- Run it: `seeding.seed` with its id, check the starting data in the app, then
  `seeding.teardown`. Run any check the notes name (e.g. a test that seeds and tears
  down every scenario).
- If there are no seeding notes and something about seeding isn't obvious from the
  script, say so in the report and suggest the notes be written.

## 3a. Keep the terms file complete

Every page explains the options a reader chooses and the statuses they see, from one
shared file, `_terms.md` in the scenarios folder (format:
`scenario-docs/references/terms-format.md`). So for every scenario you write or review:

- **List its choices and states**: each option the steps have the reader pick, the
  options left at a default that the page will mention, and each status the steps or
  Done when show. Check each against the terms file.
- **Add what's missing**, one entry per thing as the app labels it, with *all* its
  options, one sentence each on what it means for the reader's business, and `Source:`
  (the code that decides it, plus on-screen help text if any). Don't change an existing
  entry's meaning without saying so in the report: other pages rely on it.
- **What you can't confirm from the code** goes in the report as an open question and
  stays out of the file. A page can't explain a term the file doesn't have, and
  `scenario-docs` reports it as unexplained.
- When `scenario-docs` reports unexplained terms, adding them here is your job; then
  ask `scenario-docs` to refresh the wording of the affected pages.

## 4. Write a getting-started guide

`guides/<id>.md` (`get-started-<persona>` unless the project
names them otherwise), one per persona, in the guide format. A guide is only as good as
its idea of "up and running", and that's a product decision, not something the code
says. So **ask first** (AskUserQuestion, one call, with your best guess as the
recommended option for each, from what you learnt in section 1):

1. **Who and from where:** the reader's situation at the start ("just signed up,
   nothing set up yet", "just been invited").
2. **Up and running:** the first outcome that makes the product useful to them. It
   becomes the guide's Done when, so it must be visible on screen.
3. **Left out:** what a newcomer doesn't need yet. These become Next steps.
4. **Order constraints** the code doesn't show (business rules, what customers expect
   first). Skip this question if there's nothing to ask.

Record the answers under `## Purpose`, so they're asked once. Then work out the path:

- **Stages are scenarios.** Pick the scenarios that lead to the outcome, and order them
  by what each needs from the ones before (its Starting data), then by the order a
  person would naturally think of them. Every stage's scenario must be for the guide's
  persona, or the one it `becomes` (config) once onboarding is done.
- **A missing task is a missing scenario.** If the journey needs a task no scenario
  covers, write that scenario too (section 3), with its own seed. A guide never
  contains steps of its own.
- **Make the stages chain.** In the guide, a stage starts from what earlier stages left,
  not from its own seed. Walk the stages in order and check each one's Starting data is
  made by an earlier stage or the guide's seed. Where a scenario's example names
  don't match (it assumes a customer called The Grand Hotel Leeds, an earlier stage
  added Botanica), give the stage a `With:` line rather than changing the scenario.
  Where a scenario does more than the stage needs (adds a product and puts it in a
  catalogue, when a later stage makes the catalogue), give it a `Skip:` line with the
  reason.
- **`Why now:`** only where the order isn't obvious; one sentence.
- **Group the stages** by area (`### Your business`, `### Products and prices`, …)
  once there are more than about five, and group Next steps the same way, so each
  follow-on task sits with what it builds on. Next steps need published pages.
- **Three stages or more,** or it isn't a guide: say so, and point the overview at the
  how-to instead.
- **Its seed** creates the persona's starting situation, which is often earlier than
  the base every scenario starts from (a distributor not yet set up). Write it like a
  scenario's seed, keyed by the guide's id. If the seeding framework can only add to
  the base, say what it needs in the report rather than working around it.
- **Done when** is checked by the guide's persona unless an `As:` persona can really be
  signed in at that point (an invitation must have been accepted, for example).

## 5. Write the overview

`guides/overview.md`, one per product, in the overview
format. Ask first, in one AskUserQuestion call: who reads it (a new user, by default;
selling the product is the marketing site's job), what to emphasise, and anything to
avoid. Record the answers under `## Purpose`. Then:

- **Who uses it:** one line per persona in the config, in the reader's words, naming
  that persona's guide if there is one.
- **Concepts** are collected from the scenarios' `## Concept` sections: group the ones
  that explain the same idea, put them in the order a newcomer meets them (usually the
  main persona's guide order), and restate each in 2–4 sentences. List the source scenarios
  under `Sources:`, and add a `Screen:` (persona and the navigation label of the screen
  that shows it) where one does. Add nothing a source doesn't say; an idea worth
  explaining with no scenario behind it goes in Open questions.
- **How it fits together:** a short numbered flow, from setting things up to the
  result for the customer, using only the concepts above.
- **Its seed** makes the toured screens look lived-in (a few catalogues, customers and
  orders), keyed by the overview's id.

## 6. Check before handing over

For each scenario, re-read it as the reviewer would:

- The persona exists in the config and can reach every step (per the permissions you
  found).
- Every starting-data item and named record is created by its seed, with the exact
  name, and the seed has run and torn down cleanly.
- Nothing relies on another scenario having run.
- Each step is one intention, with no UI mechanics.
- The done-when is visible on screen.
- Every claim in Concept is backed by something you found in the code or UI.
- Every choice the reader makes and every status they see in it is in the terms file,
  with all its options and a source.
- It doesn't duplicate an existing scenario, and `related` ids exist (or are in the
  batch you're writing).

For a guide: every stage is an existing (or newly written) scenario for its persona,
the stages chain (each one's Starting data made earlier), Done when is visible to the
persona that checks it, and Next steps ids exist. For the overview: every concept has
sources, and says nothing they don't.

Then update `_inventory.md` if there is one.

## 7. Report

Briefly: the files written; the open questions across them (the reviewer's to-do);
anything the seed is missing; config entries to add; and the next step. That's
reviewing the drafts, removing `status: draft`, then asking `scenario-docs` to run
one. Its run is the real test: if a step can't be done, it fails and says why.
