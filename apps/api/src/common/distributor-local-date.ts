/**
 * The distributor-local calendar date a UTC instant falls on, per the
 * distributor's configured IANA timezone. Computed at write time and stored
 * on fact rows so historical dates stay stable even if a distributor's
 * timezone setting changes later (see wholesaler homepage dashboard PRD §4.1).
 *
 * Returns a UTC-midnight Date representing the calendar day, matching
 * Prisma's `@db.Date` column mapping.
 */
export function distributorLocalDate(occurredAt: Date, timezone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(occurredAt);

  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00.000Z`);
}
