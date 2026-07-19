'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { PageHeading } from '@/components/PageHeading';
import { XeroConnectionCard } from '@/components/integrations/XeroConnectionCard';
import { ComingSoonProviderCard } from '@/components/integrations/ComingSoonProviderCard';

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Xero connection was cancelled.',
  invalid_state: 'That connection request expired or is no longer valid — please try again.',
  expired_state: 'That connection request expired — please try again.',
  no_organisation: 'No Xero organisation was authorised. Please try again and select an organisation.',
  exchange_failed: 'Failed to complete the Xero connection. Please try again.',
  unknown: 'Something went wrong connecting to Xero. Please try again.',
};

function IntegrationsPageInner() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const status = searchParams.get('status');
    if (!status) return;

    if (status === 'connected') {
      setBanner({ type: 'success', message: 'Xero connected successfully.' });
    } else if (status === 'error') {
      const reason = searchParams.get('reason') ?? 'unknown';
      setBanner({ type: 'error', message: ERROR_MESSAGES[reason] ?? ERROR_MESSAGES.unknown });
    }
    router.replace('/integrations');
    // Only run once on mount — router.replace strips the query params, and we
    // don't want this to re-fire when the router/params identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  return (
    <AdminLayout>
      <PageHeading className="mb-6">Integrations</PageHeading>

      {banner && (
        <div
          className={[
            'mb-6 rounded-md border px-4 py-3 text-sm',
            banner.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700',
          ].join(' ')}
        >
          {banner.message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accessToken && <XeroConnectionCard token={accessToken} />}
        <ComingSoonProviderCard name="MYOB" description="Sync invoicing with MYOB." />
        <ComingSoonProviderCard name="QuickBooks" description="Sync invoicing with QuickBooks." />
      </div>
    </AdminLayout>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-canvas">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
        </div>
      }
    >
      <IntegrationsPageInner />
    </Suspense>
  );
}
