const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

export function formatClock(iso: string): string {
  return clock.format(new Date(iso));
}

/** Whole minutes left, never negative. */
export function minutesLeft(expiresAt: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 60_000));
}

/** "3h 20m", "45m". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Warn when this little time is left. */
export const ENDING_SOON_MINUTES = 15;
