import type { AuthUser } from '@wholo/types';

/**
 * The wholesaler this browser tab is working in (ADR-078). Kept in
 * sessionStorage so each tab has its own — two tabs can never silently share
 * one — and it is gone when the tab closes. It is only a claim: apps/api
 * checks it against the operator's active grants on every request.
 */
export interface WholesalerSelection {
  distributorId: string;
  name: string;
  grantId: string;
  expiresAt: string;
  reason: string;
}

/** Why the Ops app left a wholesaler, for the "access ended" screen. */
export interface EndedVisit {
  name: string;
  distributorId: string;
  reason: string;
  cause: 'EXPIRED' | 'REVOKED' | 'LEFT';
  endedAt: string;
}

const SELECTION_KEY = 'stocdup.ops.selection';
const ENDED_KEY = 'stocdup.ops.ended';

function read<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: the tab simply has no selection.
  }
}

export function getSelection(): WholesalerSelection | null {
  return read<WholesalerSelection>(SELECTION_KEY);
}

export function setSelection(selection: WholesalerSelection): void {
  write(SELECTION_KEY, selection);
  write(ENDED_KEY, null);
}

export function clearSelection(): void {
  write(SELECTION_KEY, null);
}

/**
 * Keep this tab's copy of the access in step with apps/api's: opening the
 * same wholesaler again (from another tab, say) extends the grant.
 */
export function refreshSelection(profile: Pick<AuthUser, 'access'>): WholesalerSelection | null {
  const current = getSelection();
  if (!current || profile.access?.kind !== 'SUPPORT') return current;
  const next = { ...current, grantId: profile.access.grantId, expiresAt: profile.access.expiresAt };
  write(SELECTION_KEY, next);
  return next;
}

/** Leave the wholesaler, remembering why so the Ops home can say so. */
export function endSelection(cause: EndedVisit['cause'], now: Date = new Date()): EndedVisit | null {
  const current = getSelection();
  clearSelection();
  if (!current) return null;
  const ended: EndedVisit = { name: current.name, distributorId: current.distributorId, reason: current.reason, cause, endedAt: now.toISOString() };
  write(ENDED_KEY, ended);
  return ended;
}

export function getEndedVisit(): EndedVisit | null {
  return read<EndedVisit>(ENDED_KEY);
}

export function dismissEndedVisit(): void {
  write(ENDED_KEY, null);
}

/** Headers for every request from this tab: the selected wholesaler, if any. */
export function selectionHeaders(): Record<string, string> {
  const selection = getSelection();
  return selection ? { 'X-Organisation-Id': selection.distributorId } : {};
}

/**
 * The mismatch guard: the profile apps/api resolved must be the wholesaler
 * this tab selected, reached through support access. Anything else means the
 * selection is stale and must be dropped rather than trusted.
 */
export function profileMatchesSelection(profile: Pick<AuthUser, 'organisationId' | 'access'>, selection: WholesalerSelection): boolean {
  return profile.organisationId === selection.distributorId && profile.access?.kind === 'SUPPORT';
}

/** Text apps/api's selection refusal carries through the BFF (admin-api JwtStrategy). */
export const ACCESS_ENDED_DETAIL = 'Your access to this wholesaler has ended';

/** The BFF's refusal of this tab's selection — as opposed to an outage or any other error. */
export function isAccessEnded(error: unknown): boolean {
  const e = error as { status?: number; problem?: { detail?: string } } | null;
  return e?.status === 403 && e.problem?.detail === ACCESS_ENDED_DETAIL;
}
