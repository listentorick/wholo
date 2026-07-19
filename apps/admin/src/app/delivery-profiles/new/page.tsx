'use client';

import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { PageHeading } from '@/components/PageHeading';
import { DeliveryProfileForm } from '@/components/delivery-profiles/DeliveryProfileForm';
import Link from 'next/link';

export default function NewDeliveryProfilePage() {
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
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-2 text-sm text-muted">
          <Link href="/delivery-profiles" className="hover:text-text transition-colors">Delivery Profiles</Link>
          <span>/</span>
          <span className="text-text">New Profile</span>
        </div>
        <PageHeading>New Delivery Profile</PageHeading>
      </div>
      <DeliveryProfileForm token={accessToken} />
    </AdminLayout>
  );
}
