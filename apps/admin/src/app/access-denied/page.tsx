'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function AccessDeniedPage() {
  const { isLoading, user, accessDenied, identity, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || accessDenied) return;
    // Landed here directly without an active denial — send them where they belong.
    router.replace(user ? '/' : '/login');
  }, [isLoading, accessDenied, user, router]);

  if (isLoading || !accessDenied) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-6 py-12">
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-8 text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/stocdup-logo-only.png" alt="" className="h-7 w-7 shrink-0" />
        </div>

        <h1 className="text-lg font-semibold text-text">This is the distributor workspace</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          The account you&rsquo;re signed in with is registered as a trade customer, not a distributor. This admin
          workspace is for distributor teams managing their own catalogue, pricing, orders and deliveries.
        </p>

        {identity?.email && (
          <p className="mt-5 text-xs text-muted">
            Signed in as <span className="font-medium text-text">{identity.email}</span>
          </p>
        )}

        <button
          type="button"
          onClick={logout}
          className="mt-6 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
