'use client';

import { useState, useEffect } from 'react';
import { Drawer } from '@/components/Drawer';
import { PriceListForm } from '@/components/price-lists/PriceListForm';
import { useAuth } from '@/lib/auth-context';
import { adminPriceListsApi } from '@wholo/admin-api-client';
import type { PriceList, CreatePriceListRequest } from '@wholo/types';

interface PriceListDrawerProps {
  priceListId: string;
  onClose: () => void;
}

export function PriceListDrawer({ priceListId, onClose }: PriceListDrawerProps) {
  const { accessToken } = useAuth();
  const [priceList, setPriceList] = useState<PriceList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    adminPriceListsApi.get(accessToken, priceListId)
      .then(setPriceList)
      .catch(() => setError('Failed to load price list.'))
      .finally(() => setLoading(false));
  }, [accessToken, priceListId]);

  async function handleSubmit(data: CreatePriceListRequest): Promise<PriceList> {
    const updated = await adminPriceListsApi.update(accessToken!, priceListId, data);
    setPriceList(updated);
    return updated;
  }

  return (
    <Drawer onClose={onClose} width={620}>
      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : priceList ? (
          <PriceListForm
            mode="edit"
            token={accessToken!}
            initialValues={priceList}
            onSubmit={handleSubmit}
            onCancel={onClose}
          />
        ) : null}
      </div>
    </Drawer>
  );
}
