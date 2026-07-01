import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { DistributorAccessGuard } from './distributor-access.guard';

describe('DistributorAccessGuard', () => {
  let guard: DistributorAccessGuard;

  beforeEach(() => {
    guard = new DistributorAccessGuard();
  });

  function makeContext(params: Record<string, string>, user: unknown): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ params, user }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows access when distributorId is in the user organisationIds', () => {
    const context = makeContext({ distributorId: 'dist-1' }, { organisationIds: ['dist-1', 'dist-2'] });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws ForbiddenException when distributorId is not in the user organisationIds', () => {
    const context = makeContext({ distributorId: 'dist-3' }, { organisationIds: ['dist-1', 'dist-2'] });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when user has no organisationIds', () => {
    const context = makeContext({ distributorId: 'dist-1' }, { organisationIds: undefined });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when user is undefined', () => {
    const context = makeContext({ distributorId: 'dist-1' }, undefined);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
