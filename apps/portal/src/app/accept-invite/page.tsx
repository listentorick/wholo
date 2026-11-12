'use client';

import { Suspense, useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { invitationsApi, ApiError } from '@wholo/api-client';
import type { PortalInvitationSummary } from '@wholo/types';

type Status = 'loading' | 'unauthenticated' | 'code' | 'error' | 'accepted' | 'already-accepted';

const font = 'system-ui, sans-serif';
const primaryButton: React.CSSProperties = {
  display: 'block', width: '100%', padding: '12px 24px',
  backgroundColor: 'hsl(var(--color-primary))', color: '#fff', border: 'none',
  borderRadius: '8px', fontFamily: font, fontSize: '15px', fontWeight: 600, cursor: 'pointer',
};
const linkButton: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, color: 'hsl(var(--color-primary))',
  fontFamily: font, fontSize: '14px', fontWeight: 500, cursor: 'pointer',
};
const bodyText: React.CSSProperties = { fontFamily: font, fontSize: '14px', color: '#6b7280', lineHeight: '1.6' };
const strong: React.CSSProperties = { color: '#111', fontWeight: 600 };

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
  const invited = invitedEmail ? <strong style={strong}>{invitedEmail}</strong> : 'the invited address';

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

  const confirmDisabled = busy || code.replace(/\s+/g, '').length !== 6;

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: '24px' }}>
      <div style={{ maxWidth: '400px', width: '100%', textAlign: 'center' }}>
        <StocdupLogo />
        <h1 style={{ fontFamily: font, fontSize: '20px', fontWeight: 700, color: '#111', margin: '0 0 8px' }}>
          Confirm you can use this invitation
        </h1>
        <p style={{ ...bodyText, margin: '0 0 12px' }}>
          This invitation was sent to {invited}.
          {signedInAs ? <> You&apos;re signed in as <strong style={strong}>{signedInAs}</strong>.</> : null}
        </p>
        {!sent ? (
          <>
            <p style={{ ...bodyText, margin: '0 0 24px' }}>
              To use this account, we&apos;ll email a code to {invited}. Whoever reads that mailbox can approve it.
            </p>
            {error ? <p role="alert" style={{ ...bodyText, color: '#dc2626', margin: '0 0 16px' }}>{error}</p> : null}
            <button type="button" style={{ ...primaryButton, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={send}>
              Email me a code
            </button>
          </>
        ) : (
          <form onSubmit={confirm} style={{ textAlign: 'left' }}>
            <p style={{ ...bodyText, margin: '0 0 20px', textAlign: 'center' }}>
              We emailed a 6-digit code to {invited}. It expires in 10 minutes.
            </p>
            <label htmlFor="invite-code" style={{ display: 'block', fontFamily: font, fontSize: '14px', fontWeight: 500, color: '#111', marginBottom: '6px' }}>
              Code
            </label>
            <input
              id="invite-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              style={{
                display: 'block', width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                border: '1px solid #d1d5db', borderRadius: '8px', fontFamily: font,
                fontSize: '18px', letterSpacing: '0.3em', color: '#111',
              }}
            />
            {error ? <p role="alert" style={{ ...bodyText, color: '#dc2626', margin: '12px 0 0' }}>{error}</p> : null}
            {notice ? <p role="status" style={{ ...bodyText, margin: '12px 0 0' }}>{notice}</p> : null}
            <button type="submit" style={{ ...primaryButton, marginTop: '24px', opacity: confirmDisabled ? 0.6 : 1 }} disabled={confirmDisabled}>
              Confirm
            </button>
            <div style={{ marginTop: '12px', textAlign: 'center' }}>
              <button type="button" style={linkButton} disabled={busy} onClick={send}>Send a new code</button>
            </div>
          </form>
        )}
        <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
          <button type="button" style={linkButton} onClick={onUseInvitedAddress}>
            Sign out and use {invitedEmail ?? 'the invited address'} instead
          </button>
        </div>
      </div>
    </div>
  );
}

