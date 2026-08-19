'use client';

import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { DeliveryRouteForm } from '@/components/delivery-routes/DeliveryRouteForm';

export default function NewDeliveryRoutePage() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();

  if (authLoading || !accessToken) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  return (
    <AdminLayout>
      <DeliveryRouteForm token={accessToken} />
    </AdminLayout>
  );
}
