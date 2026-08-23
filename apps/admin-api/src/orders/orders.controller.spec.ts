import { Test } from '@nestjs/testing';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

// Only the new/changed acceptOrder and countNeedsAttention paths are covered
// here — the rest of this controller (listOrders, getOrder,
// getOrderAuditLog, rejectOrder, cancelOrder) is a pre-existing gap with no
// spec coverage, out of scope for this change (see
// docs/tax-types-pbi-plan.md Phase 5 notes).
const mockService = {
  acceptOrder: jest.fn(),
  countNeedsAttention: jest.fn(),
};

function mockRequest() {
  return { user: { organisationId: 'dist-1', token: 'token-1' } } as unknown as import('express').Request;
}

describe('OrdersController (BFF)', () => {
  let controller: OrdersController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: mockService }],
    }).compile();
    controller = module.get(OrdersController);
  });

  describe('acceptOrder', () => {
    it('forwards the confirmUnmappedTaxTypes flag from the request body', async () => {
      mockService.acceptOrder.mockResolvedValue({ id: 'order-1', status: 'ACCEPTED' });

      const result = await controller.acceptOrder('order-1', { confirmUnmappedTaxTypes: true }, mockRequest());

      expect(mockService.acceptOrder).toHaveBeenCalledWith(
        'order-1',
        'dist-1',
        { confirmUnmappedTaxTypes: true },
        'token-1',
      );
      expect(result).toEqual({ id: 'order-1', status: 'ACCEPTED' });
    });

    it('forwards an empty body as-is when no confirmation flag is supplied', async () => {
      mockService.acceptOrder.mockResolvedValue({ id: 'order-1', status: 'ACCEPTED' });

      await controller.acceptOrder('order-1', {}, mockRequest());

      expect(mockService.acceptOrder).toHaveBeenCalledWith('order-1', 'dist-1', {}, 'token-1');
    });
  });

  describe('countNeedsAttention', () => {
    it('resolves organisationId/token from the request and delegates to the service', async () => {
      mockService.countNeedsAttention.mockResolvedValue({ count: 3 });

      const result = await controller.countNeedsAttention(mockRequest());

      expect(mockService.countNeedsAttention).toHaveBeenCalledWith('dist-1', 'token-1');
      expect(result).toEqual({ count: 3 });
    });
  });
});
