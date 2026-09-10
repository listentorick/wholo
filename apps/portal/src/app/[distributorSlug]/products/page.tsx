'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageShell, PageSpinner } from '@/components/PageShell';

/**
 * The catalogue is no longer its own route — it's the `#catalogue` section of
 * the single-page storefront. This alias keeps old links / bookmarks working
 * (product detail stays at `/[slug]/products/[id]`).
 */
export default function ProductsRedirect() {
  const params = useParams();
  const router = useRouter();
  const distributorSlug = params.distributorSlug as string;

  useEffect(() => {
    router.replace(`/${distributorSlug}#catalogue`);
  }, [router, distributorSlug]);

  return (
    <PageShell center>
      <PageSpinner />
    </PageShell>
  );
}
