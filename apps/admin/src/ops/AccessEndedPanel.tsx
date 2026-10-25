'use client';

import type { EndedVisit } from './selection';
import { formatClock } from './time';

const HEADLINE: Record<EndedVisit['cause'], (name: string) => string> = {
  EXPIRED: (name) => `Your access to ${name} has ended — time ran out`,
  REVOKED: (name) => `Your access to ${name} was ended early`,
  LEFT: (name) => `You ended your session in ${name}`,
};

const EXPLANATION: Record<EndedVisit['cause'], string> = {
  EXPIRED: 'Open it again if you still need to work in this account.',
  REVOKED: 'The wholesaler or another Stocdup operator ended it. Check with them before opening it again.',
  LEFT: 'Your access ended with the session.',
};

/** Shown on the Ops home after a tab leaves a wholesaler, so it is never silent. */
export function AccessEndedPanel({ visit, onOpenAgain, onDismiss }: { visit: EndedVisit; onOpenAgain: () => void; onDismiss: () => void }) {
  return (
    <div role="status" className="mb-6 rounded-lg border border-support-border bg-support-soft p-4 text-support-text">
      <p className="text-sm font-semibold">{HEADLINE[visit.cause](visit.name)}</p>
      <p className="mt-1 text-sm">{EXPLANATION[visit.cause]}</p>
      <p className="mt-2 text-xs">
        Ended {formatClock(visit.endedAt)} · Reason: {visit.reason}
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onOpenAgain} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg hover:bg-primary-hover">
          Open again…
        </button>
        <button type="button" onClick={onDismiss} className="rounded-md border border-support-border px-3 py-1.5 text-sm font-medium">
          Dismiss
        </button>
      </div>
    </div>
  );
}
