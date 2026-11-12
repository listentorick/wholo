# scenario-docs

Turns a **scenario** (a task a user wants to do, written in plain words) into a how-to
page for a Docusaurus help site, by actually doing the task in the running app and
taking annotated screenshots as it goes. If the task can't be done as written, the run
fails and nothing is published, so the help never describes something that didn't
happen.

Claude runs it when you ask to document, regenerate or refresh help pages, for example
"document add-product", "regenerate all the docs", "refresh the wording" or "regroup
the help". The instructions Claude follows are in [SKILL.md](SKILL.md).

## How it fits with writing-scenarios

| | writing-scenarios | scenario-docs (this skill) |
|---|---|---|
| Works out | which tasks to document, and what each choice and status means | how to do each task in the app |
| Writes | scenarios, guides, the overview, their seeds, the inventory, the terms file | help pages and screenshots |
| Reads the app | code first, the running app only to look | the running app, by doing the task |

A scenario written by writing-scenarios starts as `status: draft`. A person reviews it
and removes that line; only then does an "all" run publish it. When scenario-docs meets
a choice or status the terms file doesn't explain, it reports it; writing-scenarios
adds it, and scenario-docs then refreshes the wording of those pages.

## Files

Everything project-specific lives in the project, in the **scenarios folder** (the
folder of the config, `documentation/scenarios/scenario-docs.yml` by default):

| File | Role |
|---|---|
| `scenario-docs.yml` | The config: app URLs, personas and how they sign in, seed commands, the docs folder, and the audiences and sections that make the help's menus ([config.md](references/config.md)). |
| `<id>.md` | One scenario per task ([scenario-format.md](references/scenario-format.md)). |
| `guides/` | Getting-started guides and the overview ([guide-format.md](references/guide-format.md)). |
| `_terms.md` | What every option and status means; pages explain them from here ([terms-format.md](references/terms-format.md)). |

It writes:

- the pages, at `<docs_dir>/<audience>/<section>/<id>.mdx` with screenshots in
  `img/<id>/` beside each, always where the config says;
- the menu files (`_audiences.json`, `_category_.json`, the home page's audience list),
  through `scripts/relayout.py`;
- `.scenario-docs/runs/<id>/` (keep it git-ignored): the route through the app
  (`route.md`) and the staged screenshots of the last run.

## Modes

| Ask for | What happens |
|---|---|
| One scenario, guide or the overview by name | Seeds its starting data, signs in, does the task, captures, writes the page, tears down |
| "All" | Every non-draft scenario, then the guides and overview |
| "Changed" | Scenarios edited since their page was written |
| "Refresh the wording" | Rewrites pages from the scenario, `route.md`, the terms file and the existing screenshots, without the browser |
| "Regroup" | Moves pages to match the config's audiences and sections; no runs |

## Scripts

Run from the repo root:

```bash
python3 .claude/skills/scenario-docs/scripts/relayout.py              # lay the pages out as the config says
python3 .claude/skills/scenario-docs/scripts/relayout.py --where <id>  # where a page goes, and its URL
python3 .claude/skills/scenario-docs/scripts/relayout.py --check      # report what would move
python3 .claude/skills/scenario-docs/scripts/check_page.py --all <docs_dir>   # images, links, front matter
```

`--config <path>` points `relayout.py` at a config elsewhere.

## Needs

- The app running at the URLs in the config.
- The `app-screenshots` skill (`.claude/skills/app-screenshots/`) and `agent-browser`,
  for all browser work.
- Optionally, seed commands in the config, so every run starts from known data.

## References

| File | What it covers |
|---|---|
| [config.md](references/config.md) | The config file, including audiences and sections |
| [scenario-format.md](references/scenario-format.md) | How a scenario is written |
| [guide-format.md](references/guide-format.md) | Guides and the overview |
| [terms-format.md](references/terms-format.md) | The terms file |
| [page-template.md](references/page-template.md), [guide-page-template.md](references/guide-page-template.md) | How pages are written |
| [example-output.mdx](references/example-output.mdx) | A finished page, for tone and structure |
| [auth.md](references/auth.md) | Signing in as a persona |
