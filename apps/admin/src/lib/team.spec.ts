import { describe, expect, it } from 'vitest';
import { Role } from '@wholo/types';
import type { StaffInvitation, TeamMember, TeamOverview } from '@wholo/types';
import {
  buildTeamEntries, countByFilter, entryStatus, entryTitle, expiryText, initials, matchesFilter, sameRoleSet,
} from './team';

// Local-time constructors: expiry is counted in the viewer's calendar days, so
// the tests must not depend on the timezone they happen to run in.
const at = (dayOffset: number, hour = 12) => new Date(2026, 8, 18 + dayOffset, hour, 0);
const NOW = at(0).getTime();
const iso = (offsetDays: number, hour = 12) => at(offsetDays, hour).toISOString();

const member = (overrides: Partial<TeamMember> = {}): TeamMember => ({
  userId: 'u-tom', firstName: 'Tom', lastName: 'Reid', email: 'tom@vine.test',
  roles: [Role.OPERATIONS_MANAGER], joinedAt: '2026-06-02T09:00:00Z', invitedBy: 'Priya Shah', ...overrides,
});
const invitation = (overrides: Partial<StaffInvitation> = {}): StaffInvitation => ({
  id: 'i-1', email: 'kofi@vine.test', roles: [Role.WAREHOUSE_STAFF], status: 'PENDING',
  expiresAt: iso(5), createdAt: iso(-2), invitedBy: { id: 'u-priya', name: 'Priya Shah' }, ...overrides,
});
const owner = member({ userId: 'u-priya', firstName: 'Priya', lastName: 'Shah', roles: [Role.DISTRIBUTOR_ADMIN], joinedAt: '2025-03-12T09:00:00Z', invitedBy: null });

describe('buildTeamEntries', () => {
  it('lists the Owner first, then members by join date, then pending, then expired invitations', () => {
    const overview: TeamOverview = {
      members: [member({ userId: 'u-late', joinedAt: '2026-08-01T00:00:00Z' }), member(), owner],
      invitations: [
        invitation({ id: 'exp', status: 'EXPIRED', expiresAt: iso(-5) }),
        invitation({ id: 'old', createdAt: iso(-3) }),
        invitation({ id: 'new', createdAt: iso(-1) }),
      ],
    };
    expect(buildTeamEntries(overview, 'u-priya').map((e) => e.id)).toEqual(['u-priya', 'u-tom', 'u-late', 'new', 'old', 'exp']);
  });

  it('marks who is you and who is the Owner', () => {
    const entries = buildTeamEntries({ members: [owner, member()], invitations: [] }, 'u-priya');
    expect(entries.map((e) => e.kind === 'member' && [e.isSelf, e.isOwner])).toEqual([[true, true], [false, false]]);
  });
});

describe('filters and counts', () => {
  const entries = buildTeamEntries(
    { members: [owner, member()], invitations: [invitation(), invitation({ id: 'e', status: 'EXPIRED' })] },
    'u-priya',
  );

  it('counts each filter and the total', () => {
    expect(countByFilter(entries)).toEqual({ all: 4, active: 2, pending: 1, expired: 1 });
  });

  it('shows only people under Active and only the matching invitations under Pending/Expired', () => {
    const ids = (f: 'active' | 'pending' | 'expired') => entries.filter((e) => matchesFilter(e, f)).map((e) => e.id);
    expect(ids('active')).toEqual(['u-priya', 'u-tom']);
    expect(ids('pending')).toEqual(['i-1']);
    expect(ids('expired')).toEqual(['e']);
  });
});

describe('expiryText', () => {
  it.each([
    [iso(5), 'Expires in 5 days'],
    [iso(1, 9), 'Expires in 1 day'], // tomorrow morning is still "in 1 day", not "today"
    [iso(0, 18), 'Expires today'],
    [iso(-5), 'Expired 5 days ago'],
    [iso(-1, 20), 'Expired 1 day ago'],
    [iso(0, 8), 'Expired today'],
  ])('%s reads "%s"', (expiresAt, text) => {
    expect(expiryText(expiresAt, NOW)).toBe(text);
  });

  it('says a freshly created 7-day invitation expires in 7 days, not 6', () => {
    expect(expiryText(new Date(NOW + 7 * 24 * 60 * 60 * 1000).toISOString(), NOW)).toBe('Expires in 7 days');
  });
});

describe('entry text', () => {
  it('describes a member by name and email, and an invitation by address and inviter', () => {
    const [m, i] = buildTeamEntries({ members: [member()], invitations: [invitation()] }, undefined);
    expect(entryTitle(m)).toEqual({ primary: 'Tom Reid', secondary: 'tom@vine.test' });
    expect(entryTitle(i)).toEqual({ primary: 'kofi@vine.test', secondary: 'Invited by Priya Shah' });
  });

  it('gives each state a status badge and one supporting line', () => {
    const [m, p, x] = buildTeamEntries(
      { members: [member()], invitations: [invitation(), invitation({ id: 'e', status: 'EXPIRED', expiresAt: iso(-5) })] },
      undefined,
    );
    expect(entryStatus(m, NOW)).toMatchObject({ label: 'Active', tone: 'green', line: 'Joined 2 Jun 2026' });
    expect(entryStatus(p, NOW)).toMatchObject({ label: 'Pending', tone: 'yellow', line: 'Expires in 5 days' });
    expect(entryStatus(x, NOW)).toMatchObject({ label: 'Expired', tone: 'gray', line: 'Expired 5 days ago' });
  });
});

describe('small helpers', () => {
  it('builds initials, falling back to the email', () => {
    expect(initials({ firstName: 'Tom', lastName: 'Reid', email: 't@x.test' })).toBe('TR');
    expect(initials({ firstName: '', lastName: '', email: 'zed@x.test' })).toBe('Z');
  });

  it('compares role sets regardless of order', () => {
    expect(sameRoleSet([Role.OPERATIONS_MANAGER, Role.WAREHOUSE_STAFF], [Role.WAREHOUSE_STAFF, Role.OPERATIONS_MANAGER])).toBe(true);
    expect(sameRoleSet([Role.OPERATIONS_MANAGER], [Role.WAREHOUSE_STAFF])).toBe(false);
    expect(sameRoleSet([Role.OPERATIONS_MANAGER], [Role.OPERATIONS_MANAGER, Role.WAREHOUSE_STAFF])).toBe(false);
  });
});
