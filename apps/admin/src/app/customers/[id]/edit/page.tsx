'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { CustomerForm } from '@/components/customers/CustomerForm';
import { adminCustomersApi } from '@wholo/admin-api-client';
import type { Customer, UpdateCustomerRequest } from '@wholo/types';

export default function EditCustomerPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !params?.id) return;
    adminCustomersApi
      .get(accessToken, params.id)
      .then(setCustomer)
      .catch(() => setError('Customer not found.'))
      .finally(() => setIsLoading(false));
  }, [accessToken, params?.id]);

  if (authLoading || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (error || !customer) {
    return (
      <AdminLayout>
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error ?? 'Customer not found.'}
        </div>
      </AdminLayout>
    );
  }

  async function handleSubmit(data: UpdateCustomerRequest) {
    if (!accessToken || !customer) return;
    await adminCustomersApi.update(accessToken, customer.id, data);
    router.push('/customers');
  }

  async function handleDelete() {
    if (!accessToken || !customer) return;
    await adminCustomersApi.delete(accessToken, customer.id);
    router.push('/customers');
  }

  async function handleInvite() {
    if (!accessToken || !customer) throw new Error('Not authenticated');
    return adminCustomersApi.invite(accessToken, customer.id);
  }

  return (
    <AdminLayout>
      <CustomerForm
        mode="edit"
        token={accessToken ?? ''}
        initialValues={customer}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
        onInvite={handleInvite}
      />
    </AdminLayout>
  );
}
