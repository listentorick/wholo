'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useDistributor, connectCtaKind, type RelationshipStatus } from '@/lib/distributor-context';
import { RelationshipStatusBadge } from '@/components/RelationshipStatusBadge';
import { ConnectConfirmationModal } from '@/components/ConnectConfirmationModal';
import { Button } from '@/components/Button';

type Variant = 'header' | 'condensed' | 'section';

/**
 * "Add this supplier" / pending / suspended call-to-action for a not-yet-active
 * relationship. Extracted from the old About page so all three storefront sites
 * (shop header, condensed sticky header, About section) share one implementation
 * of the request-access flow. Renders nothing once the relationship is ACTIVE.
 *
 * - `section`   — full treatment: explainer copy + full-width button.
 * - `header`    — inline button beside the shop-header actions.
 * - `condensed` — compact button for the sticky condensed header.
 */
export function RelationshipCta({
  distributorName,
  relationshipStatus,
  variant,
}: {
  distributorName: string;
  relationshipStatus: RelationshipStatus | null;
  variant: Variant;
}) {
  const { requestAccess } = useDistributor();
  const [showConfirm, setShowConfirm] = useState(false);
  const ctaKind = connectCtaKind(relationshipStatus);

  if (!ctaKind) return null;

  async function handleConfirm(recentContact: boolean) {
    await requestAccess(recentContact);
    setShowConfirm(false);
  }

  const modal = showConfirm && (
    <ConnectConfirmationModal
      distributorName={distributorName}
      onConfirm={handleConfirm}
      onClose={() => setShowConfirm(false)}
    />
  );

  if (ctaKind === 'pending') {
    return (
      <div className={variant === 'section' ? 'mt-5 border-t border-border pt-4' : ''}>
        <RelationshipStatusBadge label="Pending" tone="yellow" />
        {variant === 'section' && (
          <p className="mt-1.5 text-xs text-muted">Your request is with this wholesaler.</p>
        )}
      </div>
    );
  }

  if (ctaKind === 'suspended') {
    return (
      <div className={`flex flex-col gap-1.5 ${variant === 'section' ? 'mt-5 border-t border-border pt-4' : ''}`}>
        <RelationshipStatusBadge label="Suspended" tone="red" />
        <p className="text-xs text-muted">Suspended &mdash; contact this wholesaler</p>
      </div>
    );
  }

  // ctaKind === 'connect'
  if (variant === 'section') {
    return (
      <div className="mt-5 border-t border-border pt-4">
        <p className="mb-3 text-sm text-muted">Request access to see your pricing and place orders.</p>
        <Button fullWidth onClick={() => setShowConfirm(true)}>
          <Plus className="h-4 w-4" strokeWidth={2.25} />
          Add this supplier
        </Button>
        {modal}
      </div>
    );
  }

  return (
    <>
      <Button
        variant="primary"
        onClick={() => setShowConfirm(true)}
        className={variant === 'header' ? 'flex-1 md:flex-none' : undefined}
      >
        <Plus className="h-4 w-4" strokeWidth={2.25} />
        Add this supplier
      </Button>
      {modal}
    </>
  );
}
