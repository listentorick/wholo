'use client';

import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { PriceListForm } from '@/components/price-lists/PriceListForm';
import { adminPriceListsApi } from '@wholo/admin-api-client';
import type { CreatePriceListRequest } from '@wholo/types';

export default function NewPriceListPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  async function handleSubmit(data: CreatePriceListRequest) {
    return adminPriceListsApi.create(accessToken!, data);
  }

  return (
    <AdminLayout>
      <PriceListForm mode="create" token={accessToken!} onSubmit={handleSubmit} />
    </AdminLayout>
  );
}
