'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError, adminTeamApi } from '@wholo/admin-api-client';
import type { AcceptedStaffInvitation } from '@wholo/types';
import { RoleChips } from '@/components/team/RoleChip';
import { useAuth } from '@/lib/auth-context';
import { clearPendingInviteToken, getPendingInviteToken, setPendingInviteToken } from '@/lib/pending-invite';

type View =
  | { name: 'loading' }
  | { name: 'landing' }
  | { name: 'welcome'; result: AcceptedStaffInvitation }
  | { name: 'wrong-email' }
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

function AcceptInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken, isLoading, identity, login, register, logout, refreshSession } = useAuth();
  const [view, setView] = useState<View>({ name: 'loading' });
  const started = useRef(false);

  // The link's own token, or the copy parked before the Keycloak round trip.
  const token = searchParams.get('token') ?? getPendingInviteToken();

  useEffect(() => {
    if (isLoading) return;
    if (!token) {
      setView({ name: 'invalid' });
      return;
    }
    if (!accessToken) {
      setPendingInviteToken(token);
      setView({ name: 'landing' });
      return;
    }
    if (started.current) return; // one accept per page load — a second would 409
    started.current = true;

    adminTeamApi
      .acceptInvitation(token)
      .then(async (result) => {
        clearPendingInviteToken();
        // The accept just created this person's membership — refresh the
        // session so the app opens as them instead of on a stale "no company".
        await refreshSession();
        setView({ name: 'welcome', result });
      })
      .catch((err: unknown) => {
        // Wrong email: keep the token — after signing out and back in with the
        // right address, the same invitation must still work.
        if (err instanceof ApiError && err.status === 403) return setView({ name: 'wrong-email' });
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
  }, [isLoading, accessToken, token, refreshSession]);

  const comeBack = useCallback(() => `/accept-invite${token ? `?token=${encodeURIComponent(token)}` : ''}`, [token]);

  if (view.name === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div role="status" aria-label="Loading" className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (view.name === 'landing') {
    return (
      <Shell>
        <Icon tone="blue"><path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z" /><polyline points="22,6 12,13 2,6" /></Icon>
        <h1 className="text-xl font-semibold leading-snug text-text">You&rsquo;ve been invited to join a team on Stocdup</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">Create a Stocdup account, or sign in if you already have one, to accept the invitation.</p>
        <p className="mt-3 text-sm leading-relaxed text-muted">Use the email address this invitation was sent to. You&rsquo;ll be asked to verify it.</p>
        <div className="mt-6 space-y-2">
          <button type="button" className={primaryBtn} onClick={() => register(comeBack())}>Create your account</button>
          <button type="button" className={neutralBtn} onClick={() => login(comeBack())}>I already have an account</button>
        </div>
        <p className="mt-4 text-center text-xs text-muted">Wasn&rsquo;t expecting this? You can ignore the email.</p>
      </Shell>
    );
  }

  if (view.name === 'welcome') {
    return (
      <Shell>
        <Icon tone="green"><path d="M22 11.1V12a10 10 0 11-5.9-9.1" /><polyline points="22 4 12 14 9 11" /></Icon>
        <h1 className="text-xl font-semibold leading-snug text-text">You&rsquo;re in. Welcome to {view.result.distributorName}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">Your account is ready and your email is verified. You have access as:</p>
        <div className="mt-2.5"><RoleChips roles={view.result.roles} /></div>
        <div className="mt-6">
          <button type="button" className={primaryBtn} onClick={() => router.replace('/')}>Open Stocdup</button>
        </div>
      </Shell>
    );
  }

  if (view.name === 'wrong-email') {
    return (
      <Shell>
        <Icon tone="amber"><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="12.5" /><circle cx="12" cy="16" r="0.6" fill="currentColor" /></Icon>
        <h1 className="text-xl font-semibold leading-snug text-text">This invitation was sent to a different email address</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {identity?.email ? <>You&rsquo;re signed in as <strong className="font-semibold text-text">{identity.email}</strong>. </> : null}
          Sign out, then create an account or sign in with the address the invitation was sent to.
        </p>
        <div className="mt-6"><button type="button" className={primaryBtn} onClick={logout}>Sign out</button></div>
      </Shell>
    );
  }

  if (view.name === 'conflict') {
    return (
      <Shell>
        <Icon tone="amber"><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="12.5" /><circle cx="12" cy="16" r="0.6" fill="currentColor" /></Icon>
        <h1 className="text-xl font-semibold leading-snug text-text">This invitation can&rsquo;t be used</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">{view.message}</p>
        <div className="mt-6"><button type="button" className={neutralBtn} onClick={() => router.replace('/')}>Go to Stocdup</button></div>
      </Shell>
    );
  }

  if (view.name === 'error') {
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
