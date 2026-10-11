import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { DeliveryTokenGuard } from './delivery-token.guard';
import { DeliveryTokenVerifier } from './delivery-token.verifier';

function contextWith(headers: Record<string, string | string[] | undefined>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ headers }) }) } as unknown as ExecutionContext;
}

describe('DeliveryTokenGuard', () => {
  // Stands in for the verifier: only this one token is genuine.
  const verifier = { verify: (token: string) => (token === 'order-1.genuine' ? 'order-1' : null) } as DeliveryTokenVerifier;
  const guard = new DeliveryTokenGuard(verifier);

  it('lets a request with a genuine token through', () => {
    expect(guard.canActivate(contextWith({ 'x-delivery-token': 'order-1.genuine' }))).toBe(true);
  });

  it.each([
    ['no token header', {}],
    ['an empty token', { 'x-delivery-token': '' }],
    ['a forged token', { 'x-delivery-token': 'order-1.forged' }],
    ['a repeated header whose first value is forged', { 'x-delivery-token': ['order-1.forged', 'order-1.genuine'] }],
  ])('answers 404 for %s', (_case, headers) => {
    expect(() => guard.canActivate(contextWith(headers))).toThrow(NotFoundException);
  });
});
