# Guide and overview format

Besides task scenarios, the help site has two kinds of page that span tasks. Both live
in `guides/` in the scenarios folder, so "all scenarios" never mistakes them for tasks,
and both say which kind they are with `kind:` in the frontmatter.

| Kind | Page | One per | Made of |
|---|---|---|---|
| `guide` | Getting started: takes one persona from their starting situation to "up and running", in order, explaining the ideas as they meet them | Persona | Existing scenarios, run one after another on one seed |
| `overview` | Introduction: what the product is, who uses it, its main ideas, and how they fit together | Product | Concepts, with a screen that shows each one |

Neither repeats a how-to's step-by-step instructions. A guide links to the how-to for
each stage; the overview links to the guides.

## Guide

```markdown
---
kind: guide
status: draft
persona: distributor-owner
section: getting-started       # group within the persona's audience (config `audiences`)
order: 1                       # position within that group
---
# Get started with your Acme store

## Purpose
- Reader: an owner who has just signed up, with nothing set up yet
- Up and running means: one customer can see your products, at their prices, in
  their ordering portal
- Left out: accounting connection, team members, delivery runs
- Order constraints: products need a tax type before they can be made Active

## Goal
Set up your business, add your products and prices, and invite your first customer
to order online.

## Starting data
- A newly registered owner who hasn't set up their business yet

## Stages
1. Set up your business — distributor-onboarding
   Why now: everything else belongs to your business, so it comes first.
2. Add a tax type — add-tax-type
3. Add your products — add-product
   With: product Rioja Crianza 2020, tax type Standard VAT
4. Set your prices — create-price-list
5. Decide what customers can see — create-catalogue
   With: catalogue Wine Bar Essentials containing Rioja Crianza 2020
6. Add your first customer — add-customer
7. Give them their catalogue and prices — set-customer-catalogue-and-price-list
   With: customer The Grand Hotel Leeds, catalogue Wine Bar Essentials
8. Invite them to order online — invite-customer-to-portal

## Done when
The Grand Hotel Leeds has been sent its portal invitation, with Wine Bar Essentials and
Hotel Trade on its record.

## Next steps
- connect-xero
- plan-delivery-runs
- invite-team-member

## Open questions
- …
```

| Part | Needed? | Used for |
|---|---|---|
| `kind: guide` | Yes | Tells the skills what this file is |
| `persona` | Yes | Who signs in at the start. Every stage's scenario is for this persona, or for one it becomes on the way (`becomes:` in the config, e.g. a new sign-up who becomes an account owner once onboarding has created their business). The signed-in user never changes during a guide |
| Purpose | Yes | The interview answers (writing-scenarios asks them once). Never published; it is why the guide has the stages it has |
| Goal | Yes | The page intro: what the reader will have done by the end |
| Starting data | Yes | What the guide's own seed creates. Usually less than the base: a guide often starts before the base exists (a fresh sign-up) |
| Stages | Yes | Ordered. Each names one scenario by id, with a short title for the reader. `Why now:` (optional) says why it comes at this point. `With:` (optional) replaces the scenario's example values, and notes starting data that differs, so the journey hangs together. `Skip:` (optional) names steps of the scenario the journey doesn't do here, with the reason (done in another stage, or optional). `Explain:` (optional) is context the page needs at this stage that the scenario's own page doesn't (a fact that only matters because of where the journey is). Stages may be grouped under `### <group>` headings (Your business, Products and prices, Delivery, Customers): numbering runs on across groups |
| Done when | Yes | The guide's own end state, the "up and running" from Purpose. A line `As: <persona>` checks it signed in as another persona, which only works if that persona can be signed in at that point (e.g. an invitation they'd have to accept first can't be); otherwise pick an end state the guide's persona can see |
| Next steps | Optional | Scenario ids linked at the end, for what Purpose left out. When the stages are grouped, group these under the same `###` headings, so each follow-on task sits with the part of the guide it builds on (routes and runs under Delivery, payment terms under Customers). Every id needs a published page |
| `section`, `order` | Recommended | Where the page goes in its persona's audience: a guide sits first in that audience's Getting started. Each audience has its own guide |
| `status: draft`, Open questions | In drafts | As for scenarios |

**Stages run on each other's results.** A guide runs its stages one after another on
one seed, with no teardown between them, so the customer added in one stage is the one
invited in the next. A stage's scenario normally starts from its own seed; in a guide it
starts from what earlier stages left. So every stage's Starting data must be true by
the time it runs: made by an earlier stage, or by the guide's seed. Use `With:` where a
scenario's example names don't match what earlier stages created.

**Skip, don't rewrite.** A scenario often does a little more than a stage needs (add a
product *and* put it in a catalogue). Skip the extra steps, giving the reason, rather
than writing a cut-down copy of the scenario. Never skip a step a later stage depends on.

**One scenario per stage.** A step the journey needs but no scenario covers means a
scenario is missing: write that scenario, don't put steps in the guide. A guide never
has instructions of its own.

**Group stages by area once there are more than about five.** Groups follow the
order constraints (a group's stages may need an earlier group's results, never a
later one's) and use the reader's words for the areas of the app.

**A guide is worth having at three stages or more.** With fewer, the how-to already is
the getting-started page; link it from the overview instead.

## Overview

```markdown
---
kind: overview
status: draft
---
# What is Acme?

## Purpose
- Reader: someone who has just signed up and wants the big picture before starting
- Emphasise: how an order gets from a customer to a delivery
- Avoid: marketing claims; anything not built

## Summary
Acme runs a wholesale business: your products, prices and customers, the orders
customers place online, and the deliveries that fulfil them.

## Who uses it
- distributor-owner: runs the business in the admin app — guide: get-started-owner
- trade-customer: orders from you in their portal — guide: get-started-customer
- driver: records deliveries from a link, with no account

## Concepts
### Catalogues
Sources: create-catalogue, set-customer-catalogue-and-price-list
Screen: distributor-owner, Catalogues
A catalogue is a set of products you choose to show to some customers. …

### Price lists
…

## How it fits together
1. You add products, put them in catalogues and price them with price lists.
2. Each customer gets catalogues, a price list and a delivery profile.
3. …

## Open questions
- …
```

| Part | Needed? | Used for |
|---|---|---|
| `kind: overview` | Yes | |
| Purpose | Yes | The interview answers; never published |
| Summary | Yes | The page intro, 1–3 sentences |
| Who uses it | Yes | One line per persona from the config, with the guide that starts them off (if any) |
| Concepts | Yes | Ordered as a newcomer meets them. Each: a `###` name, `Sources:` (the scenarios whose Concept it is built from), an optional `Screen:` (persona and the screen, by its navigation label, that shows it), and 2–4 sentences |
| How it fits together | Recommended | A short numbered flow tying the concepts together |
| `status: draft`, Open questions | In drafts | As for scenarios |

**The overview sits above the audiences**, at the top of the help (no `section`): it's
the one page every reader shares. It explains how the work flows across the apps (the
customer orders, the distributor accepts, the driver delivers) and sends each kind of
reader to their own part of the help.

**Concepts come from the scenarios.** Each concept restates, shorter, what its source
scenarios' `## Concept` sections say, so a fact is stated once at source and repeated,
never invented here. A concept with no source scenario is either missing a scenario or
doesn't belong.

**Seed.** The overview's tour needs screens that look lived-in (a catalogue list with
catalogues in it), so it has its own seed, run like any scenario's (`{scenario}` is the
overview's id).
