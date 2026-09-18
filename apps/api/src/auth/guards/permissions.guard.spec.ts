import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { Permission } from '@wholo/types';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector);
  });

  function makeContext(
    required: Permission[] | undefined,
    params: Record<string, string>,
    user: unknown,
  ): ExecutionContext {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(required);
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ params, user }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows access when no permissions are required', () => {
    const context = makeContext(undefined, {}, undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access when the scoped membership holds the required permission', () => {
    const context = makeContext(
      [Permission.PRICE_LISTS_MANAGE],
      { distributorId: 'dist-1' },
      { memberships: [{ organisationId: 'dist-1', roles: [Role.DISTRIBUTOR_ADMIN] }] },
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws ForbiddenException when the scoped membership lacks the required permission', () => {
    const context = makeContext(
      [Permission.PRICE_LISTS_MANAGE],
      { distributorId: 'dist-1' },
      { memberships: [{ organisationId: 'dist-1', roles: [Role.TRADE_CUSTOMER] }] },
    );
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when the user has no membership at the scoped org', () => {
    const context = makeContext(
      [Permission.PRICE_LISTS_MANAGE],
      { distributorId: 'dist-1' },
      { memberships: [{ organisationId: 'dist-2', roles: [Role.DISTRIBUTOR_ADMIN] }] },
    );
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('unions permissions across multiple roles on the same membership', () => {
    const context = makeContext(
      [Permission.DELIVERY_READ, Permission.ORDERS_READ],
      { distributorId: 'dist-1' },
      { memberships: [{ organisationId: 'dist-1', roles: [Role.DRIVER, Role.WAREHOUSE_STAFF] }] },
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('does not leak a higher-privilege role from a different organisation membership', () => {
    const context = makeContext(
      [Permission.PRICE_LISTS_MANAGE],
      { distributorId: 'dist-2' },
      {
        memberships: [
          { organisationId: 'dist-1', roles: [Role.DISTRIBUTOR_ADMIN] },
          { organisationId: 'dist-2', roles: [Role.TRADE_CUSTOMER] },
        ],
      },
    );
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('falls back to user.organisationId when the route has no distributorId param', () => {
    const context = makeContext(
      [Permission.ORDER_AS_INITIATE],
      {},
      { organisationId: 'dist-1', memberships: [{ organisationId: 'dist-1', roles: [Role.DISTRIBUTOR_ADMIN] }] },
    );
    expect(guard.canActivate(context)).toBe(true);
  });
});
