'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { DeliveryRouteForm } from '@/components/delivery-routes/DeliveryRouteForm';
import { adminDeliveryRoutesApi } from '@wholo/admin-api-client';
import type { DeliveryRoute } from '@wholo/types';

export default function EditDeliveryRoutePage() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();
  const params = useParams<{ id: string }>();

  const [route, setRoute] = useState<DeliveryRoute | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !params.id) return;
    adminDeliveryRoutesApi
      .get(accessToken, params.id)
      .then(setRoute)
      .catch(() => setError('Failed to load delivery route.'))
      .finally(() => setIsLoading(false));
  }, [accessToken, params.id]);

  if (authLoading || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (error || !route || !accessToken) {
    return (
      <AdminLayout>
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error ?? 'Delivery route not found.'}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <DeliveryRouteForm route={route} token={accessToken} />
    </AdminLayout>
  );
}
