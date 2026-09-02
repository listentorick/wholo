'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ProductForm } from '@/components/products/ProductForm';
import { adminProductsApi } from '@wholo/admin-api-client';
import type { CreateProductRequest } from '@wholo/types';

export default function NewProductPage() {
  const { accessToken, user } = useAuth();
  const router = useRouter();

  async function handleSubmit(data: CreateProductRequest) {
    if (!accessToken) return;
    await adminProductsApi.create(accessToken, data);
    router.push('/products');
  }

  return (
    <ProductForm
      mode="create"
      token={accessToken ?? ''}
      currencyCode={user?.organisationCurrencyCode ?? 'GBP'}
      onSubmit={handleSubmit}
    />
  );
}
