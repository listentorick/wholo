import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrganisationType, Role } from '@prisma/client';
import { Permission } from '@wholo/types';
import { PlatformAccessGuard } from './platform-access.guard';

describe('PlatformAccessGuard', () => {
  let guard: PlatformAccessGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PlatformAccessGuard(reflector);
  });

  function makeContext(required: Permission[] | undefined, user: unknown): ExecutionContext {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(required);
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ params: {}, user }) }),
    } as unknown as ExecutionContext;
  }

  const platformAdmin = (opsSession: boolean) => ({
    sub: 'op-1',
    opsSession,
    memberships: [{ organisationId: 'stocdup', organisationType: OrganisationType.PLATFORM, roles: [Role.PLATFORM_ADMIN] }],
  });

  it('allows a platform admin in an ops session', () => {
    expect(guard.canActivate(makeContext([Permission.PLATFORM_STATS_READ], platformAdmin(true)))).toBe(true);
  });

  it('refuses a platform admin outside an ops session', () => {
    expect(() => guard.canActivate(makeContext([Permission.PLATFORM_STATS_READ], platformAdmin(false)))).toThrow(
      ForbiddenException,
    );
  });

  it('refuses a distributor Owner, even in an ops session', () => {
    const owner = {
      sub: 'u-1',
      opsSession: true,
      memberships: [{ organisationId: 'd-1', organisationType: OrganisationType.DISTRIBUTOR, roles: [Role.DISTRIBUTOR_ADMIN] }],
    };
    expect(() => guard.canActivate(makeContext([Permission.PLATFORM_STATS_READ], owner))).toThrow(ForbiddenException);
  });

  it('refuses PLATFORM_ADMIN held on a non-PLATFORM organisation', () => {
    const misplaced = {
      sub: 'u-1',
      opsSession: true,
      memberships: [{ organisationId: 'd-1', organisationType: OrganisationType.DISTRIBUTOR, roles: [Role.PLATFORM_ADMIN] }],
    };
    expect(() => guard.canActivate(makeContext([Permission.PLATFORM_STATS_READ], misplaced))).toThrow(ForbiddenException);
  });

  it('refuses a route that declares no permissions (fail closed)', () => {
    expect(() => guard.canActivate(makeContext(undefined, platformAdmin(true)))).toThrow(ForbiddenException);
  });

  it('refuses an unauthenticated request', () => {
    expect(() => guard.canActivate(makeContext([Permission.PLATFORM_STATS_READ], undefined))).toThrow(ForbiddenException);
  });
});
