# ADR-081 — Accepting an Invitation: Prefilled Email, and Mailbox Approval for a Different Login

**Status**: Proposed
**Date**: 2026-11-12
**Deciders**: Rick Walsh

---

## Context

Two kinds of invitation give a person access to a business on Stocdup:

- a **portal invitation**: a distributor invites a trade customer's buyer (admin app → customer portal), `PortalInvitationsService.acceptInvite`;
- a **staff invitation**: an Owner invites a team member (admin app → admin app), `StaffInvitationAcceptService.accept`.

Both work the same way today:

1. `apps/api` emails a link carrying a random token (`/accept-invite?token=…`).
2. The person signs in or creates an account. Registration is Keycloak's page (themed, `apps/keycloak/themes/wholo/login/register.ftl`). The realm has `registrationAllowed` and `verifyEmail` on (`helm/wholo/templates/keycloak/realm-secret.yaml`), so a new account gets a second email, "Verify your email address", and cannot get a token until it is clicked.
3. Back on the accept page, the app calls `apps/api`. `KeycloakIdentityGuard` checks the Keycloak token's signature against the realm's keys and rejects it unless `email_verified` is true. The service then requires the token's `email` to equal the invited address, ignoring case, or returns 403 "This invitation was sent to a different email address". Only then does it create the user and membership (and, for a portal invitation, activate the trade relationship).

