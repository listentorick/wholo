'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { CatalogueForm } from '@/components/catalogues/CatalogueForm';
import { adminCataloguesApi } from '@wholo/admin-api-client';
import type { Catalogue } from '@wholo/types';

export default function EditCataloguePage() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();
  const params = useParams<{ id: string }>();

  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !params?.id) return;
    adminCataloguesApi
      .get(accessToken, params.id)
      .then(setCatalogue)
      .catch(() => setError('Catalogue not found.'))
      .finally(() => setIsLoading(false));
  }, [accessToken, params?.id]);

  if (authLoading || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (error || !catalogue) {
    return (
      <AdminLayout>
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error ?? 'Catalogue not found.'}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <CatalogueForm
        mode="edit"
        catalogue={catalogue}
        token={accessToken ?? ''}
      />
    </AdminLayout>
  );
}
