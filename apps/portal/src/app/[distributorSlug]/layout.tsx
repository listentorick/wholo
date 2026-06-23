'use client';

import { useParams } from 'next/navigation';
import { CartProvider } from '@/lib/cart-context';
import { DistributorProvider, useDistributor } from '@/lib/distributor-context';
import { NavigationSidebar } from '@/components/NavigationSidebar';
import { DistributorHeader } from '@/components/DistributorHeader';
import { OrderAsBanner } from '@/components/OrderAsBanner';
import { OrderAsHandler } from '@/components/OrderAsHandler';
import { DistributorNav } from '@/components/DistributorNav';
import { BrandingBanner } from '@/components/BrandingBanner';

function DistributorMain({
  distributorSlug,
  children,
}: {
  distributorSlug: string;
  children: React.ReactNode;
}) {
  const { distributor, setBannerScrolledPast } = useDistributor();

  return (
    <main className="flex flex-1 flex-col min-w-0 bg-white pt-14 md:pt-0">
      <DistributorHeader distributorSlug={distributorSlug} />
      <OrderAsHandler />
      <OrderAsBanner />
      <DistributorNav distributorSlug={distributorSlug} />
      <BrandingBanner
        logoUrl={distributor?.logoUrl ?? null}
        bannerUrl={distributor?.bannerUrl ?? null}
        dominantColor={distributor?.bannerDominantColor ?? null}
        onScrolledPast={setBannerScrolledPast}
      />
      <div style={{ paddingTop: distributor?.logoUrl ? '44px' : undefined }}>
        {children}
      </div>
    </main>
  );
}

export default function DistributorLayout({ children }: { children: React.ReactNode }) {
  const { distributorSlug } = useParams<{ distributorSlug: string }>();

  return (
    <DistributorProvider distributorSlug={distributorSlug}>
      <CartProvider distributorSlug={distributorSlug}>
        <div className="flex min-h-screen">
          <NavigationSidebar distributorSlug={distributorSlug} />
          <DistributorMain distributorSlug={distributorSlug}>
            {children}
          </DistributorMain>
        </div>
      </CartProvider>
    </DistributorProvider>
  );
}
