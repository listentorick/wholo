import type { SupportGrant } from '@wholo/types';

const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const dayAndTime = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function formatUntil(iso: string): string {
  return clock.format(new Date(iso));
}

export function formatWhen(iso: string): string {
  return dayAndTime.format(new Date(iso));
}

/** How a past visit ended, in the Owner's terms. */
export function endedLabel(grant: Pick<SupportGrant, 'status' | 'endedBy'>): string {
  if (grant.status === 'ACTIVE') return 'In your account now';
  if (grant.status === 'EXPIRED') return 'Time ran out';
  if (grant.endedBy === 'HOLDER') return 'Left early';
  if (grant.endedBy === 'DISTRIBUTOR') return 'Ended by your team';
  return 'Ended by Stocdup';
}

/** Minutes the visit lasted (or has lasted so far). */
export function visitMinutes(grant: Pick<SupportGrant, 'startsAt' | 'expiresAt' | 'revokedAt'>, now: Date = new Date()): number {
  const end = Math.min(new Date(grant.revokedAt ?? grant.expiresAt).getTime(), now.getTime());
  return Math.max(0, Math.round((end - new Date(grant.startsAt).getTime()) / 60_000));
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
