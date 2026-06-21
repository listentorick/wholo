'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { invitationsApi, ApiError } from '@wholo/api-client';

type Status = 'loading' | 'error' | 'accepted' | 'already-accepted';

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

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { accessToken, isLoading, loginWithRedirect } = useAuth();

  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const token = searchParams.get('token');

  useEffect(() => {
    if (isLoading) return;

    if (!token) {
      setErrorMessage('Invalid invite link. Please check the link in your email and try again.');
      setStatus('error');
      return;
    }

    if (!accessToken) {
      loginWithRedirect(window.location.href);
      return;
    }

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
  }, [isLoading, accessToken, token, loginWithRedirect, router]);

  if (status === 'loading' || status === 'accepted' || status === 'already-accepted') {
    return <Spinner label={status === 'loading' ? 'Setting up your account…' : 'All done! Redirecting…'} />;
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
