---
name: scenario-docs
description: Generate task-oriented Docusaurus how-to pages from existing scenario files (by default in documentation/scenarios/, e.g. place-order.md). A scenario says what task a user wants to do and its logical steps; this skill works out how to do it in the running app, performs it, takes annotated screenshots via the screenshotting-apps skill, checks the task really succeeded, and writes the page. Also runs getting-started guides (a persona's journey through several scenarios, one page) and the product overview (introduction page) from its guides/ folder. Use whenever the user asks to document, write up, regenerate or refresh docs or screenshots for a scenario (by name, id or file) or for all scenarios, asks to generate the getting-started guide or the product introduction, or asks whether the docs still match the app, even if they don't say "Docusaurus" or "screenshots".
---

# Scenario docs

A **scenario** describes a task a user wants to perform: who they are, what they're
trying to achieve, the logical steps, and maybe some starting data and how you know it's
done. It deliberately does *not* say which buttons to press or what to screenshot.

This skill turns that into a how-to page by actually doing the task:

1. read the scenario,
2. get the app into the starting state and sign in,
3. work out the route through the app for each logical step,
4. perform it, taking annotated screenshots where a reader needs to see something,
5. check the task really succeeded,
6. write the Docusaurus page from what happened.

If the task can't be done as described, the run **fails and nothing is published**.
Documenting whatever happened instead would give readers confident, wrong instructions.

Two other kinds of page are built the same way, from files in
`guides/` beside the scenarios ([references/guide-format.md](references/guide-format.md)):

- a **getting-started guide** (`kind: guide`) runs several scenarios one after another,
  as one persona's journey to "up and running", and writes one page that explains each
  idea as the reader meets it and links each stage's how-to (section 8);
- the **overview** (`kind: overview`) tours the screens behind the product's main ideas
  and writes the introduction page (section 9).

Sections 0–7 describe a task scenario; 8 and 9 say what differs for the other two.

## Who does what

| | Responsible for |
|---|---|
| The scenario (author) | The task: who, why, logical steps, starting data, done-when. Optional hints. |
| **`screenshotting-apps`** skill | **All browser work:** starting the dev server, opening pages, snapshots and refs, clicking and typing, validating selectors, annotating, taking and checking screenshots, closing the browser. |
| This skill | Planning the run, choosing *what* to capture and annotate, checking outcomes, writing the page. |

Don't reimplement browser mechanics here. When this skill says "open", "perform",
"capture" or "annotate", do it the way `screenshotting-apps` says.

## 0. Before anything

1. **Load `screenshotting-apps`** with the Skill tool. Expected at
   `.claude/skills/app-screenshots/` (keep that folder name: it finds its `annotate.js`
   by that path). If it's missing, stop and tell the user to install it:
   `git clone https://github.com/alexanderop/app-screenshots .claude/skills/app-screenshots`,
   plus `npm i -g agent-browser && agent-browser install`.
   From it, use **Phase 3** in full (setup, navigate, validate selectors, annotate,
   screenshot, verify, and *Interactive screenshots* for performing actions) and
   **Phase 6** (cleanup). **Skip Phase 1** (the app is already running at a known URL),
   **Phase 2** (the scenario is the plan, so don't map the site or ask which pages)
   **and Phase 4** (this skill writes the page).
2. **Read the config** (`documentation/scenarios/scenario-docs.yml` unless the user
   names another; its folder is the **scenarios folder**, holding the scenarios,
   `guides/` and `_terms.md`)
   ([references/config.md](references/config.md)): app URL, personas and their logins,
   optional seed commands, docs folder. If something a scenario needs is missing, ask
   the user for just that and write it into the file, so it's asked once per project.
3. **Read the terms file** `_terms.md` in the scenarios folder
   ([references/terms-format.md](references/terms-format.md)): what each status, option
   and setting the help names means. Pages explain every choice and state from it.
4. **Check the app is up:** open the URL. If it doesn't load, stop and tell the user;
   don't try to start or deploy it.

## 1. Pick the scenarios

- One ("document place-order", a path, or an id): `<id>.md` in the scenarios folder.
- "All": every `*.md` there except `README.md`, files starting `_`, and drafts, then
  the non-draft guides and overview in `guides/` (last, because they link to the task
  pages). If the config has `seeding.before_batch`, run it once before the first
  scenario, and `seeding.after_batch` once after the last, even if scenarios failed.
- A guide or the overview by name ("generate the getting-started guide", "the
  introduction"): `guides/<id>.md`.
- **Drafts** (`status: draft` in the frontmatter, usually written by the
  `writing-scenarios` skill) haven't been reviewed by a person. Skip them in "all" and
  "changed" runs and list them in the report. Run one only when the user names it, and
  then say it's a draft and repeat its Open questions before starting. A draft's page
  is a preview: tell the user to review the scenario before publishing.

If the user wants scenarios written rather than run ("write a scenario for…", "what
should we document?"), that's the `writing-scenarios` skill.
- "Changed": scenarios newer than their page (`git log -1 --format=%ct` per file, else
  mtime). This can't see app changes; a full run before a release catches those.
- "Refresh the wording" (after the terms file or a scenario's Concept or Doc notes
  changed, or the page rules below did): no browser. Only for pages whose scenario's
  steps and Starting data haven't changed since their run, and whose `route.md` and
  staged screenshots exist. Rewrite each page per section 6 from the scenario,
  `route.md`, the terms file and its existing screenshots and callout numbers, then run
  section 7. A page that would need something the run didn't record (a new step, a
  screen not in `route.md`) needs a real run instead: say so.
- "Regroup", "reorganise the menu", or after editing `audiences`/`section`/`order`: no
  scenario runs, so skip the browser and app checks in section 0 and sections 2–6. Run `python3 <this-skill>/scripts/relayout.py`, then
  `check_page.py --all <docs_dir>`, and report what moved. Moving a page doesn't change
  its screenshots or its URL, so nothing needs re-capturing.

## 2. Read the scenario

Read the file and pin down, before touching the browser:

- **Title**: the `# Heading` or frontmatter `title`.
- **Who**: `persona` in the frontmatter, or whoever the scenario says ("Signed in as
  the distributor", an audience line). Map it to a persona in the config.
- **Goal**: the outcome of this task: what the user will do and have at the end. It
  becomes the page intro.
- **Concept** (optional): what the thing is and why it matters. It becomes the page's
  "About …" section. It's the author's explanation: use it as given, and if the run
  shows it's wrong (the app behaves differently), say so in the report.
- **Starting data**: what the scenario's seed creates, and any preconditions.
- **Steps**: the logical steps, in order (`### 1. …` headings or a numbered list).
- **Done when**: the end state that proves the task worked. If there isn't one, infer
  it from the goal and say so in the report.
- **Doc notes**: audience, things to mention, related scenarios.
- **Open questions** (in drafts): unresolved assumptions. They never go in the page; if
  the run answers one (you saw the behaviour), say so in the report.

Formats vary ([references/scenario-format.md](references/scenario-format.md)); go by
meaning, not exact headings. Stop and report rather than guess if you can't tell what
the task or its steps are, or a section appears twice with different content (a paste
slip that leaves the intent unclear). Mention smaller untidiness (an unfilled
`Explain:` placeholder, a line pasted twice) in the report without blocking.

**Step names.** Give each step a stable slug for screenshot names: its title,
lowercased, apostrophes dropped, other non-alphanumerics turned into single hyphens,
trimmed to about 48 characters at a word boundary ("Add products to the basket" →
`add-products-to-the-basket`). Make a repeated slug unique with `-2`.

**Hints are optional and override your judgement when present:** `Action:` (do this),
`Expect:` / `Verify:` (check this), `Capture:` / `📷 name: …` (take this shot),
`Explain:` (context for the page), `Note:` (a callout for behaviour readers wouldn't
guess), `(optional)` on a step title.

## 3. Starting state and sign-in

1. **Starting data.** Run the scenario's seed: `seeding.seed` from the config with
   `{scenario}` replaced by its id, or the named command from `seeds` if the frontmatter
   names one. Without either, the app's current data is used. Either way, check each
   starting-data item you can observe in the app. If one isn't true, stop: screenshots
   depend on state ("Create your first profile" vs "New profile"), so a wrong start
   means wrong docs. **Don't create missing data through the UI** to make it true
   unless the user says to; extra records change what every later screenshot shows.
   Report what's missing instead (usually the seed needs extending).
   **From here on, the scenario always ends with `seeding.teardown`**, whether it
   passed, failed or was stopped, so nothing it did is left for the next one.
2. **Persona.** Use `persona` from the frontmatter. Otherwise work it out from the
   scenario ("Signed in as the distributor", the audience) and match it to a persona in
   the config, falling back to its `default_persona`; if it's still ambiguous, ask.
3. **Sign in** following [references/auth.md](references/auth.md), after seeding. It
   uses the auth commands `screenshotting-apps` documents (saved state, filling the login
   form) with the persona's credentials from environment variables. Confirm the persona's
   `signed_in_check` before going further. A failed sign-in fails the scenario. A
   persona with `method: email` doesn't sign in first: the task starts in their email
   (auth.md), and any step done in an email (opening an invitation, verifying an
   address) goes through the config's `mail` command, by clicking the email's link.

## 4. Find the route (discovery pass)

For each logical step, find how a user actually does it, using `screenshotting-apps`'
snapshot → refs → interact pattern:

- **Take the route the reader will take:** visible navigation, the obvious button.
  Never use typed URLs, keyboard shortcuts or API calls to get somewhere: the page
  would teach a route the reader can't see. If there are two reasonable routes, take the
  more discoverable one and mention the other in the report.
- **Use the scenario's values exactly** ("two units", "Western Suburbs"). Where it's
  vague ("an available delivery date", "the demo product"), make one sensible concrete
  choice, record it in `route.md` (below) and reuse it on later runs. Resolve relative dates ("a Thursday next
  month") against today, but keep the page wording relative so it doesn't go stale.
- **Record the route** in `.scenario-docs/runs/<id>/route.md`: per step, the screen
  you're on, the controls used (as labelled on screen) and values entered, and what
  changed afterwards. For every **choice** the reader makes (a status, a radio, a
  dropdown of options) record all the options shown and any help text beside them, and
  for every **state** the step or result shows (a status badge, a row status) record its
  label. These are what the page must explain. This is the source for the page's instructions, and lets later
  runs skip discovery. If a `route.md` exists from a previous run and the scenario hasn't
  changed since, follow it instead. If it no longer works, rediscover and say so in the
  report (a changed route usually means the docs needed updating).
- **If you can't find a way to do a step**, stop and report what you tried and where you
  got stuck. Don't skip it, and don't substitute a different task.

Discovery usually changes data (you created the order). So when there's a seed,
**re-seed and sign in again** before the capture pass, so screenshots start from the
clean state. Re-read the seed output too: values in it (a link) change on each seed. Without a seed, do discovery and capture in one careful pass: take each
screenshot as you go, and don't submit anything irreversible until you're sure it's
the right action.

## 5. Capture pass

Follow the route, and capture as you go. **What to capture is your call** (scenario
hints win when present):

- **One screenshot per logical step, showing where the reader acts**, with the controls
  they use annotated (max 3 per shot, types per `screenshotting-apps`). Take it *after*
  values are entered and *before* submitting, so the reader sees what correct looks like.
- **Add one** when a step goes through a screen the reader hasn't seen (a dialog, a
  confirmation) or has a result they need to recognise. **Skip** a step's shot when it
  would look the same as the previous one; mention the control in the text instead.
- **One shot of the finished state** (the done-when), annotating what proves success.
- **Annotate in the app's words**, short: "New profile", not "Button to create a profile".
- **Names are stable:** `<step slug>.png` (see step 2), `<step slug>-2.png` for a
  second shot in a step, `done.png` for the end state; or the name a `📷` hint gives.
  Stable names make image diffs show real UI changes. No number prefixes, since inserting
  a step would rename everything.
- **Check every shot** per `screenshotting-apps` Phase 3 step 6 (read the image), and
  that it shows what you meant it to (or what the hint asked for). Retake if not.
- **Record every shot in `route.md`**: its name, the state it was taken in (values
  entered, which field has focus), and each annotation in order with its element, type
  and label. A later run reproduces them exactly, so an image only changes when the
  app did. When you retake a shot, put the page back in that recorded state first.
- Never capture the login page, credentials, or anything that isn't demo data.

**Check as you go.** After each step, confirm it had its intended effect: the step's
own wording says what that is ("Add two units" means the basket shows 2), plus any
`Expect:`/`Verify:` hint. At the end, confirm the done-when. Anything not true
is a failure.

**Staging.** Write screenshots to `.scenario-docs/runs/<id>/` (make sure `.scenario-docs/`
is git-ignored). `screenshotting-apps`' setup points `AGENT_BROWSER_SCREENSHOT_DIR` at
`docs/screenshots`; set it to the staging folder instead. Only when the whole scenario passed, replace the contents of
the page's `img/<id>/` folder (beside the page's path, step 6) with them, so shots no longer
needed don't linger, and write the
page. A failed run leaves the existing page and images untouched.

**On failure**, stop that scenario and report: the step, what the scenario meant to
happen, what the app did (with a staged screenshot of it), and your read on whether the
app or the scenario is out of date. Don't edit the scenario to make it pass. In "all"
mode, continue with the next scenario.

## 6. Write the page

Where it goes is decided by the config, never chosen by hand: the persona's audience
and the scenario's `section` (config.md, "Audiences and sections"). Ask the layout script:

```bash
python3 <this-skill>/scripts/relayout.py --where <id>   # prints the page path and its URL (slug)
```

Put the staged images in `img/<id>/` beside that path, write the page there with that
`slug`, then run `relayout.py` (no arguments): it writes the group headings, moves an
older copy of the page if the scenario changed group, and fixes links. Follow
[references/page-template.md](references/page-template.md).
[references/example-output.mdx](references/example-output.mdx) shows the target tone and
structure.

- **It's a how-to page for the task**, not a test report: intro from the goal (what
  the reader will do, not what the thing is or why), an "About …" section from the
  Concept (if any), "Before you start", one `## n.` section
  per logical step (the scenario's step titles, written
  for a reader), then the result.
- **Instructions come from the route**: concrete, in the app's own labels, values in
  bold, callouts referenced by the numbers drawn on the screenshot: "Select **New
  profile** (1)."
- **The audience sets the voice.** For non-technical readers: on-screen names only; no
  internal terms, seeds, personas or test-data talk.
- **Explain every choice and every state, where the reader meets it.** When a step has
  the reader pick an option, say in a clause what it means and what the alternatives
  are ("select **Active**, so customers can see and order it (**Draft** and **Archived**
  both keep it hidden from customers)"). When a step or the result shows a status, say
  what it means for them ("**Pending invite**: they can't order until you activate them
  or they accept a portal invitation"). Take the meaning from the terms file; on a page, explain
  a term the first time it appears. A term the terms file doesn't have: if the app
  explained it on screen (recorded in `route.md`), add it to the terms file with
  `Source: UI, <screen>` and use it; otherwise don't guess, leave the instruction as it
  is and list the term under "Unexplained terms" in the report. A page with unexplained
  terms is incomplete, not passed: say so.
- **Don't add what you didn't see, the scenario didn't say, or the terms file doesn't
  say.** No invented tips,
  steps or claims about behaviour. Context comes from the goal, `Explain:`/`Note:` hints
  and `Doc notes` (`Mention:` items must appear; other doc notes are guidance for you).
- **Related**: link to related scenarios' pages that exist; leave out ones that don't
  (Docusaurus fails builds on broken links) and say so in the report. In "all" mode,
  revisit pages at the end to add links that now resolve.

## 7. Check and report

1. Run the mechanical checks and fix anything marked FAIL:
   ```bash
   python3 <this-skill>/scripts/check_page.py <docs_dir>/<id>.mdx
   ```
   It checks images (each referenced one exists, none left unused in the folder),
   relative links, admonitions and front matter. After `relayout.py` has moved pages,
   or at the end of an "all" run, check every page: `check_page.py --all <docs_dir>`. Then do what it can't: every choice and state the
   route recorded is explained on the page (or reported as unexplained), every logical
   step has its section, every `Mention:` is covered, and each image matches its
   paragraph (the callout numbers in the text are the ones drawn). Run the
   Docusaurus build if the user wants it (slow, so ask first in "all" mode).
2. In a git repo, list changed images (`git status --short <docs_dir>`); a changed
   image usually means a UI change worth a glance.
3. Report briefly per scenario: passed (page path) or failed (step and reason); route
   changes; choices you made for vague steps; untidiness in the scenario; missing
   related pages; **unexplained terms** (each with the screen it's on and its options),
   for `writing-scenarios` to add to the terms file before the page is refreshed. Close the browser per `screenshotting-apps` Phase 6.

## 8. Guides

A guide (`kind: guide`) is one persona's journey through several scenarios. Read
[references/guide-format.md](references/guide-format.md) for the file and
[references/guide-page-template.md](references/guide-page-template.md) for the page.
Sections 0–7 apply, with these differences:

1. **Read the guide and every stage's scenario** first. Check before the browser: each
   stage's scenario exists and is for the guide's persona, and its Starting data is
   made by an earlier stage or the guide's seed (allowing for `With:` replacements). A
   gap is a failure of the guide, reported before running anything: say which stage
   needs what. Every stage's scenario should have a published page; a stage whose
   scenario is a draft, or whose page doesn't exist, makes the whole guide a draft
   preview (say so).
2. **One seed, no teardown between stages.** Run the seed for the guide's id, sign in
   as its persona, then perform the stages in order: each stage's steps, through that
   scenario's `route.md` if it has one, with the guide's `With:` values in place of the
   scenario's own, leaving out its `Skip:` steps. The signed-in user stays the same
   throughout: once a sign-up flow has created their account, they are the persona
   named by `becomes:` in the config, and that persona's `signed_in_check` applies from then on.
   Check each stage's done-when (less anything it skipped) before moving on. At the end, check the
   guide's Done when (signing in as the `As:` persona if one is given), then run
   `seeding.teardown`, whatever happened.
3. **Discovery then capture still apply**, across the whole journey: if anything had to
   be worked out, re-seed and run the journey again for the capture pass.
4. **Capture one shot per stage** (its most telling screen), named `<stage slug>.png`,
   plus `done.png`. Record the journey in `.scenario-docs/runs/<guide id>/route.md`:
   per stage, the scenario, the values used, and anything that differed from running
   the scenario on its own.
5. **Write the page** from the guide template: per stage, the concept (from that
   scenario's Concept, cut down), what the reader does in 2–3 sentences, the shot, and
   a link to the stage's how-to page. A skipped step is done in a later stage or
   mentioned as optional, never silently missing. Never copy the how-to's step-by-step
   instructions: the how-to is where they live.
6. **A failed stage fails the guide.** Report the stage and why; if the same scenario
   passes on its own, the guide's chaining is wrong (usually a `With:` value or a
   Starting data item an earlier stage didn't make).

## 9. Overview

The overview (`kind: overview`) is the product's introduction page. Same format and
page references as guides.

1. **Check the sources.** Each concept's `Sources:` scenarios exist, and the concept's
   text says nothing their Concept sections don't. A claim with no source is reported,
   not published.
2. **Tour.** Run the overview's seed. For each concept with a `Screen:`, sign in as
   that persona, go to the screen through visible navigation, check that it shows what
   the concept says (the labels and things it names are there), and take one shot
   annotating what shows the concept, named `<concept slug>.png`. Teardown at the end.
   A screen that doesn't exist or contradicts the concept fails the run.
3. **Write the page** from the overview template, at `<docs_dir>/<id>.mdx`, above the
   audiences (`relayout.py --where <id>` confirms it); link each persona's guide that has
   a published page, so each kind of reader finds their own part of the help. Overview
   pages have no instructions.

## When the app can't be reached

If the URL doesn't load or `agent-browser` is missing, you can still read scenarios and
point out problems with them. Don't write a page without a run: a page whose steps and screenshots didn't really happen is exactly
what this skill exists to prevent.
