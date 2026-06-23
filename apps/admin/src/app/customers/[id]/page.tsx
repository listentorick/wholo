'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { Suspense } from 'react';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { OverviewTab } from '@/components/customers/tabs/OverviewTab';
import { AccountTab } from '@/components/customers/tabs/AccountTab';
import { DeliveryTab } from '@/components/customers/tabs/DeliveryTab';
import { CataloguePricingTab } from '@/components/customers/tabs/CataloguePricingTab';
import { PortalAccessTab } from '@/components/customers/tabs/PortalAccessTab';
import { adminCustomersApi, adminOrderAsApi } from '@wholo/admin-api-client';
import { TradeRelationshipStatus } from '@wholo/types';
import type { Customer } from '@wholo/types';

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_META: Record<TradeRelationshipStatus, { label: string; bg: string; text: string }> = {
  [TradeRelationshipStatus.PENDING_INVITE]: { label: 'Pending invite', bg: '#fef9c3', text: '#a16207' },
  [TradeRelationshipStatus.PENDING_REQUEST]: { label: 'Pending request', bg: '#dbeafe', text: '#1d4ed8' },
  [TradeRelationshipStatus.ACTIVE]: { label: 'Active', bg: '#dcfce7', text: '#15803d' },
  [TradeRelationshipStatus.SUSPENDED]: { label: 'Suspended', bg: '#fee2e2', text: '#b91c1c' },
  [TradeRelationshipStatus.INACTIVE]: { label: 'Inactive', bg: '#f3f4f6', text: '#6b7280' },
};

// ─── Tab definition ───────────────────────────────────────────────────────────

type TabKey = 'overview' | 'account' | 'delivery' | 'catalogue-pricing' | 'portal-access';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'account', label: 'Account' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'catalogue-pricing', label: 'Catalogue & Pricing' },
  { key: 'portal-access', label: 'Portal Access' },
];

// ─── Inner page (uses hooks that require Suspense) ────────────────────────────

function CustomerPageInner() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const activeTab = (searchParams.get('tab') as TabKey) ?? 'overview';

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isOrderingAs, setIsOrderingAs] = useState(false);

  const fetchCustomer = useCallback(() => {
    if (!accessToken || !params?.id) return;
    adminCustomersApi
      .get(accessToken, params.id)
      .then(setCustomer)
      .catch(() => setFetchError('Customer not found.'))
      .finally(() => setIsLoading(false));
  }, [accessToken, params?.id]);

  useEffect(() => {
    fetchCustomer();
  }, [fetchCustomer]);

  async function handleOrderAs() {
    if (!accessToken || !customer) return;
    setIsOrderingAs(true);
    try {
      const { portalUrl } = await adminOrderAsApi.createSession(accessToken, customer.id);
      window.open(portalUrl, '_blank', 'noopener');
    } catch {
      // silently ignore — user sees the button un-disable
    } finally {
      setIsOrderingAs(false);
    }
  }

  async function handleDelete() {
    if (!accessToken || !customer) return;
    await adminCustomersApi.delete(accessToken, customer.id);
    router.push('/customers');
  }

  function setTab(key: TabKey) {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', key);
    router.push(`/customers/${params.id}?tab=${key}`);
  }

  if (authLoading || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (fetchError || !customer) {
    return (
      <AdminLayout>
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {fetchError ?? 'Customer not found.'}
        </div>
      </AdminLayout>
    );
  }

  const statusMeta = STATUS_META[customer.status];

  return (
    <AdminLayout>
      {/* Breadcrumb + header */}
      <div className="mb-6">
        <Link
          href="/customers"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors mb-3"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Customers
        </Link>

        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-semibold text-text">{customer.organisation.name}</h1>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{ backgroundColor: statusMeta.bg, color: statusMeta.text }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusMeta.text }} />
            {statusMeta.label}
          </span>
          <div className="ml-auto">
            <button
              type="button"
              onClick={handleOrderAs}
              disabled={isOrderingAs}
              className="rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface disabled:opacity-50"
            >
              {isOrderingAs ? 'Opening…' : 'Order on behalf →'}
            </button>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="mb-6 border-b border-border">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setTab(tab.key)}
              className={[
                'shrink-0 border-b-2 pb-3 text-sm font-medium transition-colors',
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-text hover:border-border',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <OverviewTab
          customer={customer}
          token={accessToken ?? ''}
          onSaved={fetchCustomer}
          onDelete={handleDelete}
        />
      )}
      {activeTab === 'account' && (
        <AccountTab
          customer={customer}
          token={accessToken ?? ''}
          mode="tab"
          onSaved={fetchCustomer}
        />
      )}
      {activeTab === 'delivery' && (
        <DeliveryTab
          customer={customer}
          token={accessToken ?? ''}
          mode="tab"
          onSaved={fetchCustomer}
        />
      )}
      {activeTab === 'catalogue-pricing' && (
        <CataloguePricingTab
          customer={customer}
          token={accessToken ?? ''}
          mode="tab"
          onSaved={fetchCustomer}
        />
      )}
      {activeTab === 'portal-access' && (
        <PortalAccessTab
          customer={customer}
          token={accessToken ?? ''}
          mode="tab"
          onSaved={fetchCustomer}
        />
      )}
    </AdminLayout>
  );
}

export default function CustomerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-surface">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
        </div>
      }
    >
      <CustomerPageInner />
    </Suspense>
  );
}
