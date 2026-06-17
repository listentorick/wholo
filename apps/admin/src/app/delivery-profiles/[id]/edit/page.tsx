'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { DeliveryProfileForm } from '@/components/delivery-profiles/DeliveryProfileForm';
import { adminDeliveryProfilesApi } from '@wholo/admin-api-client';
import type { DeliveryProfile } from '@wholo/types';

export default function EditDeliveryProfilePage() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();
  const params = useParams<{ id: string }>();

  const [profile, setProfile] = useState<DeliveryProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !params.id) return;
    adminDeliveryProfilesApi
      .get(accessToken, params.id)
      .then(setProfile)
      .catch(() => setError('Failed to load delivery profile.'))
      .finally(() => setIsLoading(false));
  }, [accessToken, params.id]);

  if (authLoading || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (error || !profile || !accessToken) {
    return (
      <AdminLayout>
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error ?? 'Delivery profile not found.'}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-2 text-sm text-muted">
          <Link href="/delivery-profiles" className="hover:text-text transition-colors">Delivery Profiles</Link>
          <span>/</span>
          <span className="text-text">{profile.name}</span>
        </div>
        <h1 className="text-xl font-semibold text-text">{profile.name}</h1>
      </div>
      <DeliveryProfileForm profile={profile} token={accessToken} />
    </AdminLayout>
  );
}
