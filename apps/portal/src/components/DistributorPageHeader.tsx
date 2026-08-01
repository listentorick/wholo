'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useDistributor, connectCtaKind } from '@/lib/distributor-context';
import { useDeliveryParts } from '@/lib/hooks/use-delivery-parts';
import { RelationshipStatusBadge } from './RelationshipStatusBadge';
import { ConnectConfirmationModal } from './ConnectConfirmationModal';
import { TradeRelationshipStatus } from '@wholo/types';

export function TruckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 flex-shrink-0">
      <rect x="1" y="3" width="15" height="13" rx="1" />
      <path d="M16 8h4l3 3v5h-7V8z" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}

export function DistributorPageHeader({ distributorSlug }: { distributorSlug: string }) {
  const { distributor, relationshipStatus, relationshipMinSpend, requestAccess } = useDistributor();
  const { accessToken, orderAsMode } = useAuth();
  const deliveryParts = useDeliveryParts(distributorSlug, accessToken, { refreshKey: orderAsMode });
  const [showConfirm, setShowConfirm] = useState(false);

  const effectiveMinSpend =
    relationshipStatus === TradeRelationshipStatus.ACTIVE
      ? relationshipMinSpend
      : relationshipStatus != null
        ? (distributor?.minimumOrderSpend ?? null)
        : null;
  const ctaKind = connectCtaKind(relationshipStatus);

  async function handleConfirm(recentContact: boolean) {
    await requestAccess(recentContact);
    setShowConfirm(false);
  }

  return (
    <div className="border-b border-border px-5 py-5">
      {deliveryParts && (
        <div className="mt-2.5 flex items-center gap-2 text-sm text-foreground-tertiary">
          <TruckIcon />
          <span>
            Order by <strong className="font-semibold text-foreground">{deliveryParts.time}</strong>
            {', '}{deliveryParts.cutoffDayLabel} for delivery on{' '}
            <strong className="font-semibold text-foreground">{deliveryParts.dayName} {deliveryParts.dayOrdinal}</strong>
          </span>
        </div>
      )}

      {effectiveMinSpend !== null && (
        <div className="mt-3 flex items-center gap-2 text-sm text-foreground-tertiary">
          <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-base leading-none">£</span>
          <span>£{effectiveMinSpend.toFixed(2)} minimum order value</span>
        </div>
      )}

      {ctaKind === 'connect' && (
        <div className="mt-3">
          <button
            className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            onClick={() => setShowConfirm(true)}
          >
            Add this supplier
          </button>
        </div>
      )}

      {ctaKind === 'pending' && (
        <div className="mt-3">
          <RelationshipStatusBadge label="Pending" tone="yellow" />
        </div>
      )}

      {ctaKind === 'suspended' && (
        <div className="mt-3 flex flex-col gap-1.5">
          <RelationshipStatusBadge label="Suspended" tone="red" />
          <p className="text-xs text-muted">Suspended — contact this wholesaler</p>
        </div>
      )}

      {showConfirm && distributor && (
        <ConnectConfirmationModal
          distributorName={distributor.name}
          onConfirm={handleConfirm}
          onClose={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
