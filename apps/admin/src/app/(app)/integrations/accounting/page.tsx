'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useIngestionSync } from '@/lib/ingestion-sync-context';
import { relativeTime } from '@/lib/date';
import { ContactsTab } from '@/components/integrations/contacts/ContactsTab';
import { ProductsTab } from '@/components/integrations/products/ProductsTab';
import { TaxTypesTab } from '@/components/integrations/tax-types/TaxTypesTab';
import { AccountingSettingsTab } from '@/components/integrations/AccountingSettingsTab';
import { SyncWithProviderButton } from '@/components/integrations/SyncWithProviderButton';
import { IngestionProgressPanel } from '@/components/integrations/IngestionProgressPanel';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { adminAccountingApi } from '@wholo/admin-api-client';
import type { AccountingConnectionStatusResponse } from '@wholo/types';

type TabKey = 'contacts' | 'products' | 'taxTypes' | 'invoices' | 'settings';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'contacts', label: 'Contacts' },
  { key: 'products', label: 'Products' },
  { key: 'taxTypes', label: 'Tax types' },
  { key: 'invoices', label: 'Invoice exports' },
  { key: 'settings', label: 'Settings' },
];

// Provider is an enum on the backend (AccountingProvider) — this page stays
// provider-neutral in structure, this map is just display copy.
const PROVIDER_LABELS: Record<string, string> = { XERO: 'Xero' };

// resourceType (IngestionRun) → display label for the progress panel.
const RESOURCE_LABELS: Record<string, string> = {
  contact: 'Contacts',
  product: 'Products',
  tax_type: 'Tax types',
};

// resourceType (IngestionRun) → the tab its "Review" link opens.
const RESOURCE_TAB: Record<string, TabKey> = {
  contact: 'contacts',
  product: 'products',
  tax_type: 'taxTypes',
};

function Spinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-canvas">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/integrations"
      className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-text"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
        <polyline points="15 18 9 12 15 6" />
      </svg>
      Integrations
    </Link>
  );
}

