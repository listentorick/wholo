'use client';

import { useEffect, useState } from 'react';
import { deliveryApi } from '@wholo/api-client';
import { useAuth } from '@/lib/auth-context';
import { useDistributor } from '@/lib/distributor-context';

function TruckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 flex-shrink-0">
      <rect x="1" y="3" width="15" height="13" rx="1" />
      <path d="M16 8h4l3 3v5h-7V8z" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}

function getOrdinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

export interface DeliveryParts {
  time: string;
  cutoffDayLabel: string;
  dayName: string;
  dayOrdinal: string;
}

export function formatDeliveryParts(dateStr: string, cutoffDeadline: string): DeliveryParts {
  const cutoff = new Date(cutoffDeadline);

  const hours = cutoff.getHours();
  const minutes = cutoff.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  const hour12 = hours % 12 || 12;
  const time = `${hour12}:${minutes}${ampm}`;

  const cutoffLocalMidnight = new Date(cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate());
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const tomorrowMidnight = new Date(todayMidnight);
  tomorrowMidnight.setDate(tomorrowMidnight.getDate() + 1);

  let cutoffDayLabel: string;
  if (cutoffLocalMidnight.getTime() === todayMidnight.getTime()) {
    cutoffDayLabel = 'today';
  } else if (cutoffLocalMidnight.getTime() === tomorrowMidnight.getTime()) {
    cutoffDayLabel = 'tomorrow';
  } else {
    cutoffDayLabel = cutoff.toLocaleDateString(undefined, { weekday: 'long' });
  }

  const [year, month, day] = dateStr.split('-').map(Number);
  const deliveryDate = new Date(year, month - 1, day);
  const dayName = deliveryDate.toLocaleDateString(undefined, { weekday: 'long' });
  const dayNum = deliveryDate.getDate();

  return { time, cutoffDayLabel, dayName, dayOrdinal: `${dayNum}${getOrdinalSuffix(dayNum)}` };
}

export function DistributorPageHeader({ distributorSlug }: { distributorSlug: string }) {
  const { distributor, hasRelationship, relationshipMinSpend } = useDistributor();
  const { accessToken, orderAsMode } = useAuth();
  const [deliveryParts, setDeliveryParts] = useState<DeliveryParts | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    deliveryApi
      .getAvailableDates(distributorSlug, accessToken)
      .then(({ dates }) => {
        if (dates.length > 0) {
          setDeliveryParts(formatDeliveryParts(dates[0].date, dates[0].cutoffDeadline));
        }
      })
      .catch(() => {});
  }, [accessToken, distributorSlug, orderAsMode]);

  const logoUrl = distributor?.logoUrl ?? null;
  const name = distributor?.name ?? distributorSlug;

  const effectiveMinSpend =
    hasRelationship === true
      ? relationshipMinSpend
      : hasRelationship === false
        ? (distributor?.minimumOrderSpend ?? null)
        : null;

  return (
    <div className="border-b border-border px-5 py-5">
      <div className="flex items-center gap-3">
        {logoUrl && (
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="" className="h-full w-full object-cover" draggable={false} />
          </span>
        )}
        <span className="text-base font-semibold text-foreground">{name}</span>
      </div>

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

      {hasRelationship === false && (
        <div className="mt-3">
          <button
            className="rounded bg-[#D97036] px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            onClick={() => {}}
          >
            Add this supplier
          </button>
        </div>
      )}
    </div>
  );
}
