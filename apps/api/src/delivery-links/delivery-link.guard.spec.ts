import { ExecutionContext, GoneException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DELIVERY_ORDER_KEY, DeliveryLinkGuard } from './delivery-link.guard';
import { DeliveryLinksService } from './delivery-links.service';
import { OpenDeliveryOnly } from './open-delivery-only.decorator';

class Routes {
  read() {}
  @OpenDeliveryOnly()
  change() {}
}

function contextFor(
  request: { headers: Record<string, string | string[] | undefined> },
  handler: keyof Routes = 'read',
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => Routes.prototype[handler],
    getClass: () => Routes,
  } as unknown as ExecutionContext;
}

describe('DeliveryLinkGuard', () => {
  const open = { id: 'order-open' };
  const recorded = { id: 'order-recorded' };
  let guard: DeliveryLinkGuard;

  beforeEach(() => {
    const deliveryLinks = {
      resolveOrder: jest.fn(async (token: string) => {
        if (token === 'open-token') return open;
        if (token === 'recorded-token') return recorded;
        if (token === 'cancelled-token') throw new GoneException();
        throw new NotFoundException();
      }),
      assertOpen: jest.fn(async (order: { id: string }) => {
        if (order === recorded) throw new GoneException();
      }),
    };
    guard = new DeliveryLinkGuard(deliveryLinks as unknown as DeliveryLinksService, new Reflector());
  });

  it('lets a printed token through and hands its order to the handler', async () => {
    const request = { headers: { 'x-delivery-token': 'open-token' } };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect((request as Record<string, unknown>)[DELIVERY_ORDER_KEY]).toBe(open);
  });

  it.each([
    ['no token header', {}],
    ['an unknown token', { 'x-delivery-token': 'made-up' }],
    ['a repeated header whose first value is unknown', { 'x-delivery-token': ['made-up', 'open-token'] }],
  ])('refuses %s with 404 and attaches no order', async (_case, headers) => {
    const request = { headers };
    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(NotFoundException);
    expect((request as Record<string, unknown>)[DELIVERY_ORDER_KEY]).toBeUndefined();
  });

  it('refuses a token for an order that can no longer be delivered with 410', async () => {
    const request = { headers: { 'x-delivery-token': 'cancelled-token' } };
    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(GoneException);
  });

  describe('a recorded delivery', () => {
    it('can still be read', async () => {
      const request = { headers: { 'x-delivery-token': 'recorded-token' } };
      await expect(guard.canActivate(contextFor(request, 'read'))).resolves.toBe(true);
    });

    it('is refused with 410 on a route that changes it, and attaches no order', async () => {
      const request = { headers: { 'x-delivery-token': 'recorded-token' } };
      await expect(guard.canActivate(contextFor(request, 'change'))).rejects.toThrow(GoneException);
      expect((request as Record<string, unknown>)[DELIVERY_ORDER_KEY]).toBeUndefined();
    });
  });

  it('lets an open delivery through on a route that changes it', async () => {
    const request = { headers: { 'x-delivery-token': 'open-token' } };
    await expect(guard.canActivate(contextFor(request, 'change'))).resolves.toBe(true);
  });
});