function StocdupLogo() {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', marginBottom: '24px' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logos/stocdup-logo-only.png" alt="" style={{ width: '20px', height: '20px', flexShrink: 0 }} />
      <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '18px', fontWeight: 800, letterSpacing: '-0.045em', color: 'hsl(var(--color-text))' }}>
        stocd<span style={{ color: 'hsl(var(--color-primary))' }}>up</span>
      </span>
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
      <div style={{ textAlign: 'center' }}>
        <StocdupLogo />
        <div style={{ width: '24px', height: '24px', border: '2px solid #e5e7eb', borderTopColor: 'hsl(var(--color-primary))', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
        <p style={{ fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#6b7280', marginTop: '16px' }}>{label}</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

const INVITE_TOKEN_STORAGE_KEY = 'wholo_pending_invite_token';
const EXPIRED_MESSAGE = 'This invitation link has expired or is no longer valid. Please ask your distributor to send a new invitation.';
// Holds the invite token this tab has already asked Keycloak about (see the
// session check in the effect below), so the check runs once per link per tab.
const SESSION_CHECKED_STORAGE_KEY = 'wholo_invite_session_checked';

function inviteUrl(token: string | null): string {
  return `${window.location.origin}/accept-invite${token ? `?token=${token}` : ''}`;
}

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { accessToken, identityEmail, isLoading, loginWithRedirect, registerWithRedirect, logoutWithRedirect, refreshSession } = useAuth();

  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  // What the invitation says (invited address, who sent it), looked up without
  // sign-in. `null` until known; 'unavailable' if the lookup itself failed.
  const [summary, setSummary] = useState<PortalInvitationSummary | 'gone' | 'unavailable' | null>(null);
  const checkingSession = useRef(false);

  // Token comes from the URL, or from sessionStorage after a Keycloak redirect
  // (keycloak-js cleans up its own params but can also strip non-OAuth query params
  // depending on the Keycloak version and redirect mode).
  const urlToken = searchParams.get('token');
  const token = urlToken ?? (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(INVITE_TOKEN_STORAGE_KEY) : null);

  useEffect(() => {
    if (!token) return;
    let live = true;
    invitationsApi.lookup(token)
      .then((found) => live && setSummary(found))
      .catch((err: unknown) => {
        if (!live) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
          sessionStorage.removeItem(INVITE_TOKEN_STORAGE_KEY);
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

  const finishAccept = useCallback(async (result: { distributorSlug: string | null }) => {
    sessionStorage.removeItem(INVITE_TOKEN_STORAGE_KEY);
    // The accept call just created this user's Wholo account — re-fetch the
    // session so the app doesn't land on a stale "couldn't sign in" state left
    // over from the root AuthProvider's own /auth/me fetch racing this one.
    await refreshSession();
    setStatus('accepted');
    router.replace(result.distributorSlug ? `/${result.distributorSlug}` : '/');
  }, [refreshSession, router]);

  useEffect(() => {
    if (isLoading) return;

    if (!token) {
      setErrorMessage('Invalid invite link. Please check the link in your email and try again.');
      setStatus('error');
      return;
    }

    if (!accessToken) {
      if (checkingSession.current) return;
      // The page can't tell on its own whether someone is already signed in to
      // Keycloak in this browser, so ask once, silently (prompt=none comes
      // straight back with no screen). This must happen before "Create account"
      // is offered: opening Keycloak's registration page under another
      // account's session leaves the browser unable to sign in as anyone else
      // until that session is ended.
      if (sessionStorage.getItem(SESSION_CHECKED_STORAGE_KEY) !== token) {
        checkingSession.current = true;
        sessionStorage.setItem(INVITE_TOKEN_STORAGE_KEY, token);
        sessionStorage.setItem(SESSION_CHECKED_STORAGE_KEY, token);
        loginWithRedirect(inviteUrl(token), { prompt: 'none' });
        return;
      }
      // Nobody is signed in — let the user choose to create an account or sign in.
      setStatus('unauthenticated');
      return;
    }

    sessionStorage.removeItem(INVITE_TOKEN_STORAGE_KEY);

    invitationsApi.accept(token)
      .then(finishAccept)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 409) {
          setStatus('already-accepted');
          router.replace('/');
          return;
        }
        if (err instanceof ApiError && err.status === 403) {
          // Signed in with another address: the invited mailbox approves this
          // account with a code. Keep the token: signing out and back in with
          // the invited address must still work too.
          sessionStorage.setItem(INVITE_TOKEN_STORAGE_KEY, token);
          setStatus('code');
          return;
        }
        if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
          setErrorMessage(EXPIRED_MESSAGE);
        } else {
          setErrorMessage('Something went wrong. Please try again or contact support.');
        }
        setStatus('error');
      });
  }, [isLoading, accessToken, token, router, finishAccept, loginWithRedirect]);

  const invitedEmail = invitation?.invitedEmail;

  const handleCreateAccount = useCallback(() => {
    if (token) sessionStorage.setItem(INVITE_TOKEN_STORAGE_KEY, token);
    registerWithRedirect(inviteUrl(token), invitedEmail ? { loginHint: invitedEmail } : undefined);
  }, [token, invitedEmail, registerWithRedirect]);

  const handleSignIn = useCallback(() => {
    if (token) sessionStorage.setItem(INVITE_TOKEN_STORAGE_KEY, token);
    loginWithRedirect(inviteUrl(token), invitedEmail ? { loginHint: invitedEmail } : undefined);
  }, [token, invitedEmail, loginWithRedirect]);

  const handleConfirmCode = useCallback(async (code: string) => {
    if (!token) return;
    let result: { distributorSlug: string | null };
    try {
      result = await invitationsApi.accept(token, code);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setStatus('already-accepted');
        router.replace('/');
        return;
      }
      if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
        sessionStorage.removeItem(INVITE_TOKEN_STORAGE_KEY);
        setErrorMessage(EXPIRED_MESSAGE);
        setStatus('error');
        return;
      }
      throw err; // a code problem: the step shows the message
    }
    await finishAccept(result);
  }, [token, router, finishAccept]);

  const handleSignOut = useCallback(() => {
    logoutWithRedirect(inviteUrl(token));
  }, [token, logoutWithRedirect]);

  // A dead invitation wins over whatever the sign-in check decided, whichever of
  // the two finished first (otherwise an expired link could offer sign-up).
  const gone = summary === 'gone' && status !== 'accepted' && status !== 'already-accepted';
  const shownStatus: Status = gone ? 'error' : status;
  const shownError = gone ? EXPIRED_MESSAGE : errorMessage;

  // Wait for the lookup so the landing can name the invited address.
  if (shownStatus === 'loading' || shownStatus === 'accepted' || shownStatus === 'already-accepted' || (shownStatus === 'unauthenticated' && summary === null)) {
    const loadingLabel = accessToken ? 'Setting up your account…' : 'Loading…';
    const done = shownStatus === 'accepted' || shownStatus === 'already-accepted';
    return <Spinner label={done ? 'All done! Redirecting…' : loadingLabel} />;
  }

  if (shownStatus === 'code' && token) {
    return (
      <CodeStep
        invitedEmail={invitedEmail ?? null}
        signedInAs={identityEmail}
        onSend={() => invitationsApi.sendCode(token)}
        onConfirm={handleConfirmCode}
        onUseInvitedAddress={handleSignOut}
      />
    );
  }

  if (shownStatus === 'unauthenticated') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: '24px' }}>
        <div style={{ maxWidth: '400px', textAlign: 'center' }}>
          <StocdupLogo />
          <h1 style={{ fontFamily: 'system-ui, sans-serif', fontSize: '22px', fontWeight: 700, color: '#111', margin: '0 0 12px' }}>
            {invitation ? <>Order from {invitation.distributorName} on Stocdup</> : <>You&apos;ve been invited to join Stocdup</>}
          </h1>
          {invitation ? (
            <p style={{ ...bodyText, margin: '0 0 12px' }}>
              {invitation.distributorName} invited <strong style={strong}>{invitation.invitedEmail}</strong> to order for {invitation.customerName}.
            </p>
          ) : null}
          <p style={{ ...bodyText, margin: '0 0 12px' }}>
            Create an account or sign in to accept your invitation and start ordering.
          </p>
          <p style={{ ...bodyText, margin: '0 0 28px' }}>
            Using another email address? We&apos;ll send a code to the invited address to confirm it&apos;s you.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              type="button"
              onClick={handleCreateAccount}
              style={{
                display: 'block', width: '100%', padding: '12px 24px',
                backgroundColor: 'hsl(var(--color-primary))', color: '#fff', border: 'none',
                borderRadius: '8px', fontFamily: 'system-ui, sans-serif',
                fontSize: '15px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              Create account
            </button>
            <button
              type="button"
              onClick={handleSignIn}
              style={{
                display: 'block', width: '100%', padding: '12px 24px',
                backgroundColor: 'transparent', color: '#374151',
                border: '1px solid #d1d5db', borderRadius: '8px',
                fontFamily: 'system-ui, sans-serif', fontSize: '15px',
                fontWeight: 500, cursor: 'pointer',
              }}
            >
              Sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: '24px' }}>
      <div style={{ maxWidth: '400px', textAlign: 'center' }}>
        <StocdupLogo />
        <div style={{
          width: '48px', height: '48px', borderRadius: '50%',
          backgroundColor: '#fef2f2', display: 'flex', alignItems: 'center',
          justifyContent: 'center', margin: '0 auto 16px',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <h1 style={{ fontFamily: 'system-ui, sans-serif', fontSize: '20px', fontWeight: 700, color: '#111', margin: '0 0 8px' }}>
          Invitation not valid
        </h1>
        <p style={{ fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#6b7280', lineHeight: '1.5', margin: 0 }}>
          {shownError}
        </p>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<Spinner label="Loading…" />}>
      <AcceptInviteContent />
    </Suspense>
  );
}
