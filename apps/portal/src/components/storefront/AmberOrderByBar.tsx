'use client';

import { formatMoney } from '@wholo/types';
import type { DeliveryParts } from '@/lib/hooks/use-delivery-parts';
import { useDistributor } from '@/lib/distributor-context';
import { TruckIcon } from './icons';

interface Props {
  deliveryParts: DeliveryParts | null;
  subtotal: number;
  effectiveMinSpend: number | null;
}

/**
 * The pale-amber bar under the storefront tabs: the delivery cut-off line and,
 * while the customer is below the minimum, a progress bar toward it. Distinct
 * from the solid-amber `OrderAsBanner` (impersonation) that can sit above it.
 * Renders nothing when there's neither a delivery line nor an unmet minimum.
 */
export function AmberOrderByBar({ deliveryParts, subtotal, effectiveMinSpend }: Props) {
  const { distributor } = useDistributor();
  const currencyCode = distributor?.currencyCode ?? 'GBP';

  const showMinBar = effectiveMinSpend !== null && effectiveMinSpend > 0 && subtotal < effectiveMinSpend;
  if (!deliveryParts && !showMinBar) return null;

  const remaining = showMinBar ? effectiveMinSpend! - subtotal : 0;
  const pct = showMinBar ? Math.min(100, (subtotal / effectiveMinSpend!) * 100) : 0;

  return (
    <div className="border-y border-amber-border bg-amber-light/70">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-2 px-4 py-2.5 text-sm text-muted md:flex-row md:items-center md:gap-6 md:px-8">
        {deliveryParts && (
          <span className="flex items-center gap-2 md:flex-1">
            <TruckIcon />
            <span>
              Order by <strong className="font-semibold text-foreground">{deliveryParts.time}</strong>
              {', '}
              {deliveryParts.cutoffDayLabel} for delivery on{' '}
              <strong className="font-semibold text-foreground">
                {deliveryParts.dayName} {deliveryParts.dayOrdinal}
              </strong>
            </span>
          </span>
        )}

        {showMinBar && (
          <span className="flex items-center gap-3 md:flex-1 md:justify-end">
            <span>
              Add <strong className="font-semibold text-foreground">{formatMoney(remaining, currencyCode)}</strong> more
              to reach the {formatMoney(effectiveMinSpend!, currencyCode)} minimum
            </span>
            <span className="h-1.5 w-24 flex-shrink-0 overflow-hidden rounded-full bg-amber-border/60">
              <span className="block h-full rounded-full bg-amber" style={{ width: `${pct}%` }} />
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
