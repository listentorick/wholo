'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { PageHeading } from '@/components/PageHeading';
import { adminSettingsApi } from '@wholo/admin-api-client';
import { BusinessDetailsForm } from '@/components/settings/BusinessDetailsForm';
import { DiscoverySettingsForm } from '@/components/settings/DiscoverySettingsForm';
import { NotificationsForm } from '@/components/settings/NotificationsForm';
import { OrdersTab } from '@/components/settings/tabs/OrdersTab';
import { BrandingTab } from '@/components/settings/tabs/BrandingTab';
import { PortalTab } from '@/components/settings/tabs/PortalTab';
import type { DistributorSettings, UpdateDistributorSettingsRequest } from '@wholo/types';

type TabKey = 'business' | 'orders' | 'discovery' | 'portal' | 'notifications' | 'branding';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'business', label: 'Business' },
  { key: 'orders', label: 'Orders' },
  { key: 'discovery', label: 'Discovery' },
  { key: 'portal', label: 'Portal' },
  { key: 'branding', label: 'Branding' },
  { key: 'notifications', label: 'Notifications' },
];

function SettingsPageInner() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeTab = (searchParams.get('tab') as TabKey) ?? 'business';

  const [settings, setSettings] = useState<DistributorSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    adminSettingsApi
      .get(accessToken)
      .then(setSettings)
      .catch(() => setLoadError('Failed to load settings.'))
      .finally(() => setIsLoading(false));
  }, [accessToken]);

  async function handleSave(dto: UpdateDistributorSettingsRequest) {
    if (!accessToken) return;
    const updated = await adminSettingsApi.update(accessToken, dto);
    setSettings(updated);
  }

  function setTab(key: TabKey) {
    router.push(`/settings?tab=${key}`);
  }

  if (authLoading || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (loadError || !settings) {
    return (
      <AdminLayout>
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {loadError ?? 'Failed to load settings.'}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <PageHeading className="mb-6">Company Settings</PageHeading>

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
                  : 'border-transparent text-muted hover:border-border hover:text-text',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'business' && (
        <BusinessDetailsForm settings={settings} onSave={handleSave} />
      )}
      {activeTab === 'orders' && (
        <OrdersTab settings={settings} onSave={handleSave} />
      )}
      {activeTab === 'discovery' && (
        <DiscoverySettingsForm settings={settings} onSave={handleSave} />
      )}
      {activeTab === 'portal' && (
        <PortalTab settings={settings} onSave={handleSave} />
      )}
      {activeTab === 'notifications' && (
        <NotificationsForm settings={settings} onSave={handleSave} />
      )}
      {activeTab === 'branding' && user && (
        <BrandingTab token={accessToken ?? ''} distributorId={user.organisationId} />
      )}
    </AdminLayout>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-canvas">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
        </div>
      }
    >
      <SettingsPageInner />
    </Suspense>
  );
}
