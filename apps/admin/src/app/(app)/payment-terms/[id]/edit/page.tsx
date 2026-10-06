'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useCan } from '@/lib/permissions';
import { PaymentTermForm } from '@/components/payment-terms/PaymentTermForm';
import { adminPaymentTermsApi } from '@wholo/admin-api-client';
import { Permission, type AccountingProvider, type PaymentTerm, type CreatePaymentTermRequest } from '@wholo/types';

export default function EditPaymentTermPage() {
  const { accessToken } = useAuth();
  const canManage = useCan()(Permission.CUSTOMERS_MANAGE);
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [term, setTerm] = useState<PaymentTerm | null>(null);
  const [provider, setProvider] = useState<AccountingProvider | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    adminPaymentTermsApi
      .get(id)
      .then(async (found) => {
        // Only the built-in term is named after the integration.
        if (found.isSystem) setProvider((await adminPaymentTermsApi.list()).accountingProvider);
        setTerm(found);
      })
      .catch(() => setError('Payment term not found.'))
      .finally(() => setIsLoading(false));
  }, [accessToken, id]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (error || !term) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
        {error ?? 'Payment term not found.'}
      </div>
    );
  }

  async function handleSubmit(data: CreatePaymentTermRequest) {
    const { makeDefault: _ignored, ...changes } = data;
    const updated = await adminPaymentTermsApi.update(id, changes);
    setTerm(updated);
    return updated;
  }

  return (
    <PaymentTermForm
      // Remount after a save so the form shows what was stored.
      key={term.updatedAt}
      mode="edit"
      initialValues={term}
      onSubmit={handleSubmit}
      readOnly={!canManage}
      accountingProvider={provider}
      onMakeDefault={canManage ? async () => setTerm(await adminPaymentTermsApi.makeDefault(id)) : undefined}
      onReactivate={canManage ? async () => setTerm(await adminPaymentTermsApi.update(id, { active: true })) : undefined}
      onDeactivate={
        canManage
          ? async () => {
              await adminPaymentTermsApi.deactivate(id);
              router.push('/payment-terms');
            }
          : undefined
      }
    />
  );
}
