import { Injectable } from '@nestjs/common';
import { DeliveryAvailabilityResponse } from '@wholo/types';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveryAvailabilityProvider } from './delivery-availability.provider';

const MAX_DAYS_AHEAD = 60;
const MAX_RESULTS = 8;

function subtractDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function computeCutoffDeadline(
  deliveryDate: Date,
  cutoffTime: string,
  nProcessingDays: number,
  processingDaySet: Set<number>,
): Date {
  const cursor = new Date(deliveryDate.getTime());
  let remaining = nProcessingDays;

  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (processingDaySet.has(cursor.getUTCDay())) {
      remaining--;
    }
  }

  const [h, m] = cutoffTime.split(':').map(Number);
  cursor.setUTCHours(h, m, 0, 0);
  return cursor;
}

@Injectable()
export class WholoRuleBasedDeliveryAvailabilityProvider extends DeliveryAvailabilityProvider {
  constructor(private prisma: PrismaService) {
    super();
  }

  async getAvailableDates(
    distributorId: string,
    traderCustomerId: string,
  ): Promise<DeliveryAvailabilityResponse> {
    const rel = await this.prisma.tradeRelationship.findUnique({
      where: { distributorId_customerId: { distributorId, customerId: traderCustomerId } },
      select: {
        traderCustomerSettings: {
          select: {
            deliveryProfileId: true,
            deliveryProfile: {
              select: {
                id: true,
                defaultWeekdays: true,
                defaultCutoffTime: true,
                defaultCutoffProcessingDays: true,
                speciallyEnabledDates: true,
                speciallyDisabledDates: true,
                cutoffRules: {
                  select: { weekday: true, cutoffTime: true, processingDaysBeforeDelivery: true },
                },
              },
            },
          },
        },
      },
    });

    const settings = rel?.traderCustomerSettings;

    if (!settings?.deliveryProfileId || !settings.deliveryProfile) {
      return { dates: [], profileId: null };
    }

    const profile = settings.deliveryProfile;

    const distributorSettings = await this.prisma.distributorSettings.findUnique({
      where: { distributorId },
      select: { processingDays: true },
    });
    const processingDaySet = new Set<number>(
      distributorSettings?.processingDays ?? [1, 2, 3, 4, 5],
    );

    const speciallyDisabledSet = new Set(
      profile.speciallyDisabledDates.map(toIsoDate),
    );
    const speciallyEnabledSet = new Set(
      profile.speciallyEnabledDates.map(toIsoDate),
    );

    const cutoffRuleByWeekday = new Map(
      profile.cutoffRules.map((r) => [r.weekday, r]),
    );

    const defaultWeekdaySet = new Set(profile.defaultWeekdays);
    const now = new Date();

    const results: { date: string; cutoffDeadline: string }[] = [];

    const candidate = new Date(now);
    candidate.setUTCDate(candidate.getUTCDate() + 1);
    candidate.setUTCHours(0, 0, 0, 0);

    const limit = new Date(now);
    limit.setUTCDate(limit.getUTCDate() + MAX_DAYS_AHEAD);

    while (candidate <= limit && results.length < MAX_RESULTS) {
      const isoDate = toIsoDate(candidate);
      const weekday = candidate.getUTCDay();

      if (!speciallyDisabledSet.has(isoDate)) {
        const isEnabled = speciallyEnabledSet.has(isoDate) || defaultWeekdaySet.has(weekday);

        if (isEnabled) {
          const rule = cutoffRuleByWeekday.get(weekday);
          const cutoffTime = rule?.cutoffTime ?? profile.defaultCutoffTime;
          const processingDays = rule?.processingDaysBeforeDelivery ?? profile.defaultCutoffProcessingDays;

          const cutoffDeadline = computeCutoffDeadline(candidate, cutoffTime, processingDays, processingDaySet);

          if (cutoffDeadline > now) {
            results.push({ date: isoDate, cutoffDeadline: cutoffDeadline.toISOString() });
          }
        }
      }

      candidate.setUTCDate(candidate.getUTCDate() + 1);
    }

    return { dates: results, profileId: profile.id };
  }
}
