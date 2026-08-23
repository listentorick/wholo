import { Test, TestingModule } from '@nestjs/testing';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminOrdersService } from './admin-orders.service';

// Only the new countNeedsAttention route is covered here — the rest of this
// controller (listOrders, getOrder, getOrderAuditLog, acceptOrder,
// rejectOrder, cancelOrder) is a pre-existing gap with no spec coverage,
// out of scope for this change.
const mockService = {
  countNeedsAttention: jest.fn(),
};

describe('AdminOrdersController', () => {
  let controller: AdminOrdersController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminOrdersController],
      providers: [{ provide: AdminOrdersService, useValue: mockService }],
    }).compile();
    controller = module.get(AdminOrdersController);
  });

  it('countNeedsAttention wraps the service count in a {count} envelope', async () => {
    mockService.countNeedsAttention.mockResolvedValue(2);

    const result = await controller.countNeedsAttention('dist-1');

    expect(mockService.countNeedsAttention).toHaveBeenCalledWith('dist-1');
    expect(result).toEqual({ count: 2 });
  });
});
