'use client';

import { useParams } from 'next/navigation';
import { CartProvider } from '@/lib/cart-context';
import { DistributorNav } from '@/components/DistributorNav';

export default function DistributorLayout({ children }: { children: React.ReactNode }) {
  const { distributorSlug } = useParams<{ distributorSlug: string }>();

  return (
    <CartProvider distributorSlug={distributorSlug}>
      <div className="flex min-h-screen flex-col bg-white">
        <DistributorNav distributorSlug={distributorSlug} />
        {children}
      </div>
    </CartProvider>
  );
}
