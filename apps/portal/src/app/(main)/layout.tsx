'use client';

import { PortalTopBar } from '@/components/portal/PortalTopBar';
import { PortalFooter } from '@/components/portal/PortalFooter';
import { OrderAsBanner } from '@/components/OrderAsBanner';
import { useAuth } from '@/lib/auth-context';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { authError, logout } = useAuth();

  if (authError) {
    return (
      <div className="flex min-h-screen flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-medium text-foreground">We couldn&apos;t sign you in</p>
        <p className="max-w-sm text-sm text-foreground-secondary">{authError}</p>
        <button
          onClick={logout}
          className="mt-2 rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-page">
      <OrderAsBanner />
      <PortalTopBar variant="account" />
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      <PortalFooter />
    </div>
  );
}
