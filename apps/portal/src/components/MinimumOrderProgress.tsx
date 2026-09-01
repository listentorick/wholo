'use client';

import { formatMoney } from '@wholo/types';
import { useDistributor } from '@/lib/distributor-context';

export interface MinimumOrderProgressProps {
  subtotal: number;
  minimum: number | null;
  /** compact = shop header treatment; prominent = checkout order-summary treatment. */
  size?: 'compact' | 'prominent';
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 flex-shrink-0">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
  );
}

export function MinimumOrderProgress({ subtotal, minimum, size = 'compact' }: MinimumOrderProgressProps) {
  const { distributor } = useDistributor();
  const currencyCode = distributor?.currencyCode ?? 'GBP';

  if (minimum === null || minimum <= 0) return null;

  const met = subtotal >= minimum;

  if (met) {
    return (
      <div className="mt-3 flex items-center gap-2 text-sm text-success">
        <CheckIcon />
        <span>
          {size === 'prominent'
            ? `You've met the ${formatMoney(minimum, currencyCode)} minimum order value`
            : 'Minimum order value met'}
        </span>
      </div>
    );
  }

  const remaining = minimum - subtotal;
  const pct = Math.min(100, (subtotal / minimum) * 100);

  return (
    <div
      className={
        size === 'compact'
          ? 'mt-3 rounded-lg border border-amber-border bg-amber-light/60 px-3.5 py-3'
          : 'mt-3'
      }
    >
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-amber-border/50">
        <div
          className="h-full rounded-full bg-amber transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-foreground-tertiary">
        Add {formatMoney(remaining, currencyCode)} more to reach the {formatMoney(minimum, currencyCode)} minimum order
      </p>
    </div>
  );
}
