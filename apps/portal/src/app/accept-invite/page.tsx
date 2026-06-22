'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { invitationsApi, ApiError } from '@wholo/api-client';

type Status = 'loading' | 'unauthenticated' | 'error' | 'accepted' | 'already-accepted';

function WholoLogo() {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', marginBottom: '24px' }}>
      <div style={{ width: '7px', height: '7px', backgroundColor: '#D97036', transform: 'rotate(45deg)' }} />
      <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em', color: '#111' }}>
        wholo
      </span>
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
      <div style={{ textAlign: 'center' }}>
        <WholoLogo />
        <div style={{ width: '24px', height: '24px', border: '2px solid #e5e7eb', borderTopColor: '#D97036', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
        <p style={{ fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#6b7280', marginTop: '16px' }}>{label}</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

const INVITE_TOKEN_STORAGE_KEY = 'wholo_pending_invite_token';

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { accessToken, isLoading, loginWithRedirect, registerWithRedirect } = useAuth();

  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  // Token comes from the URL, or from sessionStorage after a Keycloak redirect
  // (keycloak-js cleans up its own params but can also strip non-OAuth query params
  // depending on the Keycloak version and redirect mode).
  const urlToken = searchParams.get('token');
  const token = urlToken ?? (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(INVITE_TOKEN_STORAGE_KEY) : null);

  useEffect(() => {
    if (isLoading) return;

    if (!token) {
      setErrorMessage('Invalid invite link. Please check the link in your email and try again.');
      setStatus('error');
      return;
    }

    if (!accessToken) {
      // Show landing page — don't auto-redirect to Keycloak.
      // Let the user choose to create an account or sign in.
      setStatus('unauthenticated');
      return;
    }

    sessionStorage.removeItem(INVITE_TOKEN_STORAGE_KEY);

    invitationsApi.accept(accessToken, token)
      .then((result) => {
        setStatus('accepted');
        const dest = result.distributorSlug ? `/${result.distributorSlug}` : '/';
        router.replace(dest);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 409) {
          setStatus('already-accepted');
          router.replace('/');
          return;
        }
        if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
          setErrorMessage('This invitation link has expired or is no longer valid. Please ask your distributor to send a new invitation.');
        } else {
          setErrorMessage('Something went wrong. Please try again or contact support.');
        }
        setStatus('error');
      });
  }, [isLoading, accessToken, token, router]);

  const handleCreateAccount = useCallback(() => {
    if (token) sessionStorage.setItem(INVITE_TOKEN_STORAGE_KEY, token);
    registerWithRedirect(`${window.location.origin}/accept-invite${token ? `?token=${token}` : ''}`);
  }, [token, registerWithRedirect]);

  const handleSignIn = useCallback(() => {
    if (token) sessionStorage.setItem(INVITE_TOKEN_STORAGE_KEY, token);
    loginWithRedirect(`${window.location.origin}/accept-invite${token ? `?token=${token}` : ''}`);
  }, [token, loginWithRedirect]);

  if (status === 'loading' || status === 'accepted' || status === 'already-accepted') {
    return <Spinner label={status === 'loading' ? 'Setting up your account…' : 'All done! Redirecting…'} />;
  }

  if (status === 'unauthenticated') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: '24px' }}>
        <div style={{ maxWidth: '400px', textAlign: 'center' }}>
          <WholoLogo />
          <h1 style={{ fontFamily: 'system-ui, sans-serif', fontSize: '22px', fontWeight: 700, color: '#111', margin: '0 0 12px' }}>
            You&apos;ve been invited to join Wholo
          </h1>
          <p style={{ fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#6b7280', lineHeight: '1.6', margin: '0 0 28px' }}>
            Create an account or sign in to accept your invitation and start ordering.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              type="button"
              onClick={handleCreateAccount}
              style={{
                display: 'block', width: '100%', padding: '12px 24px',
                backgroundColor: '#D97036', color: '#fff', border: 'none',
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
        <WholoLogo />
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
          {errorMessage}
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
