'use client';

import { TaxTypeForm } from '@/components/tax-types/TaxTypeForm';
import { ListErrorBanner } from '@/components/list/ListErrorBanner';
import { ListPageHeader } from '@/components/list/ListPageHeader';
import { useCan } from '@/lib/permissions';
import { adminTaxTypesApi } from '@wholo/admin-api-client';
import { Permission, type CreateTaxTypeRequest } from '@wholo/types';

export default function NewTaxTypePage() {
  const can = useCan();

  async function handleSubmit(data: CreateTaxTypeRequest) {
    return adminTaxTypesApi.create(data);
  }

  // The list page hides the "New tax type" button from people who can't use it;
  // this covers someone arriving here by URL.
  if (!can(Permission.TAX_TYPES_MANAGE)) {
    return (
      <>
        <ListPageHeader title="New tax type" />
        <ListErrorBanner message={"You don\u2019t have permission to create tax types."} />
      </>
    );
  }

  return <TaxTypeForm mode="create" onSubmit={handleSubmit} />;
}
