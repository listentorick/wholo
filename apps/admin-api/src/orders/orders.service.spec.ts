import { OrdersService } from './orders.service';
import { ApiClientService } from '../api-client/api-client.service';

// Only the new/changed acceptOrder path is covered here — the rest of this
// service (listOrders, getOrder, getOrderAuditLog, rejectOrder, cancelOrder)
// is a pre-existing gap with no spec coverage, out of scope for this change
// (see docs/tax-types-pbi-plan.md Phase 5 notes).
describe('OrdersService (BFF)', () => {
  let service: OrdersService;
  let api: { post: jest.Mock };

  beforeEach(() => {
    api = { post: jest.fn() };
    service = new OrdersService(api as unknown as ApiClientService);
  });

  describe('acceptOrder', () => {
    it('posts the dto body to the upstream accept route', async () => {
      api.post.mockResolvedValue({ id: 'order-1', status: 'ACCEPTED' });

      const result = await service.acceptOrder('order-1', 'dist-1', { confirmUnmappedTaxTypes: true }, 'token-1');

      expect(api.post).toHaveBeenCalledWith(
        '/admin/distributors/dist-1/orders/order-1/accept',
        'token-1',
        { confirmUnmappedTaxTypes: true },
      );
      expect(result).toEqual({ id: 'order-1', status: 'ACCEPTED' });
    });
  });
});
