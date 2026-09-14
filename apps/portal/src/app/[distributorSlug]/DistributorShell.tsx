'use client';

import { usePathname } from 'next/navigation';
import { CartProvider } from '@/lib/cart-context';
import { useAuth } from '@/lib/auth-context';
import { DistributorProvider, useDistributor } from '@/lib/distributor-context';
import { StorefrontSearchProvider } from '@/lib/storefront-search';
import { PortalTopBar } from '@/components/portal/PortalTopBar';
import { PlatformNavStrip } from '@/components/portal/PlatformNavStrip';
import { PortalFooter } from '@/components/portal/PortalFooter';
import { OrderAsBanner } from '@/components/OrderAsBanner';
import { OrderAsHandler } from '@/components/OrderAsHandler';
import { ScrollReset } from '@/components/portal/ScrollReset';
import { StorefrontChrome } from '@/components/storefront/StorefrontChrome';
import { STOREFRONT_MAIN_ID, isOrdersRoute, isProductDetailRoute, isStorefrontRoute } from '@/lib/distributor-routes';
import type { DistributorInfo } from '@wholo/types';

function DistributorMain({ distributorSlug, children }: { distributorSlug: string; children: React.ReactNode }) {
  const { distributor } = useDistributor();
  const pathname = usePathname() ?? '';

  // The storefront chrome lives here (not in the pages) so it never remounts when
  // navigating between the storefront, a product page, and orders. Shown on
  // those routes; checkout stays bare.
  const isStorefront = isStorefrontRoute(distributorSlug, pathname);
  const isProductDetail = isProductDetailRoute(distributorSlug, pathname);
  const isOrders = isOrdersRoute(distributorSlug, pathname);
  const showChrome = isStorefront || isProductDetail || isOrders;

  return (
    <div className="flex min-h-screen flex-col bg-page">
      <OrderAsBanner />
      <OrderAsHandler />
      <ScrollReset distributorSlug={distributorSlug} />
      <PortalTopBar variant="distributor" />
      <PlatformNavStrip slug={distributorSlug} distributorName={distributor?.name} />
      <StorefrontSearchProvider>
        {showChrome && (
          <StorefrontChrome
            slug={distributorSlug}
            mode={isStorefront ? 'spy' : 'link'}
            activeTab={isOrders ? 'orders' : 'catalogue'}
          />
        )}
        <main
          id={STOREFRONT_MAIN_ID}
          className="flex min-w-0 flex-1 flex-col scroll-mt-[var(--sticky-stack-h,0px)]"
        >
          {children}
        </main>
      </StorefrontSearchProvider>
      <PortalFooter />
    </div>
  );
}

export function DistributorShell({
  distributorSlug,
  initialDistributor,
  children,
}: {
  distributorSlug: string;
  initialDistributor: DistributorInfo;
  children: React.ReactNode;
}) {
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
    <DistributorProvider distributorSlug={distributorSlug} initialDistributor={initialDistributor}>
      <CartProvider distributorSlug={distributorSlug}>
        <DistributorMain distributorSlug={distributorSlug}>{children}</DistributorMain>
      </CartProvider>
    </DistributorProvider>
  );
}
