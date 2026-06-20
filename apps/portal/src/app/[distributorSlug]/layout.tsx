'use client';

import { useParams } from 'next/navigation';
import { CartProvider } from '@/lib/cart-context';
import { DistributorProvider } from '@/lib/distributor-context';
import { DistributorNav } from '@/components/DistributorNav';
import { OrderAsBanner } from '@/components/OrderAsBanner';
import { OrderAsHandler } from '@/components/OrderAsHandler';

export default function DistributorLayout({ children }: { children: React.ReactNode }) {
  const { distributorSlug } = useParams<{ distributorSlug: string }>();

  return (
    <DistributorProvider distributorSlug={distributorSlug}>
      <CartProvider distributorSlug={distributorSlug}>
        <div className="flex min-h-screen flex-col bg-white">
          <OrderAsHandler />
          <OrderAsBanner />
          <DistributorNav distributorSlug={distributorSlug} />
          {children}
        </div>
      </CartProvider>
    </DistributorProvider>
  );
}
