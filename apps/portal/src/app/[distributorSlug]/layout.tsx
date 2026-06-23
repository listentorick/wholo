'use client';

import { useParams } from 'next/navigation';
import { CartProvider } from '@/lib/cart-context';
import { DistributorProvider } from '@/lib/distributor-context';
import { NavigationSidebar } from '@/components/NavigationSidebar';
import { DistributorHeader } from '@/components/DistributorHeader';
import { OrderAsBanner } from '@/components/OrderAsBanner';
import { OrderAsHandler } from '@/components/OrderAsHandler';

export default function DistributorLayout({ children }: { children: React.ReactNode }) {
  const { distributorSlug } = useParams<{ distributorSlug: string }>();

  return (
    <DistributorProvider distributorSlug={distributorSlug}>
      <CartProvider distributorSlug={distributorSlug}>
        <div className="flex min-h-screen">
          <NavigationSidebar distributorSlug={distributorSlug} />
          <main className="flex flex-1 flex-col min-w-0 bg-white pt-14 md:pt-0">
            <DistributorHeader distributorSlug={distributorSlug} />
            <OrderAsHandler />
            <OrderAsBanner />
            {children}
          </main>
        </div>
      </CartProvider>
    </DistributorProvider>
  );
}
