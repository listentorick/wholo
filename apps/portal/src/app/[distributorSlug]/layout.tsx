'use client';

import { useParams, usePathname } from 'next/navigation';
import { CartProvider } from '@/lib/cart-context';
import { useAuth } from '@/lib/auth-context';
import { DistributorProvider, useDistributor } from '@/lib/distributor-context';
import { NavigationSidebar } from '@/components/NavigationSidebar';
import { DistributorHeader } from '@/components/DistributorHeader';
import { OrderAsBanner } from '@/components/OrderAsBanner';
import { OrderAsHandler } from '@/components/OrderAsHandler';
import { DistributorNav } from '@/components/DistributorNav';
import { BrandingBanner } from '@/components/BrandingBanner';
import { DistributorPageHeader } from '@/components/DistributorPageHeader';

function DistributorMain({
  distributorSlug,
  children,
}: {
  distributorSlug: string;
  children: React.ReactNode;
}) {
  const { distributor, setBannerScrolledPast } = useDistributor();
  const pathname = usePathname();
  const isAboutPage = pathname === `/${distributorSlug}`;
  // Order-by-cutoff / minimum-order messaging is only relevant before you've
  // placed an order — suppress it on the orders list and order detail (invoice) views.
  const isOrdersPage = /^\/[^/]+\/orders(\/[^/]+)?$/.test(pathname ?? '');
  // Checkout carries its own order-summary rail (totals, minimum, delivery day),
  // so the shared sub-header would only duplicate it.
  const isCheckoutPage = pathname === `/${distributorSlug}/checkout`;

  return (
    <main className="flex flex-1 flex-col min-h-screen min-w-0 bg-white pt-14 md:pt-0">
      <DistributorHeader distributorSlug={distributorSlug} />
      <OrderAsHandler />
      <OrderAsBanner />
      <DistributorNav distributorSlug={distributorSlug} />
      {isAboutPage ? (
        <BrandingBanner
          logoUrl={distributor?.logoUrl ?? null}
          bannerUrl={distributor?.bannerUrl ?? null}
          dominantColor={distributor?.bannerDominantColor ?? null}
          onScrolledPast={setBannerScrolledPast}
        />
      ) : isOrdersPage || isCheckoutPage ? null : (
        <DistributorPageHeader distributorSlug={distributorSlug} />
      )}
      <div className="flex flex-1 flex-col min-w-0">
        {children}
      </div>
    </main>
  );
}

export default function DistributorLayout({ children }: { children: React.ReactNode }) {
  const { distributorSlug } = useParams<{ distributorSlug: string }>();
  const { authError, logout } = useAuth();

  if (authError) {
    return (
      <div className="flex min-h-screen flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-medium text-foreground">We couldn&apos;t sign you in</p>
        <p className="max-w-sm text-sm text-foreground-secondary">{authError}</p>
        <button
          onClick={logout}
          className="mt-2 rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <DistributorProvider distributorSlug={distributorSlug}>
      <CartProvider distributorSlug={distributorSlug}>
        <div className="flex">
          <NavigationSidebar distributorSlug={distributorSlug} />
          <DistributorMain distributorSlug={distributorSlug}>
            {children}
          </DistributorMain>
        </div>
      </CartProvider>
    </DistributorProvider>
  );
}
