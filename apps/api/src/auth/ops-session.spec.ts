import { OrganisationType, Role } from '@prisma/client';
import { Permission } from '@wholo/types';
import { hasPlatformPermissions, isOpsSession, ownMembership, platformMembership } from './ops-session';

describe('isOpsSession', () => {
  it.each([
    [{ azp: 'stocdup-ops', acr: '2' }, true],
    [{ azp: 'stocdup-ops', acr: 2 }, true],
    [{ azp: 'stocdup-ops', acr: '3' }, true],
    [{ azp: 'stocdup-ops', acr: '1' }, false],
    [{ azp: 'stocdup-ops', acr: 'gold' }, false],
    [{ azp: 'stocdup-ops' }, false],
    [{ azp: 'wholo-admin', acr: '2' }, false],
    [{ acr: '2' }, false],
    [{}, false],
  ])('%j → %s', (payload, expected) => {
    expect(isOpsSession(payload, 'stocdup-ops')).toBe(expected);
  });
});

describe('platform membership helpers', () => {
  const user = {
    sub: 'op-1',
    opsSession: true,
    memberships: [
      { organisationId: 'stocdup', organisationType: OrganisationType.PLATFORM, roles: [Role.PLATFORM_ADMIN] },
      { organisationId: 'd-1', roles: [Role.SUPPORT], supportGrantId: 'g-1' },
    ],
  };

  it('finds the PLATFORM membership', () => {
    expect(platformMembership(user)?.organisationId).toBe('stocdup');
  });

  it('grants platform permissions only in an ops session', () => {
    expect(hasPlatformPermissions(user, [Permission.PLATFORM_STATS_READ])).toBe(true);
    expect(hasPlatformPermissions({ ...user, opsSession: false }, [Permission.PLATFORM_STATS_READ])).toBe(false);
  });

  it('never treats a support grant as an own membership', () => {
    expect(ownMembership(user, 'd-1')).toBeUndefined();
    expect(ownMembership(user, 'stocdup')).toBeDefined();
  });
});
