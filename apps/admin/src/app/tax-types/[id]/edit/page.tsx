'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { TaxTypeForm } from '@/components/tax-types/TaxTypeForm';
import { adminTaxTypesApi } from '@wholo/admin-api-client';
import type { TaxType, CreateTaxTypeRequest } from '@wholo/types';

export default function EditTaxTypePage() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [taxType, setTaxType] = useState<TaxType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    adminTaxTypesApi.get(accessToken, id)
      .then(setTaxType)
      .catch(() => setError('Tax type not found.'))
      .finally(() => setIsLoading(false));
  }, [accessToken, id]);

  if (authLoading || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (error || !taxType) {
    return (
      <AdminLayout>
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error ?? 'Tax type not found.'}
        </div>
      </AdminLayout>
    );
  }

  async function handleSubmit(data: CreateTaxTypeRequest) {
    const updated = await adminTaxTypesApi.update(accessToken!, id, data);
    setTaxType(updated);
    return updated;
  }

  async function handleDeactivate() {
    await adminTaxTypesApi.deactivate(accessToken!, id);
    router.push('/tax-types');
  }

  return (
    <AdminLayout>
      <TaxTypeForm mode="edit" initialValues={taxType} onSubmit={handleSubmit} onDeactivate={handleDeactivate} />
    </AdminLayout>
  );
}
