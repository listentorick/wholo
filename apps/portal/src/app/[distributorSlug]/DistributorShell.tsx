'use client';

import { CartProvider } from '@/lib/cart-context';
import { useAuth } from '@/lib/auth-context';
import { DistributorProvider, useDistributor } from '@/lib/distributor-context';
import { PortalTopBar } from '@/components/portal/PortalTopBar';
import { PlatformNavStrip } from '@/components/portal/PlatformNavStrip';
import { PortalFooter } from '@/components/portal/PortalFooter';
import { OrderAsBanner } from '@/components/OrderAsBanner';
import { OrderAsHandler } from '@/components/OrderAsHandler';
import type { DistributorInfo } from '@wholo/types';

function DistributorMain({ children }: { children: React.ReactNode }) {
  const { distributor } = useDistributor();

  return (
    <div className="flex min-h-screen flex-col bg-page">
      <OrderAsBanner />
      <OrderAsHandler />
      <PortalTopBar variant="distributor" />
      <PlatformNavStrip distributorName={distributor?.name} />
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
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
        <DistributorMain>{children}</DistributorMain>
      </CartProvider>
    </DistributorProvider>
  );
}
