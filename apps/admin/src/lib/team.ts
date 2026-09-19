import { ASSIGNABLE_STAFF_ROLES, ROLE_LABELS, Role } from '@wholo/types';
import type { StaffInvitation, TeamMember, TeamOverview } from '@wholo/types';

import type { StatusTone } from '@/components/list/StatusBadge';

export type TeamFilter = 'all' | 'active' | 'pending' | 'expired';

export type TeamEntry =
  | { kind: 'member'; id: string; member: TeamMember; isSelf: boolean; isOwner: boolean }
  | { kind: 'invitation'; id: string; invitation: StaffInvitation };

/** One-line "what can they do" copy for each role an Owner may assign. */
export const ROLE_DESCRIPTIONS: Record<(typeof ASSIGNABLE_STAFF_ROLES)[number], string> = {
  [Role.OPERATIONS_MANAGER]:
    'Orders, customers, catalogue, pricing, tax types and deliveries. Can import accounting data. Can’t change company settings, connect integrations or manage the team.',
  [Role.WAREHOUSE_STAFF]: 'Fulfils orders and manages deliveries. Can view the catalogue and customers.',
};

export const OWNER_DESCRIPTION = 'Full access, including the team and company settings. Can’t be granted by invitation.';

const OWNER_ROLES: Role[] = [Role.DISTRIBUTOR_ADMIN, Role.PLATFORM_ADMIN];

export function isOwner(roles: Role[]): boolean {
  return roles.some((r) => OWNER_ROLES.includes(r));
}

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role] ?? role;
}

export function memberName(m: Pick<TeamMember, 'firstName' | 'lastName' | 'email'>): string {
  return `${m.firstName} ${m.lastName}`.trim() || m.email;
}

export function initials(m: Pick<TeamMember, 'firstName' | 'lastName' | 'email'>): string {
  const letters = `${m.firstName[0] ?? ''}${m.lastName[0] ?? ''}`.toUpperCase();
  return letters || (m.email[0] ?? '?').toUpperCase();
}

/**
 * People and invitations as one list: members first (the Owner on top, then by
 * when they joined), then pending invitations (newest first), then expired ones.
 */
export function buildTeamEntries(overview: TeamOverview, selfUserId: string | undefined): TeamEntry[] {
  const members: TeamEntry[] = [...overview.members]
    .sort((a, b) => {
      const ownerDiff = Number(isOwner(b.roles)) - Number(isOwner(a.roles));
      return ownerDiff || a.joinedAt.localeCompare(b.joinedAt);
    })
    .map((member) => ({
      kind: 'member' as const,
      id: member.userId,
      member,
      isSelf: member.userId === selfUserId,
      isOwner: isOwner(member.roles),
    }));

  const byNewest = (a: StaffInvitation, b: StaffInvitation) => b.createdAt.localeCompare(a.createdAt);
  const toEntry = (invitation: StaffInvitation): TeamEntry => ({ kind: 'invitation', id: invitation.id, invitation });
  const pending = overview.invitations.filter((i) => i.status === 'PENDING').sort(byNewest).map(toEntry);
  const expired = overview.invitations.filter((i) => i.status === 'EXPIRED').sort(byNewest).map(toEntry);

  return [...members, ...pending, ...expired];
}

export function matchesFilter(entry: TeamEntry, filter: TeamFilter): boolean {
  if (filter === 'all') return true;
  if (entry.kind === 'member') return filter === 'active';
  return filter === (entry.invitation.status === 'PENDING' ? 'pending' : 'expired');
}

export function countByFilter(entries: TeamEntry[]): Record<TeamFilter, number> {
  return {
    all: entries.length,
    active: entries.filter((e) => matchesFilter(e, 'active')).length,
    pending: entries.filter((e) => matchesFilter(e, 'pending')).length,
    expired: entries.filter((e) => matchesFilter(e, 'expired')).length,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayWord(days: number): string {
  return days === 1 ? '1 day' : `${days} days`;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * "Expires in 5 days" / "Expires today" / "Expired 5 days ago" — counted in
 * calendar days, the way people count them, so a fresh 7-day invitation reads
 * "in 7 days" (elapsed-time flooring would say 6), and tomorrow is "in 1 day".
 */
export function expiryText(expiresAt: string, now: number = Date.now()): string {
  const expires = new Date(expiresAt).getTime();
  // round(): a calendar day is 23 or 25 hours across a clock change.
  const days = Math.abs(Math.round((startOfDay(expires) - startOfDay(now)) / DAY_MS));
  if (expires > now) return days === 0 ? 'Expires today' : `Expires in ${dayWord(days)}`;
  return days === 0 ? 'Expired today' : `Expired ${dayWord(days)} ago`;
}

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const longDateFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export function formatLongDate(iso: string): string {
  return longDateFormat.format(new Date(iso));
}

export function sameRoleSet(a: Role[], b: Role[]): boolean {
  return a.length === b.length && a.every((r) => b.includes(r));
}

export interface EntryStatus {
  label: string;
  tone: StatusTone;
  /** The one supporting line under the badge: "Joined 2 Jun 2025", "Expires in 5 days"… */
  line: string;
}

export function entryStatus(entry: TeamEntry, now: number = Date.now()): EntryStatus {
  if (entry.kind === 'member') {
    return { label: 'Active', tone: 'green', line: `Joined ${formatDate(entry.member.joinedAt)}` };
  }
  const inv = entry.invitation;
  return inv.status === 'PENDING'
    ? { label: 'Pending', tone: 'yellow', line: expiryText(inv.expiresAt, now) }
    : { label: 'Expired', tone: 'gray', line: expiryText(inv.expiresAt, now) };
}

/** The two text lines that identify a row: who, then a secondary detail. */
export function entryTitle(entry: TeamEntry): { primary: string; secondary: string } {
  return entry.kind === 'member'
    ? { primary: memberName(entry.member), secondary: entry.member.email }
    : { primary: entry.invitation.email, secondary: `Invited by ${entry.invitation.invitedBy.name}` };
}

export function entryRoles(entry: TeamEntry): Role[] {
  return entry.kind === 'member' ? entry.member.roles : entry.invitation.roles;
}
