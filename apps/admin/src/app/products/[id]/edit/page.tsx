'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { ProductForm } from '@/components/products/ProductForm';
import { adminProductsApi } from '@wholo/admin-api-client';
import type { Product, UpdateProductRequest } from '@wholo/types';

export default function EditProductPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !params?.id) return;
    adminProductsApi
      .get(accessToken, params.id)
      .then(setProduct)
      .catch(() => setError('Product not found.'))
      .finally(() => setIsLoading(false));
  }, [accessToken, params?.id]);

  if (authLoading || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <AdminLayout>
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error ?? 'Product not found.'}
        </div>
      </AdminLayout>
    );
  }

  async function handleSubmit(data: UpdateProductRequest) {
    if (!accessToken || !product) return;
    await adminProductsApi.update(accessToken, product.id, data);
    router.push('/products');
  }

  async function handleDelete() {
    if (!accessToken || !product) return;
    await adminProductsApi.delete(accessToken, product.id);
    router.push('/products');
  }

  return (
    <AdminLayout>
      <ProductForm
        mode="edit"
        token={accessToken ?? ''}
        initialValues={product}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
      />
    </AdminLayout>
  );
}
