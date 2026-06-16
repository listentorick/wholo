'use client';

import { useState, useEffect } from 'react';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { adminSettingsApi } from '@wholo/admin-api-client';
import { SettingsStickyNav } from '@/components/settings/SettingsStickyNav';
import { BusinessDetailsForm } from '@/components/settings/BusinessDetailsForm';
import { OrderSettingsForm } from '@/components/settings/OrderSettingsForm';
import { DiscoverySettingsForm } from '@/components/settings/DiscoverySettingsForm';
import { NotificationsForm } from '@/components/settings/NotificationsForm';
import type { DistributorSettings, UpdateDistributorSettingsRequest } from '@wholo/types';

export default function CompanySettingsPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();

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

  if (authLoading || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
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
      <h1 className="mb-6 text-xl font-semibold text-text">Company Settings</h1>

      <SettingsStickyNav />

      <div className="space-y-5">
        <BusinessDetailsForm settings={settings} onSave={handleSave} />
        <OrderSettingsForm settings={settings} onSave={handleSave} />
        <DiscoverySettingsForm settings={settings} onSave={handleSave} />
        <NotificationsForm settings={settings} onSave={handleSave} />
      </div>
    </AdminLayout>
  );
}
