import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserAccessGuard } from './user-access.guard';

describe('UserAccessGuard', () => {
  let guard: UserAccessGuard;

  beforeEach(() => {
    guard = new UserAccessGuard();
  });

  function makeContext(params: Record<string, string>, user: unknown): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ params, user }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows access when userId matches the credential sub', () => {
    const context = makeContext({ userId: 'user-1' }, { sub: 'user-1' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws ForbiddenException when userId does not match the credential sub', () => {
    const context = makeContext({ userId: 'user-2' }, { sub: 'user-1' });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when user has no sub', () => {
    const context = makeContext({ userId: 'user-1' }, { sub: undefined });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when user is undefined', () => {
    const context = makeContext({ userId: 'user-1' }, undefined);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
