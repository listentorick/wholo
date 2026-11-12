'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError, adminTeamApi } from '@wholo/admin-api-client';
import type { AcceptedStaffInvitation, StaffInvitationSummary } from '@wholo/types';
import { RoleChips } from '@/components/team/RoleChip';
import { useAuth } from '@/lib/auth-context';
import {
  clearPendingInviteToken,
  getPendingInviteToken,
  isSessionCheckedFor,
  markSessionCheckedFor,
  setPendingInviteToken,
} from '@/lib/pending-invite';

type View =
  | { name: 'loading' }
  | { name: 'landing' }
  | { name: 'welcome'; result: AcceptedStaffInvitation }
  | { name: 'code' }
  | { name: 'invalid' }
  | { name: 'conflict'; message: string }
  | { name: 'error' };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas px-6 py-12">
      <div className="inline-flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/stocdup-logo-only.png" alt="" className="h-9 w-9 shrink-0" />
        <span className="text-[18px] font-extrabold tracking-[-0.045em] text-text">
          stocd<span className="text-primary">up</span>
        </span>
      </div>
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-8">{children}</div>
    </div>
  );
}

function Icon({ tone, children }: { tone: 'amber' | 'red' | 'green' | 'blue'; children: React.ReactNode }) {
  const tones = { amber: 'bg-[#fef9c3] text-[#a16207]', red: 'bg-red-50 text-red-600', green: 'bg-[#dcfce7] text-[#15803d]', blue: 'bg-primary/10 text-primary' };
  return (
    <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-full ${tones[tone]}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5" aria-hidden>{children}</svg>
    </div>
  );
}

const primaryBtn = 'block w-full rounded-md bg-primary px-4 py-2.5 text-center text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover';
const neutralBtn = 'block w-full rounded-md border border-border px-4 py-2.5 text-center text-sm font-medium text-text transition-colors hover:bg-border/20';
const linkBtn = 'text-sm font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50';

/** The message `apps/api` gives for a code problem (wrong, expired, sent too recently), else a generic one. */
function codeErrorMessage(err: unknown): string {
  if (err instanceof ApiError && [400, 422, 429, 503].includes(err.status) && err.message) return err.message;
  return 'Something went wrong. Try again in a moment.';
}

/**
 * Signed in with another address than the invited one (ADR-081): the invited
 * mailbox approves this account with a one-time code.
 */
