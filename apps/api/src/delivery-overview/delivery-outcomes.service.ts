import { BadRequestException, Injectable } from '@nestjs/common';
import type { DeliveryOutcomeDay, DeliveryOutcomesResponse } from '@wholo/types';
import { PrismaService } from '../prisma/prisma.service';

export const MAX_OUTCOME_WINDOW_DAYS = 92;
const DAY_MS = 24 * 60 * 60 * 1000;

const parseDate = (value: string, field: string): Date => {
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new BadRequestException(`${field} is not a real calendar date`);
  return d;
};

// History, from delivery facts: what became of the deliveries committed to each
// day. Bucketed by the day they were committed to (falling back to the day they
// happened when an order was undated), so a day's bar is "how did the day we
// planned go". "On time" is delivered on or before that day; "late" after it.
// Definitions live here, on read, so they can change without rewriting facts.
//
// Only outcomes that have happened are counted: a day still in progress (or a
// delivery not yet attempted) is not a fact yet, so callers ask for completed
// days and take today from the live overview.
@Injectable()
export class DeliveryOutcomesService {
  constructor(private readonly prisma: PrismaService) {}

  async getDays(distributorId: string, from: string, to: string): Promise<DeliveryOutcomesResponse> {
    const fromDate = parseDate(from, 'from');
    const toDate = parseDate(to, 'to');
    const windowDays = Math.round((toDate.getTime() - fromDate.getTime()) / DAY_MS) + 1;
    if (windowDays < 1 || windowDays > MAX_OUTCOME_WINDOW_DAYS) {
      throw new BadRequestException(`Date window must be between 1 and ${MAX_OUTCOME_WINDOW_DAYS} days`);
    }

    const [settings, rows] = await Promise.all([
      this.prisma.distributorSettings.findUnique({ where: { distributorId }, select: { timezone: true } }),
      this.prisma.$queryRaw<Array<{ day: Date; onTime: number; late: number; failed: number }>>`
        SELECT COALESCE("committedDate", "distributorLocalDate") AS day,
          COUNT(*) FILTER (WHERE outcome = 'DELIVERED' AND "distributorLocalDate" <= COALESCE("committedDate", "distributorLocalDate"))::int AS "onTime",
          COUNT(*) FILTER (WHERE outcome = 'DELIVERED' AND "distributorLocalDate" > "committedDate")::int AS late,
          COUNT(*) FILTER (WHERE outcome = 'UNABLE_TO_DELIVER')::int AS failed
        FROM delivery_facts
        WHERE "distributorId" = ${distributorId}
          AND COALESCE("committedDate", "distributorLocalDate") BETWEEN ${fromDate} AND ${toDate}
        GROUP BY 1
      `,
    ]);

    const byDay = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), r]));
    const days: DeliveryOutcomeDay[] = [];
    for (let i = 0; i < windowDays; i++) {
      const date = new Date(fromDate.getTime() + i * DAY_MS).toISOString().slice(0, 10);
      const row = byDay.get(date);
      days.push({ date, onTime: row?.onTime ?? 0, late: row?.late ?? 0, failed: row?.failed ?? 0 });
    }
    return { distributorId, from, to, timezone: settings?.timezone ?? 'UTC', days };
  }
}
