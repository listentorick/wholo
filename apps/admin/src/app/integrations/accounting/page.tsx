'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { ContactsTab } from '@/components/integrations/contacts/ContactsTab';
import { adminAccountingApi } from '@wholo/admin-api-client';
import type { AccountingConnectionStatusResponse } from '@wholo/types';

type TabKey = 'contacts' | 'products' | 'invoices' | 'settings';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'contacts', label: 'Contacts' },
  { key: 'products', label: 'Products' },
  { key: 'invoices', label: 'Invoice exports' },
  { key: 'settings', label: 'Settings' },
];

// Provider is an enum on the backend (AccountingProvider) — this page stays
// provider-neutral in structure, this map is just display copy.
const PROVIDER_LABELS: Record<string, string> = { XERO: 'Xero' };

function Spinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-surface">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}

function AccountingPageInner() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [connection, setConnection] = useState<AccountingConnectionStatusResponse | null | undefined>(undefined);
  const [needsAttentionCount, setNeedsAttentionCount] = useState(0);

  const activeTab = (searchParams.get('tab') as TabKey) ?? 'contacts';

  useEffect(() => {
    if (!accessToken) return;
    adminAccountingApi
      .getConnection(accessToken)
      .then((res) => setConnection(res ?? null))
      .catch(() => setConnection(null));
  }, [accessToken]);

  const fetchNeedsAttentionCount = useCallback(() => {
    if (!accessToken || connection?.status !== 'CONNECTED') return;
    adminAccountingApi
      .countContactsNeedingAttention(accessToken)
      .then((res) => setNeedsAttentionCount(res.count))
      .catch(() => {
        // Non-critical — the badge just doesn't update if this fails.
      });
  }, [accessToken, connection?.status]);

  useEffect(() => {
    fetchNeedsAttentionCount();
  }, [fetchNeedsAttentionCount]);

  function setTab(key: TabKey) {
    router.push(`/integrations/accounting?tab=${key}`);
  }

  if (authLoading || connection === undefined) {
    return <Spinner />;
  }

  if (!connection || connection.status !== 'CONNECTED') {
    return (
      <AdminLayout>
        <h1 className="mb-6 text-xl font-semibold text-text">Accounting</h1>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-white py-16 px-8 text-center">
          <h2 className="mb-1.5 text-base font-semibold text-text">No accounting connection</h2>
          <p className="mb-4 text-sm text-muted">
            Connect an accounting provider to review and import its contacts, products, and invoices here.
          </p>
          <Link href="/integrations" className="text-sm text-primary hover:underline">
            Go to Integrations →
          </Link>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <Link
          href="/integrations"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors mb-3"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Integrations
        </Link>

        <h1 className="text-xl font-semibold text-text">Accounting</h1>
        <p className="mt-0.5 text-sm text-muted">
          {PROVIDER_LABELS[connection.provider] ?? connection.provider} — {connection.externalOrganisationName}
        </p>
      </div>

      <div className="mb-6 border-b border-border">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setTab(tab.key)}
              className={[
                'shrink-0 border-b-2 pb-3 text-sm font-medium transition-colors flex items-center gap-1.5',
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-text hover:border-border',
              ].join(' ')}
            >
              {tab.label}
              {tab.key === 'contacts' && needsAttentionCount > 0 && (
                <span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                  {needsAttentionCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'contacts' && accessToken && (
        <ContactsTab token={accessToken} onContactsChanged={fetchNeedsAttentionCount} />
      )}
      {activeTab !== 'contacts' && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-white py-16 px-8 text-center">
          <h2 className="mb-1.5 text-base font-semibold text-text">Coming soon</h2>
          <p className="text-sm text-muted">
            {activeTab === 'products' && 'Product sync and mapping is not available yet.'}
            {activeTab === 'invoices' && 'Invoice export history is not available yet.'}
            {activeTab === 'settings' && 'Accounting integration settings are not available yet.'}
          </p>
        </div>
      )}
    </AdminLayout>
  );
}

export default function AccountingPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <AccountingPageInner />
    </Suspense>
  );
}
