'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { catalogueApi, portalApi } from '@wholo/api-client';
import type { DistributorInfo } from '@wholo/types';
import { TradeRelationshipStatus } from '@wholo/types';
import { useAuth } from './auth-context';

export type RelationshipStatus = TradeRelationshipStatus | 'NONE';

export type ConnectCtaKind = 'connect' | 'pending' | 'suspended' | null;

/**
 * What the "Connect" area should show for a given relationship status —
 * shared by both CTA sites (KeyInfo, DistributorPageHeader) so they can't
 * drift on this business rule. INACTIVE is treated the same as NONE: the
 * customer-initiated request-access endpoint allows re-requesting from
 * INACTIVE, so there's a real action to offer, unlike SUSPENDED.
 */
export function connectCtaKind(status: RelationshipStatus | null): ConnectCtaKind {
  if (status === 'NONE' || status === TradeRelationshipStatus.INACTIVE) return 'connect';
  if (status === TradeRelationshipStatus.PENDING_INVITE || status === TradeRelationshipStatus.PENDING_REQUEST) {
    return 'pending';
  }
  if (status === TradeRelationshipStatus.SUSPENDED) return 'suspended';
  return null; // ACTIVE, or still loading (null)
}

interface DistributorContextValue {
  distributor: DistributorInfo | null;
  bannerScrolledPast: boolean;
  setBannerScrolledPast: (past: boolean) => void;
  relationshipStatus: RelationshipStatus | null;
  relationshipMinSpend: number | null;
  refetchRelationship: () => Promise<void>;
  requestAccess: (recentContact: boolean) => Promise<void>;
}

const DistributorContext = createContext<DistributorContextValue>({
  distributor: null,
  bannerScrolledPast: false,
  setBannerScrolledPast: () => {},
  relationshipStatus: null,
  relationshipMinSpend: null,
  refetchRelationship: async () => {},
  requestAccess: async () => {},
});

export function DistributorProvider({ distributorSlug, children }: { distributorSlug: string; children: ReactNode }) {
  const { user, accessToken, orderAsMode, orderAsCustomerId } = useAuth();
  const [distributor, setDistributor] = useState<DistributorInfo | null>(null);
  const [bannerScrolledPast, setBannerScrolledPastState] = useState(false);
  const [relationshipStatus, setRelationshipStatus] = useState<RelationshipStatus | null>(null);
  const [relationshipMinSpend, setRelationshipMinSpend] = useState<number | null>(null);

  useEffect(() => {
    catalogueApi.getDistributor(distributorSlug).then(setDistributor).catch(() => {});
  }, [distributorSlug]);

  const customerId = orderAsCustomerId ?? user?.organisationId ?? null;

  const refetchRelationship = useCallback(async () => {
    if (!accessToken || !customerId) {
      setRelationshipStatus('NONE');
      setRelationshipMinSpend(null);
      return;
    }
    const rel = await portalApi.getDistributorRelationship(distributorSlug, customerId, accessToken);
    setRelationshipStatus(rel?.status ?? 'NONE');
    setRelationshipMinSpend(
      rel?.status === TradeRelationshipStatus.ACTIVE && rel.minimumOrderSpend != null
        ? parseFloat(rel.minimumOrderSpend)
        : null,
    );
  }, [distributorSlug, accessToken, customerId]);

  useEffect(() => {
    refetchRelationship().catch(() => {});
  }, [refetchRelationship, orderAsMode]);

  const setBannerScrolledPast = useCallback((past: boolean) => setBannerScrolledPastState(past), []);

  const requestAccess = useCallback(
    async (recentContact: boolean) => {
      if (!accessToken || !customerId) throw new Error('Not signed in');
      await portalApi.requestDistributorAccess(distributorSlug, customerId, recentContact, accessToken);
      await refetchRelationship();
    },
    [distributorSlug, accessToken, customerId, refetchRelationship],
  );

  return (
    <DistributorContext.Provider
      value={{
        distributor,
        bannerScrolledPast,
        setBannerScrolledPast,
        relationshipStatus,
        relationshipMinSpend,
        refetchRelationship,
        requestAccess,
      }}
    >
      {children}
    </DistributorContext.Provider>
  );
}

export function useDistributor() {
  return useContext(DistributorContext);
}
