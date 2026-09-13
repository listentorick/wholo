'use client';

import { formatMoney } from '@wholo/types';
import { useDistributor } from '@/lib/distributor-context';
import { useCartSafe } from '@/lib/cart-context';
import { TruckIcon, CheckIcon } from './icons';

/**
 * The pale-amber bar under the storefront tabs: the delivery cut-off line and,
 * while the customer is below the minimum, a progress bar toward it. Distinct
 * from the solid-amber `OrderAsBanner` (impersonation) that can sit above it.
 * Self-sufficient — reads delivery / minimum / cart context directly so it can
 * sit in the sticky block on any distributor page. Renders nothing when there's
 * neither a delivery line nor a minimum to report on.
 */
export function AmberOrderByBar() {
  const { distributor, deliveryParts, effectiveMinSpend } = useDistributor();
  const subtotal = useCartSafe()?.subtotal ?? 0;
  const currencyCode = distributor?.currencyCode ?? 'GBP';

  const hasMinimum = effectiveMinSpend !== null && effectiveMinSpend > 0;
  const minMet = hasMinimum && subtotal >= effectiveMinSpend!;
  const showMinBar = hasMinimum && !minMet;
  if (!deliveryParts && !hasMinimum) return null;

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

        {minMet && (
          <span className="flex items-center gap-2 text-success md:flex-1 md:justify-end">
            <CheckIcon />
            <span>
              Minimum order met — order total{' '}
              <strong className="font-semibold">{formatMoney(subtotal, currencyCode)}</strong>, minimum order value{' '}
              <strong className="font-semibold">{formatMoney(effectiveMinSpend!, currencyCode)}</strong>
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