function AccountingPageInner() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const {
    runs,
    isSyncing,
    hasManualActive,
    hasEverSynced,
    lastSucceededAt,
    reloadSignal,
    triggerSync,
  } = useIngestionSync();

  // A manual / first-ever sync shows the full panel and *holds* there after it
  // finishes — the screen doesn't snap to the listing until the user clicks
  // "View synced data".
  const fullPanelNow = isSyncing && (hasManualActive || !hasEverSynced);
  const [fullPanelHeld, setFullPanelHeld] = useState(false);
  const [resultsSeen, setResultsSeen] = useState(false);
  useEffect(() => {
    if (fullPanelNow) {
      setFullPanelHeld(true);
      setResultsSeen(false);
    }
  }, [fullPanelNow]);
  const showFullPanel = (fullPanelNow || fullPanelHeld) && !resultsSeen;
  // From the "sync complete" panel — dismiss it and land on the listing. A
  // per-resource "Review" link passes its resourceType so we open that tab;
  // the footer action passes nothing (default tab). No filtering yet — the
  // changed rows just sort to the top of the existing table.
  function handleViewResults(resourceType?: string) {
    setResultsSeen(true);
    setFullPanelHeld(false);
    const tab = resourceType ? RESOURCE_TAB[resourceType] : undefined;
    if (tab) router.push(`/integrations/accounting?tab=${tab}`);
  }

  const [connection, setConnection] = useState<AccountingConnectionStatusResponse | null | undefined>(undefined);
  const [needsAttentionCount, setNeedsAttentionCount] = useState(0);
  const [productsNeedsAttentionCount, setProductsNeedsAttentionCount] = useState(0);
  const [taxTypesNeedsAttentionCount, setTaxTypesNeedsAttentionCount] = useState(0);

  const activeTab = (searchParams.get('tab') as TabKey) ?? 'contacts';

  useEffect(() => {
    if (!accessToken) return;
    adminAccountingApi
      .getConnection()
      .then((res) => setConnection(res ?? null))
      .catch(() => setConnection(null));
  }, [accessToken]);

  const fetchNeedsAttentionCount = useCallback(() => {
    if (!accessToken || connection?.status !== 'CONNECTED') return;
    adminAccountingApi
      .countContactsNeedingAttention()
      .then((res) => setNeedsAttentionCount(res.count))
      .catch(() => {
        // Non-critical — the badge just doesn't update if this fails.
      });
  }, [accessToken, connection?.status]);

  const fetchProductsNeedsAttentionCount = useCallback(() => {
    if (!accessToken || connection?.status !== 'CONNECTED') return;
    adminAccountingApi
      .countProductsNeedingAttention()
      .then((res) => setProductsNeedsAttentionCount(res.count))
      .catch(() => {
        // Non-critical — the badge just doesn't update if this fails.
      });
  }, [accessToken, connection?.status]);

  const fetchTaxTypesNeedsAttentionCount = useCallback(() => {
    if (!accessToken || connection?.status !== 'CONNECTED') return;
    adminAccountingApi
      .countTaxTypesNeedingAttention()
      .then((res) => setTaxTypesNeedsAttentionCount(res.count))
      .catch(() => {
        // Non-critical — the badge just doesn't update if this fails.
      });
  }, [accessToken, connection?.status]);

  useEffect(() => {
    fetchNeedsAttentionCount();
    fetchProductsNeedsAttentionCount();
    fetchTaxTypesNeedsAttentionCount();
    // reloadSignal bumps when a sync finishes — refresh the badges then too.
  }, [
    fetchNeedsAttentionCount,
    fetchProductsNeedsAttentionCount,
    fetchTaxTypesNeedsAttentionCount,
    reloadSignal,
  ]);

  function setTab(key: TabKey) {
    router.push(`/integrations/accounting?tab=${key}`);
  }

  if (connection === undefined) {
    return <Spinner />;
  }

  if (!connection || connection.status !== 'CONNECTED') {
    return (
      <>
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
      </>
    );
  }

  const providerLabel = PROVIDER_LABELS[connection.provider] ?? connection.provider;
  const lastSyncedAt = lastSucceededAt ?? connection.lastSyncedAt ?? null;

  // A background scheduled sync only shows a non-blocking strip (below).
  const showEmptyState = !isSyncing && !hasEverSynced && !showFullPanel;

  if (showFullPanel) {
    return (
      <>
        <div className="mb-6">
          <BackLink />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold text-text">
              {providerLabel} — {connection.externalOrganisationName}
            </h1>
            <SyncWithProviderButton onClick={triggerSync} disabled={isSyncing} label={`Sync with ${providerLabel}`} />
          </div>
        </div>
        <IngestionProgressPanel
          runs={runs}
          providerLabel={providerLabel}
          labels={RESOURCE_LABELS}
          onViewResults={handleViewResults}
        />
      </>
    );
  }

  if (showEmptyState) {
    return (
      <>
        <div className="mb-6">
          <BackLink />
          <h1 className="text-xl font-semibold text-text">
            {providerLabel} — {connection.externalOrganisationName}
          </h1>
        </div>
        <ListEmptyState
          iconBgClassName="bg-primary/10"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-9 w-9 text-primary" aria-hidden>
              <ellipse cx="12" cy="5" rx="8" ry="3" />
              <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
              <path d="M4 11v6c0 1.66 3.58 3 8 3 1.4 0 2.71-.13 3.86-.37" />
              <path d="M19 15v6M22 18l-3 3-3-3" />
            </svg>
          }
          title={`No ${providerLabel} data has been synced yet`}
          description={`Pull your contacts, products and tax types from ${connection.externalOrganisationName} so you can review and import them.`}
          action={
            <SyncWithProviderButton
              variant="primary"
              onClick={triggerSync}
              label={`Sync with ${providerLabel}`}
            />
          }
        />
      </>
    );
  }

  return (
    <>
      <div className="mb-6">
        <BackLink />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-xl font-semibold text-text">
            {providerLabel} — {connection.externalOrganisationName}
          </h1>
          <div className="flex flex-col items-end gap-1">
            <SyncWithProviderButton
              onClick={triggerSync}
              disabled={isSyncing}
              label={`Sync with ${providerLabel}`}
            />
            {lastSyncedAt && (
              <span className="text-xs text-muted">Last synced {relativeTime(lastSyncedAt)}</span>
            )}
          </div>
        </div>
      </div>

      {isSyncing && (
        <IngestionProgressPanel
          runs={runs}
          providerLabel={providerLabel}
          labels={RESOURCE_LABELS}
          variant="strip"
        />
      )}

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
              {tab.key === 'products' && productsNeedsAttentionCount > 0 && (
                <span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                  {productsNeedsAttentionCount}
                </span>
              )}
              {tab.key === 'taxTypes' && taxTypesNeedsAttentionCount > 0 && (
                <span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                  {taxTypesNeedsAttentionCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'contacts' && accessToken && (
        <ContactsTab
          providerLabel={providerLabel}
          onContactsChanged={fetchNeedsAttentionCount}
          reloadSignal={reloadSignal}
        />
      )}
      {activeTab === 'products' && accessToken && (
        <ProductsTab
          providerLabel={providerLabel}
          onProductsChanged={fetchProductsNeedsAttentionCount}
          reloadSignal={reloadSignal}
        />
      )}
      {activeTab === 'taxTypes' && accessToken && (
        <TaxTypesTab
          providerLabel={providerLabel}
          onTaxTypesChanged={fetchTaxTypesNeedsAttentionCount}
          reloadSignal={reloadSignal}
        />
      )}
      {activeTab === 'settings' && accessToken && (
        <AccountingSettingsTab connection={connection} onConnectionUpdated={setConnection} />
      )}
      {activeTab === 'invoices' && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-white py-16 px-8 text-center">
          <h2 className="mb-1.5 text-base font-semibold text-text">Coming soon</h2>
          <p className="text-sm text-muted">Invoice export history is not available yet.</p>
        </div>
      )}
    </>
  );
}

export default function AccountingPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <AccountingPageInner />
    </Suspense>
  );
}
