# writing-scenarios

Works out what an app's help should cover, and drafts the files that the
[scenario-docs](../scenario-docs/README.md) skill turns into help pages. It reads the
code first (routes, menus, permissions, what each option really does), and looks at the
running app only to confirm labels, without changing anything.

Claude runs it when you ask to write or suggest a scenario, ask what should be
documented or how much is covered, or want docs for a new feature, role or release. The
instructions Claude follows are in [SKILL.md](SKILL.md).

## What it writes

All in the **scenarios folder** (the folder of the scenario-docs config,
`documentation/scenarios/` by default), plus the seeds wherever the project keeps them:

| File | What it is |
|---|---|
| `<id>.md` | A **scenario**: one task (who, why, the steps as intentions, starting data, how you know it worked). Always `status: draft` until a person reviews it. |
| The scenario's **seed** | Exactly the data the task starts from, built from the project's shared builders. Every scenario stands alone. Where seeds live and how to write them comes from the project's seeding notes (`seeding.notes` in the config). |
| `guides/get-started-<persona>.md` | A **getting-started guide**: one persona's journey through existing scenarios to "up and running". It asks you what that means first. |
| `guides/overview.md` | The **overview**: what the product is, who uses it, its main ideas, built from the scenarios' Concept sections. |
| `_inventory.md` | The **task inventory**: every task, grouped as the help's menus are, with its scenario or `—` if not written yet. |
| `_terms.md` | The **terms file**: every option a reader picks and every status they see, all its options, and the code that decides each. Pages explain terms only from here. |

It never overwrites an existing scenario; it proposes changes in its report instead.

## Where things go in the help

The help is split by reader (usually one audience per app), then into groups that
follow that app's menu. Each scenario says where it belongs with `section:` and
`order:` in its front matter; the groups are defined under `audiences` in the config. A
task that crosses apps (one user does something, another responds to it) is one
scenario per persona, linked with `related`.

## Typical flow

1. "What should we document?" writes `_inventory.md` and recommends a first batch.
2. It drafts those scenarios and seeds, and adds their terms to `_terms.md`.
3. Its report lists open questions: anything it inferred rather than found.
4. You review each draft, answer the questions and remove `status: draft`.
5. scenario-docs runs it. That run is the real test: if a step can't be done, it fails
   and says why.

## Formats

The file formats live with scenario-docs, which reads them:
[scenario-format.md](../scenario-docs/references/scenario-format.md),
[guide-format.md](../scenario-docs/references/guide-format.md),
[terms-format.md](../scenario-docs/references/terms-format.md) and
[config.md](../scenario-docs/references/config.md) (including `seeding.notes`).
