'use client';

import { TaxTypeForm } from '@/components/tax-types/TaxTypeForm';
import { adminTaxTypesApi } from '@wholo/admin-api-client';
import type { CreateTaxTypeRequest } from '@wholo/types';

export default function NewTaxTypePage() {
  async function handleSubmit(data: CreateTaxTypeRequest) {
    return adminTaxTypesApi.create(data);
  }

  return <TaxTypeForm mode="create" onSubmit={handleSubmit} />;
}
