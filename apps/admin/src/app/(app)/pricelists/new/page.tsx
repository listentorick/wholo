'use client';

import { useAuth } from '@/lib/auth-context';
import { PriceListForm } from '@/components/price-lists/PriceListForm';
import { adminPriceListsApi } from '@wholo/admin-api-client';
import type { CreatePriceListRequest } from '@wholo/types';

export default function NewPriceListPage() {
  const { accessToken } = useAuth();

  async function handleSubmit(data: CreatePriceListRequest) {
    return adminPriceListsApi.create(accessToken!, data);
  }

  return <PriceListForm mode="create" token={accessToken!} onSubmit={handleSubmit} />;
}
