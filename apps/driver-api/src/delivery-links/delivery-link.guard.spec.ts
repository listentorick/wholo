import { ExecutionContext, GoneException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DeliveryLinkGuard } from './delivery-link.guard';
import { DeliveryLinksService } from './delivery-links.service';
import { OpenDeliveryOnly } from './open-delivery-only.decorator';

class Routes {
  read() {}
  @OpenDeliveryOnly()
  upload() {}
}

function contextFor(headers: Record<string, string | string[] | undefined>, handler: keyof Routes): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    getHandler: () => Routes.prototype[handler],
    getClass: () => Routes,
  } as unknown as ExecutionContext;
}

const OPEN = 'OpenOpenOpenOpenOpen00';
const RECORDED = 'RecordedRecordedRecord';
const UNKNOWN = 'UnknownUnknownUnknown0';
const CANCELLED = 'CancelledCancelledCanc';

describe('DeliveryLinkGuard', () => {
  let getOrder: jest.Mock;
  let guard: DeliveryLinkGuard;

  beforeEach(() => {
    // Stands in for apps/api's answer to GET /delivery-links.
    getOrder = jest.fn(async (token: string) => {
      if (token === OPEN) return { state: 'PENDING' };
      if (token === RECORDED) return { state: 'SUBMITTED' };
      if (token === CANCELLED) throw new GoneException();
      throw new NotFoundException();
    });
    guard = new DeliveryLinkGuard({ getOrder } as unknown as DeliveryLinksService, new Reflector());
  });

  describe('on every route', () => {
    it.each([
      ['no token header', {}],
      ['an empty token', { 'x-delivery-token': '' }],
      ['a token of the wrong shape', { 'x-delivery-token': 'not-a-token' }],
      ['an old signed-format token', { 'x-delivery-token': `order-1.${'A'.repeat(86)}` }],
      ['a repeated header whose first value is malformed', { 'x-delivery-token': ['junk', OPEN] }],
    ])('answers 404 for %s without asking apps/api', async (_case, headers) => {
      await expect(guard.canActivate(contextFor(headers, 'upload'))).rejects.toThrow(NotFoundException);
      expect(getOrder).not.toHaveBeenCalled();
    });

    it('forwards a well-formed token on other routes without a pre-check — apps/api decides', async () => {
      await expect(guard.canActivate(contextFor({ 'x-delivery-token': UNKNOWN }, 'read'))).resolves.toBe(true);
      expect(getOrder).not.toHaveBeenCalled();
    });
  });

  describe('before a photo is read', () => {
    it('lets the upload through for an open delivery', async () => {
      await expect(guard.canActivate(contextFor({ 'x-delivery-token': OPEN }, 'upload'))).resolves.toBe(true);
    });

    it('refuses with 410 once the delivery is recorded', async () => {
      await expect(guard.canActivate(contextFor({ 'x-delivery-token': RECORDED }, 'upload'))).rejects.toThrow(GoneException);
    });

    it("passes on apps/api's 404 for a token no order carries", async () => {
      await expect(guard.canActivate(contextFor({ 'x-delivery-token': UNKNOWN }, 'upload'))).rejects.toThrow(NotFoundException);
    });

    it("passes on apps/api's 410 for a cancelled order", async () => {
      await expect(guard.canActivate(contextFor({ 'x-delivery-token': CANCELLED }, 'upload'))).rejects.toThrow(GoneException);
    });
  });
});
