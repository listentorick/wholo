'use client';

import { useEffect, useState } from 'react';
import { deliveryApi } from '@wholo/api-client';

export interface DeliveryParts {
  time: string;
  cutoffDayLabel: string;
  dayName: string;
  dayOrdinal: string;
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

/**
 * Fetches the next available delivery date for a distributor and formats it for display.
 * Requires an active trade relationship with an assigned delivery profile — returns null
 * (not an error) when there isn't one, e.g. before the customer has connected.
 */
export function useDeliveryParts(
  distributorSlug: string,
  accessToken: string | null | undefined,
  options?: { enabled?: boolean; refreshKey?: unknown },
): DeliveryParts | null {
  const enabled = options?.enabled ?? true;
  const [deliveryParts, setDeliveryParts] = useState<DeliveryParts | null>(null);

  useEffect(() => {
    if (!enabled || !accessToken) {
      setDeliveryParts(null);
      return;
    }

    let cancelled = false;

    deliveryApi
      .getAvailableDates(distributorSlug)
      .then(({ dates }) => {
        if (cancelled) return;
        setDeliveryParts(dates.length > 0 ? formatDeliveryParts(dates[0].date, dates[0].cutoffDeadline) : null);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distributorSlug, accessToken, enabled, options?.refreshKey]);

  return deliveryParts;
}
