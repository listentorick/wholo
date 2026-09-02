'use client';

import { useAuth } from '@/lib/auth-context';
import { TaxTypeForm } from '@/components/tax-types/TaxTypeForm';
import { adminTaxTypesApi } from '@wholo/admin-api-client';
import type { CreateTaxTypeRequest } from '@wholo/types';

export default function NewTaxTypePage() {
  const { accessToken } = useAuth();

  async function handleSubmit(data: CreateTaxTypeRequest) {
    return adminTaxTypesApi.create(accessToken!, data);
  }

  return <TaxTypeForm mode="create" onSubmit={handleSubmit} />;
}
