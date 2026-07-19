'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { PriceListForm } from '@/components/price-lists/PriceListForm';
import { adminPriceListsApi } from '@wholo/admin-api-client';
import type { PriceList, CreatePriceListRequest } from '@wholo/types';

export default function EditPriceListPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [priceList, setPriceList] = useState<PriceList | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    adminPriceListsApi.get(accessToken, id)
      .then(setPriceList)
      .catch(() => setError('Price list not found.'))
      .finally(() => setIsLoading(false));
  }, [accessToken, id]);

  if (authLoading || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (error || !priceList) {
    return (
      <AdminLayout>
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error ?? 'Price list not found.'}
        </div>
      </AdminLayout>
    );
  }

  async function handleSubmit(data: CreatePriceListRequest) {
    const updated = await adminPriceListsApi.update(accessToken!, id, data);
    setPriceList(updated);
    return updated;
  }

  async function handleDelete() {
    await adminPriceListsApi.delete(accessToken!, id);
    router.push('/pricelists');
  }

  async function handleSetDefault() {
    const updated = await adminPriceListsApi.setDefault(accessToken!, id);
    setPriceList(updated);
  }

  return (
    <AdminLayout>
      <PriceListForm
        mode="edit"
        token={accessToken!}
        initialValues={priceList}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
        onSetDefault={handleSetDefault}
      />
    </AdminLayout>
  );
}
