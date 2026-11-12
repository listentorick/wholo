# Scenario format

A scenario describes **a task a user wants to perform**, not how to click through the
app. Claude works out the route, the screenshots and the checks. Keep scenarios short
and in the user's terms.

## Minimal

```markdown
---
persona: distributor-owner     # who does it; maps to a login in scenario-docs.yml
section: delivery-setup        # sidebar group within the persona's audience (config `audiences`)
order: 2                       # position within that group
related: [delivery-profile-setup]   # optional: other scenarios to link to
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
```

| Part | Needed? | Used for |
|---|---|---|
| Title (`# …` or frontmatter `title`) | Yes | Page title |
| Steps (numbered list or `### 1. …`) | Yes | What to do, and one page section each |
| Goal | Strongly recommended | The task's outcome. Page intro; tells Claude what "done" means |
| Concept | Recommended | An "About …" section: what the thing is, and why it matters |
| Persona | Recommended | Which login to use; frontmatter or "Signed in as …" |
| Starting data | When the task needs it | What the scenario's seed creates; checked before the run |
| `seed` (frontmatter) | Rarely | A named shared seed from `seeds`; without it, the scenario's own seed runs |
| Done when | Recommended | Final check that the task really worked |
| Doc notes | Optional | `Audience:` sets the voice; `Mention:` must appear in the page |
| `section`, `order` (frontmatter) | Recommended | Sidebar group (a path through the persona's audience's `sections`, e.g. `integrations/xero/products`) and position within it |
| `status: draft` | Optional | Not yet reviewed: skipped by "document all scenarios" |
| Open questions | In drafts | Assumptions for a reviewer to settle; never published |

**Terms aren't explained in the scenario.** What a status or option means ("Active",
"Pending invite", "Authorised") lives once in `_terms.md` ([terms-format.md](terms-format.md)),
so every page that meets it explains it the same way. A scenario only uses the app's
labels; the page adds the meaning from the terms file.

The `writing-scenarios` skill drafts scenarios from the code and the running app, with
`status: draft` and any guesses under Open questions. Review the draft, settle the
questions, then remove `status: draft`.

Section names are flexible: "Audience and goal", "Starting state", "Activities", "End
state" all work. "Concept and why it matters", "Background" or "About delivery profiles"
all count as Concept.

The file name is the scenario id (`assign-delivery-profile.md`); `related` uses these
ids. Where its page goes follows from the persona's audience and the `section`
(config.md, "Audiences and sections"); `scripts/relayout.py --where <id>` prints it.

**One persona per scenario.** A task that spans apps (the customer places an order, the
distributor accepts it) is two scenarios, one per persona, linked with `related`; never
one scenario that switches app halfway. `related` may point across audiences.

Getting-started guides and the product overview have their own format, in
`guides/` in the scenarios folder: see [guide-format.md](guide-format.md). They are
built from scenarios, so each task still needs its scenario.

## Writing tips

- **Write steps as intentions, not clicks:** "Set its delivery profile to Western
  Suburbs", not "Click the dropdown in the second panel". Claude finds the controls,
  and the scenario survives UI changes.
- **Spell out values** that should be the same every run (names, quantities, times).
  Use relative dates ("a Thursday next month"), because the calendar moves.
- **Fixed starting data makes screenshots repeatable:** an empty list and a full one look
  different. Each scenario comes with its own seed (`seeding` in the config), and
  Starting data lists exactly what that seed adds on top of the base.
- **Goal is the task, Concept is the idea.** Goal says what the user will do and end up
  with ("Create a delivery profile with its delivery days and cut-off"). The reason it
  matters goes in Concept, so the page doesn't say it twice. With no Concept, Goal can
  carry a short reason.
- **Concept explains the idea, not the task.** In 2–5 sentences: what the thing is in
  the reader's world, what it controls or affects, and why getting it right matters
  (what goes wrong otherwise). It's for a reader who has never met the idea. Only state
  behaviour you know is true; the page repeats it as fact, and the run can't check it.
  Skip it for tasks with no idea behind them ("change your password").
- **One task per scenario, and no dependencies.** If it needs something another task
  creates (a profile to assign), its seed creates that directly. `related` is for links
  between pages only; a scenario never relies on another having run.

## Optional hints

Add these to a step only when you want to steer the result:

| Hint | Effect |
|---|---|
| `Action: …` | Exactly what to do in this step |
| `Expect: …` / `Verify: …` | An extra check; the run fails if it's not true |
| `Capture: …` or `📷 name: …` | Take this screenshot (the name fixes the file name) |
| `Explain: …` | Context to include in the page |
| `Note: …` | A callout for behaviour readers wouldn't guess |
| `(optional)` after a step title | Shown as optional in the page; still performed |

A label can be inline (`Explain: dates depend on …`) or on its own line with the text
below it.
