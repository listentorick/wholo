# Signing in

Most scenarios run behind a login. The scenario's `persona` names who to be; the
`personas` entry in `scenario-docs.yml` says how to sign in as them. Signing in is
setup, not content: it never appears in the page or the screenshots unless a scenario is
*about* signing in.

## Config

```yaml
personas:
  distributor-owner:
    app: admin
    login:
      method: form                      # form (default) or manual
      path: /login                      # login page, relative to the app url
      username_env: DOCS_DISTRIBUTOR_OWNER_EMAIL
      password_env: DOCS_DISTRIBUTOR_OWNER_PASSWORD
      username_field: Email             # the field's label on screen (default: Email)
      password_field: Password          # default: Password
      submit: Sign in                   # the button's text (default: Sign in)
      signed_in_check: Delivery Profiles  # text only visible once signed in
    reader_role: an owner account
```

`signed_in_check` matters most: it's how the run knows sign-in worked, rather than
carrying on and screenshotting a login page. Pick something on the landing page that
only a signed-in user of this persona sees (a nav item, the account name). If it's
missing, ask the user for one and add it.

## Credentials

The config holds only *where* a value is, never the value. Values never go in the
config, a scenario, a page, a report or the chat, and you never echo, cat or log them.

Sources, per persona `login` (use whichever the config gives):

```yaml
login:
  username_env: DOCS_DISTRIBUTOR_OWNER_EMAIL        # an environment variable…
  password_env: DOCS_DISTRIBUTOR_OWNER_PASSWORD
  env_file: .env.docs                               # …optionally loaded from this git-ignored file
```

**Each shell command starts fresh**, so a variable set or a file loaded in one command
is gone in the next. Always resolve a credential **inside the same command that uses
it**, and only into the browser:

```bash
# env var, loaded from the env file in the same command
set -a; [ -f .env.docs ] && . ./.env.docs; set +a
agent-browser find label "Password" fill "$DOCS_DISTRIBUTOR_OWNER_PASSWORD"
```

Before filling, check the value exists without printing it, in the same way:
`set -a; [ -f .env.docs ] && . ./.env.docs; set +a; [ -n "$DOCS_DISTRIBUTOR_OWNER_PASSWORD" ] && echo set || echo MISSING`.
If it's missing, stop and tell the user which variable or file. Never fill an
empty value: the login fails confusingly, and repeated failures can lock the account.

Never `cat` or `Read` the env file, or run `printenv`: the output would put the values
in the conversation.

The accounts:
- Use **dedicated docs accounts** the seed creates (e.g. `docs-owner@example.test`),
  never a real person's login. If the seed resets users, these must be part of it, or
  sign-in fails straight after every reset.
- Ideally they exist only in your local or docs environment, so a leaked password is
  low-stakes. Treat them as secrets anyway: the same habits then hold if a run ever
  points somewhere real.

## method: form

After seeding (a reset can invalidate sessions and even users):

1. **Try the saved session first.** If `.scenario-docs/auth/<persona>.json` exists:
   ```bash
   agent-browser state load .scenario-docs/auth/<persona>.json
   agent-browser open <app url> && agent-browser wait --load networkidle
   agent-browser wait --text "<signed_in_check>"
   ```
   If the check text appears, you're signed in; skip to the scenario.
2. **Otherwise sign in.** Open the login page, then fill and submit in **one** command
   so the credentials are resolved where they're used (see Credentials):
   ```bash
   agent-browser open <app url><path> && agent-browser wait --load networkidle
   ```
   ```bash
   set -a; [ -f <env_file> ] && . ./<env_file>; set +a
   agent-browser find label "<username_field>" fill "$<username_env>" &&
   agent-browser find label "<password_field>" fill "$<password_env>" &&
   agent-browser find role button click --name "<submit>" &&
   agent-browser wait --load networkidle &&
   agent-browser wait --text "<signed_in_check>"
   ```
   If a `find label` misses (unlabelled inputs), `agent-browser snapshot -i` the form and
   fill by ref instead (`agent-browser fill @e3 "$<password_env>"`, still in one
   command with the loading); then add the correct labels to the config so the next run
   works first time. Don't snapshot again after filling: a snapshot can include field
   values.
3. **Confirm, then save:** the check text is visible and the URL isn't the login page.
   Then `agent-browser state save .scenario-docs/auth/<persona>.json` so later scenarios
   in the run can reuse it.

If sign-in fails, stop the scenario with a clear reason: an error on the login page
(wrong credentials, or the seed doesn't create this user), a CAPTCHA, or a second factor
prompt (switch this persona to `method: manual`). Don't retry repeatedly; lockouts
are easy to trigger.

## method: manual (SSO, MFA, magic links)

When the login can't be automated, the user signs in once by hand:

1. `agent-browser --headed open <app url><path>` and tell the user to sign in as
   `<persona>` in the window that opened.
2. `agent-browser wait --text "<signed_in_check>"` (allow a few minutes), then
   `agent-browser state save .scenario-docs/auth/<persona>.json`.
3. Later runs use step 1 of the form method. If the saved session has expired, or a seed
   has wiped it, ask the user to sign in again the same way.

## method: link (no account, e.g. a driver's delivery link)

Some users never sign in: they open a link someone sends them. The seed creates the link
and writes it to the seed output (`seeding.output` in the config) under the persona's
`output_key`.

1. Read the link from the seed output after seeding (and again after the re-seed before
   capture: the old link no longer works).
2. Open it in a fresh browser session (`agent-browser close` first). There's no
   `signed_in_check` and no saved state.
3. The link is a secret like a session: don't print it in the report or show it in a
   screenshot's address bar. The page tells the reader they get the link from whoever
   sends it (`reader_role`).

## method: email (no account yet, e.g. an invitation)

The reader starts from an email someone sent them, and usually creates their account
during the task. The seed sends the email and writes the address it went to in the seed
output under `output_key` (or the persona gives a fixed `address`).

1. Run the config's `mail.open` with that address and words from the email's subject
   (after seeding, and again after the
   re-seed before capture: the old email's link no longer works). Open the printed
   `file://` URL in a fresh browser session (`agent-browser close` first).
2. The email is the task's first screen: capture it like any other, and follow its link
   by clicking it. There's no `signed_in_check` before the task: signing up is part of
   it.
3. When a step has the reader choose a password, fill it from `password_env` (resolved
   in the same command, as under Credentials). Fill it after taking the shot of the form,
   or with the field showing dots only, never revealed.
4. When the app emails the reader mid-task (verify your email), run `mail.open` again
   for the same address with words from that email's subject as `{subject}` ("Verify"),
   open the new file and click its link: that's the reader opening their email. Always
   pass a subject once more than one email can be waiting: "newest" alone can pick the
   wrong one. Record the subject words in `route.md`.
5. The seed must remove the account the run creates, or the next run's sign-up is
   refused as a duplicate.

## Rules

- **Never screenshot the login page** with fields filled in, and don't capture or
  annotate anything until `signed_in_check` has passed.
- **One persona per browser session.** Before switching persona between scenarios,
  `agent-browser close` and start fresh, so cookies from the last account don't leak in.
- **Session files are secrets.** `.scenario-docs/auth/` holds live session tokens; it's
  inside `.scenario-docs/`, which must be in `.gitignore`. Check that before saving.
- **Signed out mid-run** (the page redirects to login): sign in again once, redo the
  current step, and mention it in the report. If it happens twice, fail the scenario.
