import type { SupportGrant } from '@wholo/types';
import { endSelection, getSelection, setSelection, type EndedVisit } from './selection';

// Entering or leaving a wholesaler reloads the page, so every provider (auth,
// badges, cached lists) starts again in the new context — nothing from one
// wholesaler can linger on screen in another.

export function enterWholesaler(grant: Pick<SupportGrant, 'id' | 'distributorId' | 'distributorName' | 'expiresAt' | 'reason'>): void {
  setSelection({ distributorId: grant.distributorId, name: grant.distributorName, grantId: grant.id, expiresAt: grant.expiresAt, reason: grant.reason });
  window.location.assign('/');
}

export function leaveWholesaler(cause: EndedVisit['cause']): void {
  endSelection(cause);
  window.location.assign('/ops');
}

/** A refused selection: time ran out, or someone ended it early. */
export function endedCause(now: Date = new Date()): EndedVisit['cause'] {
  const selection = getSelection();
  return selection && new Date(selection.expiresAt) <= now ? 'EXPIRED' : 'REVOKED';
}
