'use client';

import { PaymentTermForm } from '@/components/payment-terms/PaymentTermForm';
import { ListErrorBanner } from '@/components/list/ListErrorBanner';
import { ListPageHeader } from '@/components/list/ListPageHeader';
import { useCan } from '@/lib/permissions';
import { adminPaymentTermsApi } from '@wholo/admin-api-client';
import { Permission, type CreatePaymentTermRequest } from '@wholo/types';

export default function NewPaymentTermPage() {
  const can = useCan();

  // The list page hides "New payment term" from people who can't use it;
  // this covers someone arriving here by URL.
  if (!can(Permission.CUSTOMERS_MANAGE)) {
    return (
      <>
        <ListPageHeader title="New payment term" />
        <ListErrorBanner message={'You don’t have permission to create payment terms.'} />
      </>
    );
  }

  return (
    <PaymentTermForm mode="create" onSubmit={(data: CreatePaymentTermRequest) => adminPaymentTermsApi.create(data)} />
  );
}
