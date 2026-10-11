import { ExecutionContext, GoneException, NotFoundException } from '@nestjs/common';
import { DELIVERY_ORDER_KEY, DeliveryLinkGuard } from './delivery-link.guard';
import { DeliveryLinksService } from './delivery-links.service';

function contextFor(request: { headers: Record<string, string | string[] | undefined> }): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('DeliveryLinkGuard', () => {
  const order = { id: 'order-1' };
  let resolveOrder: jest.Mock;
  let guard: DeliveryLinkGuard;

  beforeEach(() => {
    resolveOrder = jest.fn(async (token: string) => {
      if (token === 'order-1.genuine') return order;
      if (token === 'order-2.cancelled') throw new GoneException();
      throw new NotFoundException();
    });
    guard = new DeliveryLinkGuard({ resolveOrder } as unknown as DeliveryLinksService);
  });

  it('lets a genuine token through and hands its order to the handler', async () => {
    const request = { headers: { 'x-delivery-token': 'order-1.genuine' } };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect((request as Record<string, unknown>)[DELIVERY_ORDER_KEY]).toBe(order);
  });

  it.each([
    ['no token header', {}],
    ['a forged token', { 'x-delivery-token': 'order-1.forged' }],
    ['a repeated header whose first value is forged', { 'x-delivery-token': ['order-1.forged', 'order-1.genuine'] }],
  ])('refuses %s with 404 and attaches no order', async (_case, headers) => {
    const request = { headers };
    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(NotFoundException);
    expect((request as Record<string, unknown>)[DELIVERY_ORDER_KEY]).toBeUndefined();
  });

  it('refuses a genuine token for an order that can no longer be delivered with 410', async () => {
    const request = { headers: { 'x-delivery-token': 'order-2.cancelled' } };
    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(GoneException);
  });
});
