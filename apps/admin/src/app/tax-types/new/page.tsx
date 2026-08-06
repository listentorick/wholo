'use client';

import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { TaxTypeForm } from '@/components/tax-types/TaxTypeForm';
import { adminTaxTypesApi } from '@wholo/admin-api-client';
import type { CreateTaxTypeRequest } from '@wholo/types';

export default function NewTaxTypePage() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  async function handleSubmit(data: CreateTaxTypeRequest) {
    return adminTaxTypesApi.create(accessToken!, data);
  }

  return (
    <AdminLayout>
      <TaxTypeForm mode="create" onSubmit={handleSubmit} />
    </AdminLayout>
  );
}
