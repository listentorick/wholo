/** Weekday index → name. 0 = Sunday … 6 = Saturday (matches Prisma / admin OrdersTab). */
const FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Week ordering with Monday first, Sunday last — how a range reads to a person. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/**
 * Human label for the days a distributor processes orders.
 *
 * - `[]` → `null` (caller hides the field)
 * - all seven days → `"Every day"`
 * - a single day → its full name, e.g. `"Wednesday"`
 * - one contiguous run (Mon-first) → `"Monday–Friday"` (en dash)
 * - anything else → short names, e.g. `"Mon, Wed, Fri"`
 */
export function formatProcessingDays(days: number[] | null | undefined): string | null {
  if (!days || days.length === 0) return null;

  const present = WEEK_ORDER.filter((d) => days.includes(d));
  if (present.length === 0) return null;
  if (present.length === 7) return 'Every day';
  if (present.length === 1) return FULL[present[0]];

  const startsContiguousRun = present.every(
    (d, i) => i === 0 || WEEK_ORDER.indexOf(d) === WEEK_ORDER.indexOf(present[i - 1]) + 1,
  );
  if (startsContiguousRun) {
    return `${FULL[present[0]]}–${FULL[present[present.length - 1]]}`;
  }

  return present.map((d) => SHORT[d]).join(', ');
}
