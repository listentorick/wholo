'use client';

import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { CatalogueForm } from '@/components/catalogues/CatalogueForm';

export default function NewCataloguePage() {
  const { isLoading } = useRequireAuth();
  const { accessToken } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  return (
    <AdminLayout>
      <CatalogueForm mode="create" token={accessToken ?? ''} />
    </AdminLayout>
  );
}