The email match (added in `291383d1`) closes a real hole: without it, the link is a bearer token, and anyone who gets it (forwarded, shared inbox, browser history, request logs; Keycloak's URLs carry it in `redirect_uri`) can register their own address and join the business. A trade customer member can place orders on the business's account, possibly on credit.

What the person experiences is poor:

- **They retype an address the system already knows.** The portal never tells Keycloak the invited address, so Work email is empty.
- **A mismatch fails late.** Keycloak's form accepts any address. A wrong one is discovered only after the account is created and verified, with a dead-end "sign out and continue" screen and an unusable account left behind.
- **Two emails** for a new account: the invitation, then Keycloak's verification.
- **No room for a shared inbox or a different login.** An invitation to `orders@company.com` can only be accepted by an account whose verified email is exactly that. With federated sign-in (Google, Microsoft; not configured today), Google decides the email, so the person behind a shared inbox could never accept with their own Google account.

Other things this has to respect:

- People also register **without** an invitation (distributor sign-up calls `kc.register` from the admin app), and they must still verify their email.
- `apps/api` owns organisations, memberships and roles (ADR-049); Keycloak only proves who someone is. No BFF holds a secret.
- The portal and admin apps are kept separate; shared behaviour is built in each.

## Decision

### 1. Prefill the invited address on registration (`login_hint`)

The accept pages pass the invited address to Keycloak as OIDC `login_hint` (`kc.register({ redirectUri, loginHint })` in keycloak-js). Keycloak 26.2 puts it in `register.formData.email`, which our theme already renders as the Work email value (checked locally against the running realm).

The field stays **editable**. Under decision 3, a different address is a legitimate choice, not an error. The prefill makes the common path (same address) need no typing.

To know the address, the accept page needs a new lookup in `apps/api`:

- takes the invitation token in the request body (never the URL path, so it stays out of access logs), with no sign-in;
- for a pending, unexpired invitation returns only what the page shows: invited email, the inviting business's name, the invited business's name (portal) and the expiry; otherwise 404 or 410, as accept does;
- rate-limited;
- one for each invitation type. Staff tokens are stored hashed, so that lookup hashes first, as accept does.

Returning the address to a token holder discloses nothing new: the link arrived in an email to that address.

### 2. Same address: accept as today

If the signed-in account's verified email equals the invited address, acceptance runs immediately, unchanged. Keycloak's verification has already proved the mailbox.

### 3. Different address: the invited mailbox approves the account

If the signed-in account's verified email differs from the invited address, `apps/api` does not refuse. It asks the invited mailbox to approve this account:

1. The accept page offers: "This invitation was sent to **orders@company.com**. We'll send a code there to confirm you can use it."
2. `apps/api` creates an **invitation claim** for (invitation, signed-in user) and emails a code to the **invited** address, through the outbox and `wholo-worker` like the invitation itself.
3. The person enters the code on the accept page, in the same signed-in session.
4. `apps/api` checks the code against the claim, then runs the existing acceptance for the signed-in user and marks the invitation used.

Rules for the code:

- single use, about 10 minutes, about 5 attempts, then a new code is needed;
- stored hashed; only the claim's own user can confirm it, so a code requested in one session is useless in another;
- sending is rate-limited per invitation and per user; a "send a new code" action replaces the previous claim;
- the email names the account asking: "**rick@company.com** wants to join **The Rusty Anchor** on Stocdup to order from **Vine & Co**. If that's you, enter this code. Don't share it with anyone."

The person's own account still has a verified email: Keycloak verifies a new password account as today, and a federated account's email comes from a provider the realm trusts.

This replaces the dead-end "This invitation was sent to a different email address" screen.

### 4. Tell people when an invitation is accepted

When any invitation is accepted, `apps/api` emails the **invited address**: "Rick Walsh (rick@company.com) joined The Rusty Anchor on Stocdup. Not expected? Contact Vine & Co." The inviting business sees who accepted and when on the record the invitation was sent from. A misuse is noticed instead of silent.

### 5. Keycloak's own verification is unchanged

`verifyEmail` stays on for the whole realm. A new password account gets Keycloak's verification email whether or not it came from an invitation. No Keycloak extension, no realm change.

### Applies to both invitation types

Portal and staff invitations get decisions 1–4. Each app builds its own accept-page changes (portal and admin are not coupled). For staff invitations the existing rule "one identity, one distributor; a customer login can't double as staff" still applies after the code is confirmed.

## What a person sees

| Situation | Emails | Steps after clicking the invitation |
|---|---|---|
| Existing account, invited address | 1 | Sign in (or already signed in) → in |
| New account, invited address | 2 (invitation, verify) | Create account (email prefilled) → verify → in |
| Existing or federated account, other address | 2 (invitation, code) | Sign in → enter code → in |
| New password account, other address | 3 (invitation, verify, code) | Create account (changes email) → verify → enter code → in |

Plus the acceptance notice to the invited address in every case.

## Alternatives considered

**A. Keep the current flow.** Strongest guarantee, but the retyping, late failure and dead end remain, and shared inboxes and federated sign-in with another address can't be supported. Rejected.

**B. Prefill and lock only.** Fixes retyping and the late failure cheaply, but the lock is cosmetic (Keycloak's form accepts any posted address; the server check is what decides), and it gives no way to accept with a different login. Kept as decision 1, without the lock.

**C. Create the Keycloak user when the invitation is sent.** `apps/api` creates the user through the admin API and has Keycloak email a set-password link, redirecting to the accept page; acceptance is unchanged. Rejected:
- whoever clicks the link first sets the password, so a forwarded or leaked link hands over the account;
- every unaccepted, expired or mistyped invitation leaves a Keycloak account to clean up, and until then the address is "taken" if its owner signs up another way;
- the set-password email is Keycloak's own (we believe the admin API only sends the link, never returns it), so our branded invitation email is either lost or a second email is sent;
- an invited person who already has an account still needs the sign-in path;
- federated sign-in needs a custom first-login flow that auto-links Google to the pre-created user, or Keycloak sends a "confirm linking" email or creates a second user.

**D. A Keycloak extension that knows about invitations.** A custom registration step validates the token, locks the email, marks it verified and skips verification: one email, no typing. Rejected for now: Java code in Keycloak to maintain across upgrades, and a new trust path (Keycloak calling `apps/api`, or a key shared between them). It also accepts "link = mailbox", which is weaker than decision 3.

**E. Turn off realm verification; `apps/api` decides who is verified.** Accept takes an unverified token when its email matches the invitation, then marks it verified via the admin API; sign-ups without an invitation get a verification email triggered by `apps/api`. Removes the second email for invited people. Rejected for now: it removes a realm-wide guarantee that other code (and any future automatic account linking for federated sign-in) relies on, splits verification between Keycloak and `apps/api`, and accepts "link = mailbox". Can be revisited on top of this decision if the verification email proves to be a real barrier.

**F. Keycloak Organizations.** Keycloak 26's organizations and invitations handle invite-driven registration and federated sign-in natively. Rejected: who belongs to which organisation would then live in Keycloak as well as `apps/api`, against ADR-049 and the polymorphic Organisation model, and the invitation email would be Keycloak's.

**Accept with any verified login, no code ("link = mailbox").** What C, D, E and F amount to for a different address. Rejected in favour of decision 3: a forwarded or leaked link would be enough to join a business that can order on credit.

## Consequences

- An invited person no longer types their address, and a different address is a path rather than an error. Shared inboxes and federated sign-in with a personal address work.
- Security is at least as strong as today: joining always needs control of the invited mailbox, either as your verified login or by entering a code sent there at the moment of accepting. A leaked link alone is not enough.
- New risk: the reader of the invited mailbox being talked into passing on a code. Handled by naming the requesting account in the code email, the "don't share" wording, short expiry, and the acceptance notice.
- A new account still gets Keycloak's verification email; a new account under a different address gets three emails in all.
- One invitation admits one account. A business that wants several people ordering needs one invitation each (or a later feature for a business to invite its colleagues).
- New in `apps/api`: an unauthenticated invitation lookup per invitation type; an invitation-claim record with hashed code, expiry and attempt count; send-code and confirm-code endpoints; the code and acceptance-notice emails (MJML, through the outbox). New in portal and admin: prefill on Create account, and a code-entry step. Each needs unit tests, and integration tests for the claim rules (wrong user, expired, too many attempts, reused code).
- The help pages for accepting invitations and inviting customers or team members change: the address is prefilled, and a different address is allowed with a code.
- Federated sign-in, when added, needs no change to invitations. Its provider's Trust Email setting decides whether its accounts count as verified.

## To verify while building

- Whether the theme can tell a `login_hint` prefill from a value redisplayed after a form error (matters only for wording, since the field stays editable).
- Whether Keycloak's account console lets users change their email; if so, an email change must re-verify (Keycloak's update-email action), or decision 2's "verified email" is weaker than assumed.
- The behaviour when a signed-in person already belongs to another business (one login, several trade customers) or is distributor staff accepting a portal invitation. Today both are accepted; decide whether that is intended before building on it.
