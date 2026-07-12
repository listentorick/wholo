import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, UnprocessableEntityException, BadRequestException } from '@nestjs/common';
import { OrderStatus, OrderLineStatus, AcceptedByActorType } from '@prisma/client';
import { AdminOrdersService } from './admin-orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';

const mockPrisma = {
  order: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  orderLine: { updateMany: jest.fn() },
  $transaction: jest.fn(),
};

const mockOutbox = { writeEvent: jest.fn() };

const makeOrder = (overrides = {}) => ({
  id: 'order-1',
  orderNumber: 'ORD-2024-00001',
  distributorId: 'dist-1',
  traderCustomerId: 'customer-1',
  placedByUserId: 'user-1',
  status: OrderStatus.SUBMITTED,
  currency: 'GBP',
  subtotalAmount: { toFixed: () => '100.00' },
  taxAmount: { toFixed: () => '0.00' },
  totalAmount: { toFixed: () => '100.00' },
  billingAddressSnapshot: null,
  deliveryAddressSnapshot: null,
  customerReference: null,
  notes: null,
  acceptanceModeSnapshot: null,
  acceptanceModeSourceSnapshot: null,
  submittedAt: new Date('2024-01-01'),
  acceptedAt: null,
  acceptedByActorType: null,
  acceptedByUserId: null,
  rejectedAt: null,
  rejectedByUserId: null,
  rejectionReason: null,
  cancelledAt: null,
  cancelledByUserId: null,
  cancellationReason: null,
  customer: { id: 'customer-1', name: 'Test Customer' },
  lines: [],
  invoiceExports: [],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

describe('AdminOrdersService', () => {
  let service: AdminOrdersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminOrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OutboxService, useValue: mockOutbox },
      ],
    }).compile();
    service = module.get(AdminOrdersService);
  });

  // ── listOrders ─────────────────────────────────────────────────────────────

  describe('listOrders', () => {
    it('returns paginated orders for distributor', async () => {
      const order = makeOrder();
      mockPrisma.order.findMany.mockResolvedValue([order]);
      mockPrisma.order.count.mockResolvedValue(1);

      const result = await service.listOrders('dist-1', {});

      expect(result.data).toHaveLength(1);
      expect(result.pagination.hasMore).toBe(false);
      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ AND: expect.any(Array) }) }),
      );
    });

    it('sets hasMore and nextCursor when more items exist', async () => {
      const orders = Array.from({ length: 21 }, (_, i) =>
        makeOrder({ id: `order-${i}`, createdAt: new Date(), orderNumber: `ORD-${i}` }),
      );
      mockPrisma.order.findMany.mockResolvedValue(orders);
      mockPrisma.order.count.mockResolvedValue(30);

      const result = await service.listOrders('dist-1', { limit: 20 });

      expect(result.data).toHaveLength(20);
      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.nextCursor).not.toBeNull();
    });

    it('throws BadRequestException for malformed cursor', async () => {
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.order.count.mockResolvedValue(0);

      await expect(
        service.listOrders('dist-1', { cursor: 'not-valid-base64url!!!' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('applies status filter', async () => {
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.order.count.mockResolvedValue(0);

      await service.listOrders('dist-1', { status: OrderStatus.ACCEPTED });

      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({ status: OrderStatus.ACCEPTED }),
            ]),
          }),
        }),
      );
    });
  });

  // ── getOrder ────────────────────────────────────────────────────────────────

  describe('getOrder', () => {
    it('returns order for correct distributor', async () => {
      const order = makeOrder();
      mockPrisma.order.findFirst.mockResolvedValue(order);

      const result = await service.getOrder('order-1', 'dist-1');
      expect(result.id).toBe('order-1');
    });

    it('throws NotFoundException when order belongs to different distributor', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);
      await expect(service.getOrder('order-1', 'dist-2')).rejects.toThrow(NotFoundException);
    });

    it('returns invoiceExport null when the order has no accounting export', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(makeOrder());

      const result = await service.getOrder('order-1', 'dist-1');

      expect(result.invoiceExport).toBeNull();
    });

    it('maps the latest accounting invoice export onto the order resource', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(
        makeOrder({
          invoiceExports: [
            {
              id: 'export-1',
              provider: 'XERO',
              status: 'COMPLETED',
              externalInvoiceId: 'inv-1',
              externalInvoiceNumber: 'INV-0042',
              externalInvoiceStatus: 'DRAFT',
              exportedAt: new Date('2026-07-09T18:45:00.000Z'),
              errorCode: null,
              errorMessage: null,
              createdAt: new Date('2026-07-09T18:44:00.000Z'),
            },
          ],
        }),
      );

      const result = await service.getOrder('order-1', 'dist-1');

      expect(result.invoiceExport).toEqual({
        id: 'export-1',
        provider: 'XERO',
        status: 'COMPLETED',
        externalInvoiceId: 'inv-1',
        externalInvoiceNumber: 'INV-0042',
        externalInvoiceStatus: 'DRAFT',
        exportedAt: '2026-07-09T18:45:00.000Z',
        errorCode: null,
        errorMessage: null,
        createdAt: '2026-07-09T18:44:00.000Z',
      });
    });
  });

  // ── acceptOrder ─────────────────────────────────────────────────────────────

  describe('acceptOrder', () => {
    it('accepts a submitted order', async () => {
      const order = makeOrder({ status: OrderStatus.SUBMITTED });
      const accepted = makeOrder({ status: OrderStatus.ACCEPTED, acceptedByUserId: 'user-1' });
      mockPrisma.order.findFirst.mockResolvedValue(order);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
      mockPrisma.order.update.mockResolvedValue(accepted);
      mockPrisma.orderLine.updateMany.mockResolvedValue({ count: 0 });
      mockOutbox.writeEvent.mockResolvedValue(undefined);

      const result = await service.acceptOrder('order-1', 'dist-1', 'user-1');

      expect(result.status).toBe(OrderStatus.ACCEPTED);
      expect(mockPrisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: OrderStatus.ACCEPTED,
            acceptedByActorType: AcceptedByActorType.USER,
            acceptedByUserId: 'user-1',
          }),
        }),
      );
      expect(mockOutbox.writeEvent).toHaveBeenCalledWith(
        expect.anything(), 'Order', 'order-1', 'OrderAccepted', expect.any(Object),
      );
    });

    it('throws NotFoundException when order not found', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);
      await expect(service.acceptOrder('order-1', 'dist-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('throws UnprocessableEntityException when order is not SUBMITTED', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(makeOrder({ status: OrderStatus.ACCEPTED }));
      await expect(service.acceptOrder('order-1', 'dist-1', 'user-1')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  // ── rejectOrder ─────────────────────────────────────────────────────────────

  describe('rejectOrder', () => {
    it('rejects a submitted order', async () => {
      const order = makeOrder({ status: OrderStatus.SUBMITTED });
      const rejected = makeOrder({ status: OrderStatus.REJECTED });
      mockPrisma.order.findFirst.mockResolvedValue(order);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
      mockPrisma.order.update.mockResolvedValue(rejected);
      mockPrisma.orderLine.updateMany.mockResolvedValue({ count: 0 });
      mockOutbox.writeEvent.mockResolvedValue(undefined);

      const result = await service.rejectOrder('order-1', 'dist-1', 'user-1', 'Out of stock');
      expect(result.status).toBe(OrderStatus.REJECTED);
      expect(mockOutbox.writeEvent).toHaveBeenCalledWith(
        expect.anything(), 'Order', 'order-1', 'OrderRejected', expect.any(Object),
      );
    });

    it('throws NotFoundException when order not found', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);
      await expect(service.rejectOrder('order-1', 'dist-1', 'user-1', 'reason')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws UnprocessableEntityException when order is not SUBMITTED', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(makeOrder({ status: OrderStatus.CANCELLED }));
      await expect(service.rejectOrder('order-1', 'dist-1', 'user-1', 'reason')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  // ── cancelOrder ─────────────────────────────────────────────────────────────

  describe('cancelOrder', () => {
    it('cancels a submitted order', async () => {
      const order = makeOrder({ status: OrderStatus.SUBMITTED });
      const cancelled = makeOrder({ status: OrderStatus.CANCELLED });
      mockPrisma.order.findFirst.mockResolvedValue(order);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
      mockPrisma.order.update.mockResolvedValue(cancelled);
      mockPrisma.orderLine.updateMany.mockResolvedValue({ count: 0 });
      mockOutbox.writeEvent.mockResolvedValue(undefined);

      const result = await service.cancelOrder('order-1', 'dist-1', 'user-1', 'Changed mind');
      expect(result.status).toBe(OrderStatus.CANCELLED);
    });

    it('cancels an accepted order', async () => {
      const order = makeOrder({ status: OrderStatus.ACCEPTED });
      const cancelled = makeOrder({ status: OrderStatus.CANCELLED });
      mockPrisma.order.findFirst.mockResolvedValue(order);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
      mockPrisma.order.update.mockResolvedValue(cancelled);
      mockPrisma.orderLine.updateMany.mockResolvedValue({ count: 0 });
      mockOutbox.writeEvent.mockResolvedValue(undefined);

      await expect(
        service.cancelOrder('order-1', 'dist-1', 'user-1', 'Changed mind'),
      ).resolves.not.toThrow();
    });

    it('throws NotFoundException when order not found', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);
      await expect(service.cancelOrder('order-1', 'dist-1', 'user-1', 'reason')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws UnprocessableEntityException when order is REJECTED', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(makeOrder({ status: OrderStatus.REJECTED }));
      await expect(service.cancelOrder('order-1', 'dist-1', 'user-1', 'reason')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });
});
