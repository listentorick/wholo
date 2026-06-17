'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { catalogueApi } from '@wholo/api-client';
import type { DistributorInfo } from '@wholo/types';

interface DistributorContextValue {
  distributor: DistributorInfo | null;
  bannerScrolledPast: boolean;
  setBannerScrolledPast: (past: boolean) => void;
}

const DistributorContext = createContext<DistributorContextValue>({
  distributor: null,
  bannerScrolledPast: false,
  setBannerScrolledPast: () => {},
});

export function DistributorProvider({ distributorSlug, children }: { distributorSlug: string; children: ReactNode }) {
  const [distributor, setDistributor] = useState<DistributorInfo | null>(null);
  const [bannerScrolledPast, setBannerScrolledPastState] = useState(false);

  useEffect(() => {
    catalogueApi.getDistributor(distributorSlug).then(setDistributor).catch(() => {});
  }, [distributorSlug]);

  const setBannerScrolledPast = useCallback((past: boolean) => setBannerScrolledPastState(past), []);

  return (
    <DistributorContext.Provider value={{ distributor, bannerScrolledPast, setBannerScrolledPast }}>
      {children}
    </DistributorContext.Provider>
  );
}

export function useDistributor() {
  return useContext(DistributorContext);
}
