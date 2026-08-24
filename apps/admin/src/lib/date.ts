// Local-time-safe date formatter — uses local getters, not toISOString(),
// which would UTC-shift and land on the wrong day west of GMT near
// midnight or across a DST boundary.
export function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Monday-start week containing `date`, at local midnight.
export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Formats a week (or any short local-time span) as a compact range for
// display — e.g. next to a week-navigation control. `start`/`end` are local
// Date objects (from startOfWeek/addDays), so this deliberately doesn't go
// through toLocaleDateString/UTC the way UI code parsing the API's plain
// YYYY-MM-DD strings does — that's a different concern (safely parsing a
// date-only string), not a property of the Date objects here. A fixed
// 3-letter table (rather than Intl's `month: 'short'`) keeps the output
// stable across environments — Node's en-GB ICU data renders September as
// "Sept", not "Sep", depending on the ICU build.
export function formatDateRange(start: Date, end: Date): string {
  const dayMonth = (d: Date) => `${d.getDate()} ${MONTH_ABBR[d.getMonth()]}`;
  const full = (d: Date) => `${dayMonth(d)} ${d.getFullYear()}`;
  if (start.getFullYear() !== end.getFullYear()) {
    return `${full(start)} – ${full(end)}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${dayMonth(start)} – ${full(end)}`;
  }
  return `${start.getDate()}–${end.getDate()} ${MONTH_ABBR[end.getMonth()]} ${end.getFullYear()}`;
}