function CodeStep({
  invitedEmail,
  signedInAs,
  onSend,
  onConfirm,
  onUseInvitedAddress,
}: {
  invitedEmail: string | null;
  signedInAs: string | null;
  onSend: () => Promise<unknown>;
  onConfirm: (code: string) => Promise<void>;
  onUseInvitedAddress: () => void;
}) {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const invited = invitedEmail ? <strong className="font-semibold text-text">{invitedEmail}</strong> : 'the invited address';

  const send = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await onSend();
      if (sent) setNotice('We sent a new code. Use the newest one.');
      setSent(true);
      setCode('');
    } catch (err) {
      setError(codeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await onConfirm(code);
    } catch (err) {
      setError(codeErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Shell>
      <Icon tone="blue"><path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z" /><polyline points="22,6 12,13 2,6" /></Icon>
      <h1 className="text-xl font-semibold leading-snug text-text">Confirm you can use this invitation</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        This invitation was sent to {invited}.
        {signedInAs ? <> You&rsquo;re signed in as <strong className="font-semibold text-text">{signedInAs}</strong>.</> : null}
      </p>
      {!sent ? (
        <>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            To join with this account, we&rsquo;ll email a code to {invited}. Whoever reads that mailbox can approve it.
          </p>
          {error ? <p role="alert" className="mt-4 text-sm text-red-600">{error}</p> : null}
          <div className="mt-6">
            <button type="button" className={primaryBtn} disabled={busy} onClick={send}>Email me a code</button>
          </div>
        </>
      ) : (
        <form onSubmit={confirm}>
          <p className="mt-3 text-sm leading-relaxed text-muted">We emailed a 6-digit code to {invited}. It expires in 10 minutes.</p>
          <label htmlFor="invite-code" className="mt-5 block text-sm font-medium text-text">Code</label>
          <input
            id="invite-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-1.5 block w-full rounded-md border border-border px-3 py-2.5 text-lg tracking-[0.3em] text-text focus:border-primary focus:outline-none"
          />
          {error ? <p role="alert" className="mt-3 text-sm text-red-600">{error}</p> : null}
          {notice ? <p role="status" className="mt-3 text-sm text-muted">{notice}</p> : null}
          <div className="mt-6">
            <button type="submit" className={primaryBtn} disabled={busy || code.replace(/\s+/g, '').length !== 6}>Confirm</button>
          </div>
          <div className="mt-3 text-center">
            <button type="button" className={linkBtn} disabled={busy} onClick={send}>Send a new code</button>
          </div>
        </form>
      )}
      <div className="mt-6 border-t border-border pt-4 text-center">
        <button type="button" className={linkBtn} onClick={onUseInvitedAddress}>
          Sign out and use {invitedEmail ?? 'the invited address'} instead
        </button>
      </div>
    </Shell>
  );
}

function AcceptInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken, isLoading, identity, identityEmail, login, register, logoutWithRedirect, refreshSession } = useAuth();
  const [view, setView] = useState<View>({ name: 'loading' });
  // What the invitation says (invited address, who sent it), looked up without
  // sign-in. `null` until known; 'gone' if there is no open invitation for the
  // token; 'unavailable' if the lookup itself failed.
  const [summary, setSummary] = useState<StaffInvitationSummary | 'gone' | 'unavailable' | null>(null);
  const started = useRef(false);
  const checkingSession = useRef(false);

  // The link's own token, or the copy parked before the Keycloak round trip.
  const token = searchParams.get('token') ?? getPendingInviteToken();

  useEffect(() => {
    if (!token) return;
    let live = true;
    adminTeamApi
      .lookupInvitation(token)
      .then((found) => live && setSummary(found))
      .catch((err: unknown) => {
        if (!live) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
          clearPendingInviteToken();
          setSummary('gone');
          return;
        }
        // Anything else: carry on without it; the invitation's own checks still run on accept.
        setSummary('unavailable');
      });
    return () => {
      live = false;
    };
  }, [token]);

  const invitation = summary && summary !== 'unavailable' && summary !== 'gone' ? summary : null;

  const welcome = useCallback(
    async (result: AcceptedStaffInvitation) => {
      clearPendingInviteToken();
      // The accept just created this person's membership — refresh the
      // session so the app opens as them instead of on a stale "no company".
      await refreshSession();
      setView({ name: 'welcome', result });
    },
    [refreshSession],
  );

  useEffect(() => {
    if (isLoading) return;
    if (!token) {
      setView({ name: 'invalid' });
      return;
    }
    if (!accessToken) {
      setPendingInviteToken(token);
      if (checkingSession.current) return;
      // The page can't tell on its own whether someone is already signed in
      // to Keycloak in this browser (e.g. another account in this same app),
      // so ask once, silently: prompt=none comes straight back with no screen.
      // This must happen before "Create your account" is offered — opening
      // Keycloak's sign-up under another account's session leaves the browser
      // unable to sign in as anyone else until that session is ended.
      if (!isSessionCheckedFor(token)) {
        checkingSession.current = true;
        markSessionCheckedFor(token);
        login(`/accept-invite?token=${encodeURIComponent(token)}`, { prompt: 'none' });
        return;
      }
      setView({ name: 'landing' });
      return;
    }
    if (started.current) return; // one accept per page load — a second would 409
    started.current = true;

    adminTeamApi
      .acceptInvitation(token)
      .then(welcome)
      .catch((err: unknown) => {
        // Signed in with another address: the invited mailbox approves this
        // account with a code. Keep the token — signing out and back in with
        // the invited address must still work too.
        if (err instanceof ApiError && err.status === 403) return setView({ name: 'code' });
        // Terminal outcomes: the token is spent or dead, so stop carrying it.
        if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
          clearPendingInviteToken();
          return setView({ name: 'invalid' });
        }
        if (err instanceof ApiError && err.status === 409) {
          clearPendingInviteToken();
          return setView({ name: 'conflict', message: err.message });
        }
        // Anything else is transient (network, 5xx): keep the token, allow a retry.
        started.current = false;
        setView({ name: 'error' });
      });
  }, [isLoading, accessToken, token, welcome, login]);

  const signedInAs = identity?.email ?? identityEmail;
  const comeBack = useCallback(() => `/accept-invite${token ? `?token=${encodeURIComponent(token)}` : ''}`, [token]);

  // A dead invitation wins over whatever the sign-in check decided, whichever of
  // the two finished first (otherwise an expired link could offer sign-up).
  const shown: View = summary === 'gone' && view.name !== 'welcome' ? { name: 'invalid' } : view;

  if (shown.name === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div role="status" aria-label="Loading" className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  // Wait for the lookup so the landing can name the invited address.
  if (shown.name === 'landing' && summary === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div role="status" aria-label="Loading" className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (shown.name === 'landing') {
    const hint = invitation ? { loginHint: invitation.invitedEmail } : undefined;
    return (
      <Shell>
        <Icon tone="blue"><path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z" /><polyline points="22,6 12,13 2,6" /></Icon>
        <h1 className="text-xl font-semibold leading-snug text-text">
          {invitation ? <>Join {invitation.distributorName} on Stocdup</> : <>You&rsquo;ve been invited to join a team on Stocdup</>}
        </h1>
        {invitation ? (
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {invitation.inviterName} invited <strong className="font-semibold text-text">{invitation.invitedEmail}</strong> to join the team.
          </p>
        ) : null}
        <p className="mt-3 text-sm leading-relaxed text-muted">Create a Stocdup account, or sign in if you already have one, to accept the invitation.</p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Using another email address? We&rsquo;ll send a code to the invited address to confirm it&rsquo;s you.
        </p>
        <div className="mt-6 space-y-2">
          <button type="button" className={primaryBtn} onClick={() => register(comeBack(), hint)}>Create your account</button>
          <button type="button" className={neutralBtn} onClick={() => login(comeBack(), hint)}>I already have an account</button>
        </div>
        <p className="mt-4 text-center text-xs text-muted">Wasn&rsquo;t expecting this? You can ignore the email.</p>
      </Shell>
    );
  }

  if (shown.name === 'welcome') {
    return (
      <Shell>
        <Icon tone="green"><path d="M22 11.1V12a10 10 0 11-5.9-9.1" /><polyline points="22 4 12 14 9 11" /></Icon>
        <h1 className="text-xl font-semibold leading-snug text-text">You&rsquo;re in. Welcome to {shown.result.distributorName}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">Your account is ready and your email is verified. You have access as:</p>
        <div className="mt-2.5"><RoleChips roles={shown.result.roles} /></div>
        <div className="mt-6">
          <button type="button" className={primaryBtn} onClick={() => router.replace('/')}>Open Stocdup</button>
        </div>
      </Shell>
    );
  }

  if (shown.name === 'code' && token) {
    return (
      <CodeStep
        invitedEmail={invitation?.invitedEmail ?? null}
        signedInAs={signedInAs ?? null}
        onSend={() => adminTeamApi.sendInvitationCode(token)}
        onConfirm={async (code) => {
          let result: AcceptedStaffInvitation;
          try {
            result = await adminTeamApi.acceptInvitation(token, code);
          } catch (err) {
            if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
              clearPendingInviteToken();
              setView({ name: 'invalid' });
              return;
            }
            if (err instanceof ApiError && err.status === 409) {
              clearPendingInviteToken();
              setView({ name: 'conflict', message: err.message });
              return;
            }
            throw err; // a code problem: the step shows the message
          }
          await welcome(result);
        }}
        onUseInvitedAddress={() => logoutWithRedirect(comeBack())}
      />
    );
  }

  if (shown.name === 'conflict') {
    return (
      <Shell>
        <Icon tone="amber"><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="12.5" /><circle cx="12" cy="16" r="0.6" fill="currentColor" /></Icon>
        <h1 className="text-xl font-semibold leading-snug text-text">This invitation can&rsquo;t be used</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">{shown.message}</p>
        <div className="mt-6"><button type="button" className={neutralBtn} onClick={() => router.replace('/')}>Go to Stocdup</button></div>
      </Shell>
    );
  }

  if (shown.name === 'error') {
    return (
      <Shell>
        <Icon tone="red"><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="12.5" /><circle cx="12" cy="16" r="0.6" fill="currentColor" /></Icon>
        <h1 className="text-xl font-semibold leading-snug text-text">Something went wrong</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">We couldn&rsquo;t accept the invitation just now. Reload the page to try again.</p>
        <div className="mt-6"><button type="button" className={neutralBtn} onClick={() => window.location.reload()}>Reload</button></div>
      </Shell>
    );
  }

  // 'invalid': expired, withdrawn and unknown links all get one answer.
  return (
    <Shell>
      <Icon tone="red"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></Icon>
      <h1 className="text-xl font-semibold leading-snug text-text">This invitation is no longer valid</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">It may have expired or been withdrawn. Ask the person who invited you to send a new one.</p>
      <p className="mt-3 text-sm leading-relaxed text-muted">Invitations are valid for 7 days.</p>
      <div className="mt-6"><button type="button" className={neutralBtn} onClick={() => login('/')}>Go to sign in</button></div>
    </Shell>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteContent />
    </Suspense>
  );
}
