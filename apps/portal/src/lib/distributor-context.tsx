'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { catalogueApi, portalApi } from '@wholo/api-client';
import type { DistributorInfo } from '@wholo/types';
import { useAuth } from './auth-context';

interface DistributorContextValue {
  distributor: DistributorInfo | null;
  bannerScrolledPast: boolean;
  setBannerScrolledPast: (past: boolean) => void;
  hasRelationship: boolean | null;
  relationshipMinSpend: number | null;
}

const DistributorContext = createContext<DistributorContextValue>({
  distributor: null,
  bannerScrolledPast: false,
  setBannerScrolledPast: () => {},
  hasRelationship: null,
  relationshipMinSpend: null,
});

export function DistributorProvider({ distributorSlug, children }: { distributorSlug: string; children: ReactNode }) {
  const { accessToken, orderAsMode } = useAuth();
  const [distributor, setDistributor] = useState<DistributorInfo | null>(null);
  const [bannerScrolledPast, setBannerScrolledPastState] = useState(false);
  const [hasRelationship, setHasRelationship] = useState<boolean | null>(null);
  const [relationshipMinSpend, setRelationshipMinSpend] = useState<number | null>(null);

  useEffect(() => {
    catalogueApi.getDistributor(distributorSlug).then(setDistributor).catch(() => {});
  }, [distributorSlug]);

  useEffect(() => {
    if (!accessToken) {
      setHasRelationship(false);
      setRelationshipMinSpend(null);
      return;
    }
    portalApi
      .getMyDistributors(accessToken)
      .then((distributors) => {
        const matched = distributors.find((d) => d.slug === distributorSlug);
        setHasRelationship(matched != null);
        setRelationshipMinSpend(matched?.minimumOrderSpend ?? null);
      })
      .catch(() => {});
  }, [distributorSlug, accessToken, orderAsMode]);

  const setBannerScrolledPast = useCallback((past: boolean) => setBannerScrolledPastState(past), []);

  return (
    <DistributorContext.Provider value={{ distributor, bannerScrolledPast, setBannerScrolledPast, hasRelationship, relationshipMinSpend }}>
      {children}
    </DistributorContext.Provider>
  );
}

export function useDistributor() {
  return useContext(DistributorContext);
}
