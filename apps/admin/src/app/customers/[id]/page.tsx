'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Suspense } from 'react';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { useQueryParamTab } from '@/lib/hooks/use-query-param-tab';
import { AdminLayout } from '@/components/AdminLayout';
import { DetailPageHeader } from '@/components/detail/DetailPageHeader';
import { DetailPageLayout } from '@/components/detail/DetailPageLayout';
import { DetailActionsPanel, type ActionItem } from '@/components/detail/DetailActionsPanel';
import { DetailTabs } from '@/components/detail/DetailTabs';
import { StatusBadge, type StatusTone } from '@/components/list/StatusBadge';
import { OverviewTab } from '@/components/customers/tabs/OverviewTab';
import { AccountTab } from '@/components/customers/tabs/AccountTab';
import { DeliveryTab } from '@/components/customers/tabs/DeliveryTab';
import { CataloguePricingTab } from '@/components/customers/tabs/CataloguePricingTab';
import { PortalAccessTab } from '@/components/customers/tabs/PortalAccessTab';
import type { TabSaveState } from '@/components/customers/tabs/tab-save-state';
import { adminCustomersApi, adminOrderAsApi } from '@wholo/admin-api-client';
import { TradeRelationshipStatus } from '@wholo/types';
import type { Customer } from '@wholo/types';

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_META: Record<TradeRelationshipStatus, { label: string; tone: StatusTone }> = {
  [TradeRelationshipStatus.PENDING_INVITE]: { label: 'Pending invite', tone: 'yellow' },
  [TradeRelationshipStatus.PENDING_REQUEST]: { label: 'Pending request', tone: 'blue' },
  [TradeRelationshipStatus.ACTIVE]: { label: 'Active', tone: 'green' },
  [TradeRelationshipStatus.SUSPENDED]: { label: 'Suspended', tone: 'red' },
  [TradeRelationshipStatus.INACTIVE]: { label: 'Inactive', tone: 'gray' },
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
  const { activeTab, setTab } = useQueryParamTab<TabKey>('overview');

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isOrderingAs, setIsOrderingAs] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [isSuspending, setIsSuspending] = useState(false);
  const [isUnsuspending, setIsUnsuspending] = useState(false);
  const [activeSaveState, setActiveSaveState] = useState<TabSaveState | null>(null);

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
    setIsDeleting(true);
    try {
      await adminCustomersApi.delete(accessToken, customer.id);
      router.push('/customers');
    } catch {
      setIsDeleting(false);
    }
  }

  async function handleAcceptRequest() {
    if (!accessToken || !customer) return;
    setIsAccepting(true);
    try {
      await adminCustomersApi.acceptRequest(accessToken, customer.id);
      fetchCustomer();
    } catch {
      // silently ignore — user sees the button un-disable
    } finally {
      setIsAccepting(false);
    }
  }

  async function handleDeclineRequest() {
    if (!accessToken || !customer) return;
    setIsDeclining(true);
    try {
      await adminCustomersApi.declineRequest(accessToken, customer.id);
      fetchCustomer();
    } catch {
      // silently ignore — user sees the button un-disable
    } finally {
      setIsDeclining(false);
    }
  }

  async function handleSuspend() {
    if (!accessToken || !customer) return;
    setIsSuspending(true);
    try {
      await adminCustomersApi.suspend(accessToken, customer.id);
      fetchCustomer();
    } catch {
      // silently ignore — user sees the button un-disable
    } finally {
      setIsSuspending(false);
    }
  }

  async function handleUnsuspend() {
    if (!accessToken || !customer) return;
    setIsUnsuspending(true);
    try {
      await adminCustomersApi.unsuspend(accessToken, customer.id);
      fetchCustomer();
    } catch {
      // silently ignore — user sees the button un-disable
    } finally {
      setIsUnsuspending(false);
    }
  }

  if (authLoading || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
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

  const missingSetup = [
    customer.catalogues.length === 0 && 'a catalogue',
    !customer.priceListId && 'a price list',
    !customer.deliveryProfileId && 'a delivery profile',
  ].filter((x): x is string => Boolean(x));

  const acceptDescription =
    missingSetup.length > 0
      ? `Heads up: this customer doesn't have ${new Intl.ListFormat('en', { type: 'conjunction' }).format(missingSetup)} set up yet. You can still accept and configure this afterwards.`
      : `${customer.organisation.name} will be notified and can start browsing your catalogue immediately.`;

  const actions: ActionItem[] = [
    ...(activeSaveState
      ? ([
          {
            key: 'save',
            label: activeSaveState.label,
            tone: 'primary',
            onClick: activeSaveState.onSave,
            disabled: activeSaveState.disabled,
            loading: activeSaveState.saving,
            loadingLabel: 'Saving…',
          },
        ] satisfies ActionItem[])
      : []),
    {
      key: 'order-as',
      label: isOrderingAs ? 'Opening…' : 'Order on behalf →',
      onClick: handleOrderAs,
      disabled: isOrderingAs,
    },
    ...(customer.status === TradeRelationshipStatus.PENDING_REQUEST
      ? ([
          {
            key: 'accept-request',
            label: 'Accept connection request',
            tone: 'primary',
            loading: isAccepting,
            loadingLabel: 'Accepting…',
            onClick: handleAcceptRequest,
            confirm: {
              prompt: acceptDescription,
              confirmLabel: 'Yes, accept',
            },
          },
          {
            key: 'decline-request',
            label: 'Decline connection request',
            tone: 'danger',
            loading: isDeclining,
            loadingLabel: 'Declining…',
            onClick: handleDeclineRequest,
            confirm: {
              prompt: `${customer.organisation.name} will be notified and can request again later.`,
              confirmLabel: 'Yes, decline',
            },
          },
        ] satisfies ActionItem[])
      : []),
    ...(customer.status === TradeRelationshipStatus.ACTIVE
      ? ([
          {
            key: 'suspend',
            label: 'Suspend',
            tone: 'danger',
            loading: isSuspending,
            loadingLabel: 'Suspending…',
            onClick: handleSuspend,
            confirm: {
              prompt: "They won't be able to order until you unsuspend them.",
              confirmLabel: 'Yes, suspend',
            },
          },
        ] satisfies ActionItem[])
      : []),
    ...(customer.status === TradeRelationshipStatus.SUSPENDED
      ? ([
          {
            key: 'unsuspend',
            label: 'Unsuspend',
            tone: 'primary',
            loading: isUnsuspending,
            loadingLabel: 'Unsuspending…',
            onClick: handleUnsuspend,
            confirm: {
              prompt: "They'll immediately be able to browse and order again.",
              confirmLabel: 'Yes, unsuspend',
            },
          },
        ] satisfies ActionItem[])
      : []),
    ...(customer.status !== TradeRelationshipStatus.PENDING_REQUEST
      ? ([
          {
            key: 'remove',
            label: 'Remove customer',
            tone: 'danger',
            dangerZone: true,
            loading: isDeleting,
            loadingLabel: 'Removing…',
            onClick: handleDelete,
            confirm: {
              prompt: 'Remove this customer relationship? This cannot be undone.',
              confirmLabel: 'Yes, remove',
            },
          },
        ] satisfies ActionItem[])
      : []),
  ];

  return (
    <AdminLayout>
      <DetailPageHeader
        backHref="/customers"
        backLabel="Customers"
        heading={customer.organisation.name}
        badge={<StatusBadge label={statusMeta.label} tone={statusMeta.tone} />}
      />

      <DetailTabs
        tabs={TABS}
        activeKey={activeTab}
        onChange={setTab}
      />

      <DetailPageLayout
        sidebar={
          <DetailActionsPanel
            layout="sidebar"
            actions={actions}
            banner={{ success: activeSaveState?.success, error: activeSaveState?.error }}
          />
        }
      >
        {activeTab === 'overview' && (
          <OverviewTab
            customer={customer}
            token={accessToken ?? ''}
            onSaved={fetchCustomer}
            onSaveStateChange={setActiveSaveState}
          />
        )}
        {activeTab === 'account' && (
          <AccountTab
            customer={customer}
            token={accessToken ?? ''}
            mode="tab"
            onSaved={fetchCustomer}
            onSaveStateChange={setActiveSaveState}
          />
        )}
        {activeTab === 'delivery' && (
          <DeliveryTab
            customer={customer}
            token={accessToken ?? ''}
            mode="tab"
            onSaved={fetchCustomer}
            onSaveStateChange={setActiveSaveState}
          />
        )}
        {activeTab === 'catalogue-pricing' && (
          <CataloguePricingTab
            customer={customer}
            token={accessToken ?? ''}
            mode="tab"
            onSaved={fetchCustomer}
            onSaveStateChange={setActiveSaveState}
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
      </DetailPageLayout>
    </AdminLayout>
  );
}

export default function CustomerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-canvas">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
        </div>
      }
    >
      <CustomerPageInner />
    </Suspense>
  );
}
