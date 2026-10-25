'use client';

import Link from 'next/link';
import { Permission } from '@wholo/types';
import { useCan } from '@/lib/permissions';
import { useSupportPresence } from '@/lib/support-presence-context';
import { formatUntil } from './support-access';

/**
 * Tells everyone at the distributor, on every page, while Stocdup support is
 * in the account (ADR-078): who, until when, and why. Owners get a link to
 * review or end it on the Team page.
 */
export function SupportPresenceStrip() {
  const { active: grants } = useSupportPresence();
  const can = useCan();

  if (grants.length === 0) return null;

  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-support-border bg-support-soft px-4 py-2 text-sm text-support-text"
    >
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-support" />
      <span className="font-semibold">Stocdup support is in your account</span>
      {grants.map((g) => (
        <span key={g.id} className="min-w-0 truncate">
          {g.holder.name}, until {formatUntil(g.expiresAt)} · {g.reason}
        </span>
      ))}
      {can(Permission.TEAM_MANAGE) && (
        <Link href="/team#support-access" className="ml-auto font-semibold underline underline-offset-2">
          Review
        </Link>
      )}
    </div>
  );
}
