'use client';

import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { CustomerForm } from '@/components/customers/CustomerForm';
import { adminCustomersApi } from '@wholo/admin-api-client';
import type { CreateCustomerRequest } from '@wholo/types';

export default function NewCustomerPage() {
  const { isLoading } = useRequireAuth();
  const { accessToken } = useAuth();
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  async function handleSubmit(data: CreateCustomerRequest) {
    if (!accessToken) return;
    const result = await adminCustomersApi.create(accessToken, data);
    return { inviteUrl: result.inviteUrl };
  }

  return (
    <AdminLayout>
      <CustomerForm
        mode="create"
        token={accessToken ?? ''}
        onSubmit={handleSubmit}
      />
    </AdminLayout>
  );
}
