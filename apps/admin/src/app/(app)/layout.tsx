'use client';

import { AdminLayout } from '@/components/AdminLayout';
import { IngestionSyncProvider } from '@/lib/ingestion-sync-context';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { needsWholesalerSelection } from '@/lib/ops-mode';

/**
 * Shell layout for every authenticated admin route. Rendering <AdminLayout>
 * (sidebar + top bar) here — once, above the route group's pages — is what
 * keeps the sidebar mounted across navigation instead of being rebuilt by each
 * page. It also centralises the auth gate that every page used to run itself
 * via useRequireAuth().
 *
 * Standalone routes (/login, /onboarding, /access-denied) live outside this
 * group and get no shell.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useRequireAuth();
  const router = useRouter();
  // Ops build: the wholesaler screens need a wholesaler opened first.
  const toOps = !!user && needsWholesalerSelection(user);

  useEffect(() => {
    if (toOps) router.replace('/ops');
  }, [toOps, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  // useRequireAuth is redirecting to /login, /onboarding or /access-denied.
  if (!user || toOps) return null;

  return (
    <IngestionSyncProvider>
      <AdminLayout>{children}</AdminLayout>
    </IngestionSyncProvider>
  );
}
