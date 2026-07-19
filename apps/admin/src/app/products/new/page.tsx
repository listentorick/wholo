'use client';

import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { ProductForm } from '@/components/products/ProductForm';
import { adminProductsApi } from '@wholo/admin-api-client';
import type { CreateProductRequest } from '@wholo/types';

export default function NewProductPage() {
  const { isLoading } = useRequireAuth();
  const { accessToken } = useAuth();
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  async function handleSubmit(data: CreateProductRequest) {
    if (!accessToken) return;
    await adminProductsApi.create(accessToken, data);
    router.push('/products');
  }

  return (
    <AdminLayout>
      <ProductForm
        mode="create"
        token={accessToken ?? ''}
        onSubmit={handleSubmit}
      />
    </AdminLayout>
  );
}
