'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { DeliveryProfileForm } from '@/components/delivery-profiles/DeliveryProfileForm';
import { adminDeliveryProfilesApi } from '@wholo/admin-api-client';
import type { DeliveryProfile } from '@wholo/types';

export default function EditDeliveryProfilePage() {
  const { accessToken } = useAuth();
  const params = useParams<{ id: string }>();

  const [profile, setProfile] = useState<DeliveryProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !params.id) return;
    adminDeliveryProfilesApi
      .get(params.id)
      .then(setProfile)
      .catch(() => setError('Failed to load delivery profile.'))
      .finally(() => setIsLoading(false));
  }, [accessToken, params.id]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (error || !profile || !accessToken) {
    return (
      <>
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error ?? 'Delivery profile not found.'}
        </div>
      </>
    );
  }

  return (
    <>
      <DeliveryProfileForm profile={profile} />
    </>
  );
}
