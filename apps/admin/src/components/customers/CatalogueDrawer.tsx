'use client';

import { useState, useEffect } from 'react';
import { Drawer } from '@/components/Drawer';
import { CatalogueForm } from '@/components/catalogues/CatalogueForm';
import { useAuth } from '@/lib/auth-context';
import { adminCataloguesApi } from '@wholo/admin-api-client';
import type { Catalogue } from '@wholo/types';

interface CatalogueDrawerProps {
  catalogueId: string;
  onClose: () => void;
}

export function CatalogueDrawer({ catalogueId, onClose }: CatalogueDrawerProps) {
  const { accessToken } = useAuth();
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    adminCataloguesApi.get(accessToken, catalogueId)
      .then(setCatalogue)
      .catch(() => setError('Failed to load catalogue.'))
      .finally(() => setLoading(false));
  }, [accessToken, catalogueId]);

  return (
    <Drawer onClose={onClose} width={680}>
      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : catalogue ? (
          <CatalogueForm
            mode="edit"
            catalogue={catalogue}
            token={accessToken!}
            onSuccess={onClose}
            onCancel={onClose}
          />
        ) : null}
      </div>
    </Drawer>
  );
}
