import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, UnprocessableEntityException, BadRequestException } from '@nestjs/common';
import { OrderStatus, OrderLineStatus, AcceptedByActorType, ActorType } from '@prisma/client';
import { AdminOrdersService } from './admin-orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { AuditService } from '../audit/audit.service';
import { R2StorageService } from '../asset-images/r2-storage.service';

const mockPrisma = {
  order: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  orderLine: { updateMany: jest.fn(), findMany: jest.fn() },
  accountingConnection: { findFirst: jest.fn() },
  taxTypeAccountingMapping: { findMany: jest.fn() },
  taxType: { findMany: jest.fn() },
  user: { findUnique: jest.fn() },
  auditLog: { findMany: jest.fn(), count: jest.fn() },
  deliveryRunOrder: { findFirst: jest.fn() },
  $transaction: jest.fn(),
};

const mockOutbox = { writeEvent: jest.fn() };
const mockAudit = { record: jest.fn() };
const mockR2 = {
  deliveryBucket: 'wholo-deliveries',
  presignGetUrl: jest.fn((key: string) => Promise.resolve(`https://signed.example/${key}?sig=x`)),
};

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
  requestedDeliveryDate: new Date('2024-06-14'),
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
        { provide: AuditService, useValue: mockAudit },
        { provide: R2StorageService, useValue: mockR2 },
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

    it('applies the undated filter as requestedDeliveryDate: null', async () => {
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.order.count.mockResolvedValue(0);

      await service.listOrders('dist-1', { undated: true });

      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({ requestedDeliveryDate: null }),
            ]),
          }),
        }),
      );
    });

    it('undated wins over a deliveryDateAfter/Before range if both are somehow sent', async () => {
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.order.count.mockResolvedValue(0);

      await service.listOrders('dist-1', { undated: true, deliveryDateAfter: '2026-08-01' });

      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({ requestedDeliveryDate: null }),
            ]),
          }),
        }),
      );
    });
  });

  // ── countNeedsAttention ───────────────────────────────────────────────────────

  describe('countNeedsAttention', () => {
    it('counts SUBMITTED orders for the distributor', async () => {
      mockPrisma.order.count.mockResolvedValue(3);

      await expect(service.countNeedsAttention('dist-1')).resolves.toBe(3);

      expect(mockPrisma.order.count).toHaveBeenCalledWith({
        where: { distributorId: 'dist-1', status: OrderStatus.SUBMITTED },
      });
    });

    it('returns 0 when there are no submitted orders', async () => {
      mockPrisma.order.count.mockResolvedValue(0);
      await expect(service.countNeedsAttention('dist-1')).resolves.toBe(0);
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

    it('formats requestedDeliveryDate as a date-only string', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(makeOrder());

      const result = await service.getOrder('order-1', 'dist-1');

      expect(result.requestedDeliveryDate).toBe('2024-06-14');
    });

    it('returns requestedDeliveryDate null when not set', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(makeOrder({ requestedDeliveryDate: null }));

      const result = await service.getOrder('order-1', 'dist-1');

      expect(result.requestedDeliveryDate).toBeNull();
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

  // ── getOrderAuditLog ────────────────────────────────────────────────────────

  describe('getOrderAuditLog', () => {
    const makeEntry = (overrides = {}) => ({
      id: 'audit-1',
      entityType: 'ORDER',
      entityId: 'order-1',
      action: 'ORDER_ACCEPTED',
      actorType: ActorType.USER,
      actorUserId: 'user-1',
      actorName: 'Jane Doe',
      summary: 'Accepted the order',
      changes: null,
      createdAt: new Date('2026-01-01T10:00:00.000Z'),
      ...overrides,
    });

    it('returns paginated audit entries for an order belonging to the distributor', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({ id: 'order-1' });
      mockPrisma.auditLog.findMany.mockResolvedValue([makeEntry()]);
      mockPrisma.auditLog.count.mockResolvedValue(1);

      const result = await service.getOrderAuditLog('order-1', 'dist-1', {});

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(
        expect.objectContaining({ id: 'audit-1', action: 'ORDER_ACCEPTED', actorName: 'Jane Doe' }),
      );
      expect(result.pagination.hasMore).toBe(false);
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({ distributorId: 'dist-1', entityType: 'ORDER', entityId: 'order-1' }),
            ]),
          }),
        }),
      );
    });

    it('throws NotFoundException when the order belongs to a different distributor', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);
      await expect(service.getOrderAuditLog('order-1', 'dist-2', {})).rejects.toThrow(NotFoundException);
    });

    it('sets hasMore and nextCursor when more entries exist', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({ id: 'order-1' });
      const entries = Array.from({ length: 31 }, (_, i) => makeEntry({ id: `audit-${i}` }));
      mockPrisma.auditLog.findMany.mockResolvedValue(entries);
      mockPrisma.auditLog.count.mockResolvedValue(31);

      const result = await service.getOrderAuditLog('order-1', 'dist-1', {});

      expect(result.data).toHaveLength(30);
      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.nextCursor).not.toBeNull();
    });

    it('throws BadRequestException for an invalid cursor', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({ id: 'order-1' });
      await expect(
        service.getOrderAuditLog('order-1', 'dist-1', { cursor: 'not-valid-base64url-json' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── getDeliveryOutcome ─────────────────────────────────────────────────────

  describe('getDeliveryOutcome', () => {
    const baseOutcome = {
      id: 'outcome-1',
      outcome: 'DELIVERED',
      recipientName: 'Jane Doe',
      notes: 'Left with front desk',
      unableReason: null,
      unableReasonNote: null,
      dropMethod: 'HANDED_TO_PERSON',
      signature: { format: 'signature_pad', version: 5, width: 300, height: 150, strokes: [[{ x: 1, y: 2 }]] },
      capturedAt: new Date('2026-08-28T14:30:00.000Z'),
      latitude: 51.51,
      longitude: -0.12,
      locationAccuracyM: 12,
      locationCapturedAt: new Date('2026-08-28T14:29:00.000Z'),
      locationUnavailable: false,
      recordedAt: new Date('2026-08-28T14:32:00.000Z'),
      submittedViaQrToken: true,
      correctedAt: null,
      correctedByUserId: null,
      photos: [
        {
          id: 'photo-2',
          variants: { full: 'k/2/full.webp', thumb: 'k/2/thumb.webp' },
          sourceWidth: 1600,
          sourceHeight: 1200,
          capturedAt: new Date('2026-08-28T14:31:00.000Z'),
          sortOrder: 1,
        },
        {
          id: 'photo-1',
          variants: { full: 'k/1/full.webp', thumb: 'k/1/thumb.webp' },
          sourceWidth: null,
          sourceHeight: null,
          capturedAt: null,
          sortOrder: 0,
        },
      ],
    };

    const orderRow = (outcome: unknown) => ({
      id: 'order-1',
      orderNumber: 'ORD-2026-00386',
      status: OrderStatus.DELIVERED,
      customer: { name: 'Blackbird Kitchen' },
      deliveryOutcome: outcome,
    });

    beforeEach(() => {
      mockPrisma.deliveryRunOrder.findFirst.mockResolvedValue({
        run: { driverName: 'James Vine', name: 'Tuesday City Run', deliveryDate: new Date('2026-08-28') },
      });
    });

    it('projects the outcome, derives driver/run, and presigns both photo variants', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(orderRow(baseOutcome));

      const result = await service.getDeliveryOutcome('order-1', 'dist-1');

      expect(result.orderNumber).toBe('ORD-2026-00386');
      expect(result.orderStatus).toBe(OrderStatus.DELIVERED);
      expect(result.customerName).toBe('Blackbird Kitchen');
      expect(result.driverName).toBe('James Vine');
      expect(result.runName).toBe('Tuesday City Run');
      expect(result.runDeliveryDate).toBe('2026-08-28');
      expect(result.recipientName).toBe('Jane Doe');
      expect(result.deliveryNotes).toBe('Left with front desk');
      expect(result.dropMethod).toBe('HANDED_TO_PERSON');
      expect(result.deviceCapturedAt).toBe('2026-08-28T14:30:00.000Z');
      expect(result.serverRecordedAt).toBe('2026-08-28T14:32:00.000Z');
      expect(result.submittedViaQrToken).toBe(true);
      expect(result.correctedByName).toBeNull();
      expect(result.location).toEqual({
        available: true,
        latitude: 51.51,
        longitude: -0.12,
        accuracyM: 12,
        capturedAt: '2026-08-28T14:29:00.000Z',
      });
      // photos returned in query order (service asks Prisma to sort); URLs presigned, keys absent
      expect(result.photos.map((p) => p.id)).toEqual(['photo-2', 'photo-1']);
      expect(result.photos[0].url).toBe('https://signed.example/k/2/full.webp?sig=x');
      expect(result.photos[0].thumbnailUrl).toBe('https://signed.example/k/2/thumb.webp?sig=x');
      expect(JSON.stringify(result.photos)).not.toContain('.webp"'); // no bare keys, only signed urls
      expect(mockR2.presignGetUrl).toHaveBeenCalledWith('k/2/full.webp', 900, 'wholo-deliveries');
    });

    it('passes the signature blob through verbatim', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(orderRow(baseOutcome));
      const result = await service.getDeliveryOutcome('order-1', 'dist-1');
      expect(result.signature).toEqual(baseOutcome.signature);
    });

    it('404s when the order is not this distributor’s', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);
      await expect(service.getDeliveryOutcome('order-1', 'dist-1')).rejects.toThrow(NotFoundException);
    });

    it('404s when the order has no outcome recorded', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(orderRow(null));
      await expect(service.getDeliveryOutcome('order-1', 'dist-1')).rejects.toThrow(NotFoundException);
    });

    it('returns null driver/run when the order has no active run allocation', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(orderRow(baseOutcome));
      mockPrisma.deliveryRunOrder.findFirst.mockResolvedValue(null);
      const result = await service.getDeliveryOutcome('order-1', 'dist-1');
      expect(result.driverName).toBeNull();
      expect(result.runName).toBeNull();
      expect(result.runDeliveryDate).toBeNull();
    });

    it('maps an unable-to-deliver outcome with no drop method or signature', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        ...orderRow({
          ...baseOutcome,
          outcome: 'UNABLE_TO_DELIVER',
          dropMethod: null,
          signature: null,
          recipientName: null,
          unableReason: 'CUSTOMER_CLOSED',
        }),
        status: OrderStatus.DELIVERY_FAILED,
      });
      const result = await service.getDeliveryOutcome('order-1', 'dist-1');
      expect(result.outcome).toBe('UNABLE_TO_DELIVER');
      expect(result.orderStatus).toBe(OrderStatus.DELIVERY_FAILED);
      expect(result.unableReason).toBe('CUSTOMER_CLOSED');
      expect(result.dropMethod).toBeNull();
      expect(result.signature).toBeNull();
    });

    it('reports location unavailable with null coordinates', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(
        orderRow({ ...baseOutcome, locationUnavailable: true, latitude: null, longitude: null, locationAccuracyM: null }),
      );
      const result = await service.getDeliveryOutcome('order-1', 'dist-1');
      expect(result.location.available).toBe(false);
      expect(result.location.latitude).toBeNull();
      expect(result.location.longitude).toBeNull();
    });

    it('resolves the correcting user’s name when the outcome was corrected', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(
        orderRow({ ...baseOutcome, correctedAt: new Date('2026-08-29T09:00:00.000Z'), correctedByUserId: 'user-9' }),
      );
      mockPrisma.user.findUnique.mockResolvedValue({ firstName: 'Alex', lastName: 'Morgan' });
      const result = await service.getDeliveryOutcome('order-1', 'dist-1');
      expect(result.correctedAt).toBe('2026-08-29T09:00:00.000Z');
      expect(result.correctedByName).toBe('Alex Morgan');
    });
  });

  // ── acceptOrder ─────────────────────────────────────────────────────────────

  describe('acceptOrder', () => {
    it('accepts a submitted order', async () => {
      const order = makeOrder({ status: OrderStatus.SUBMITTED });
      const accepted = makeOrder({ status: OrderStatus.ACCEPTED, acceptedByUserId: 'user-1' });
      mockPrisma.order.findFirst.mockResolvedValue(order);
      mockPrisma.accountingConnection.findFirst.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
      mockPrisma.order.update.mockResolvedValue(accepted);
      mockPrisma.orderLine.updateMany.mockResolvedValue({ count: 0 });
      mockOutbox.writeEvent.mockResolvedValue(undefined);
      mockPrisma.user.findUnique.mockResolvedValue({ firstName: 'Jane', lastName: 'Doe' });

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
      expect(mockAudit.record).toHaveBeenCalledWith(
        mockPrisma,
        expect.objectContaining({
          entityType: 'ORDER',
          entityId: 'order-1',
          action: 'ORDER_ACCEPTED',
          actorType: ActorType.USER,
          actorUserId: 'user-1',
          actorName: 'Jane Doe',
        }),
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

    describe('tax type mapping gate', () => {
      const setUpAcceptableOrder = () => {
        const order = makeOrder({ status: OrderStatus.SUBMITTED });
        mockPrisma.order.findFirst.mockResolvedValue(order);
        mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
        mockPrisma.order.update.mockResolvedValue(makeOrder({ status: OrderStatus.ACCEPTED }));
        mockPrisma.orderLine.updateMany.mockResolvedValue({ count: 0 });
        mockOutbox.writeEvent.mockResolvedValue(undefined);
        mockPrisma.user.findUnique.mockResolvedValue({ firstName: 'Jane', lastName: 'Doe' });
      };

      it('skips the mapping check and accepts when the distributor has no active accounting connection', async () => {
        setUpAcceptableOrder();
        mockPrisma.accountingConnection.findFirst.mockResolvedValue(null);

        const result = await service.acceptOrder('order-1', 'dist-1', 'user-1');

        expect(result.status).toBe(OrderStatus.ACCEPTED);
        expect(mockPrisma.orderLine.findMany).not.toHaveBeenCalled();
      });

      it('accepts when all the order tax types have confirmed mappings', async () => {
        setUpAcceptableOrder();
        mockPrisma.accountingConnection.findFirst.mockResolvedValue({ id: 'conn-1' });
        mockPrisma.orderLine.findMany.mockResolvedValue([{ taxTypeId: 'tt-1' }]);
        mockPrisma.taxTypeAccountingMapping.findMany.mockResolvedValue([{ taxTypeId: 'tt-1' }]);

        const result = await service.acceptOrder('order-1', 'dist-1', 'user-1');

        expect(result.status).toBe(OrderStatus.ACCEPTED);
        expect(mockPrisma.order.update).toHaveBeenCalled();
      });

      it('throws a TAX_TYPE_UNMAPPED 409 when a tax type has no confirmed mapping, without confirmUnmappedTaxTypes', async () => {
        setUpAcceptableOrder();
        mockPrisma.accountingConnection.findFirst.mockResolvedValue({ id: 'conn-1' });
        mockPrisma.orderLine.findMany.mockResolvedValue([{ taxTypeId: 'tt-1' }]);
        mockPrisma.taxTypeAccountingMapping.findMany.mockResolvedValue([]);
        mockPrisma.taxType.findMany.mockResolvedValue([{ name: 'Zero-rated' }]);

        await expect(service.acceptOrder('order-1', 'dist-1', 'user-1')).rejects.toThrow(ConflictException);
        expect(mockPrisma.order.update).not.toHaveBeenCalled();
      });

      it('accepts anyway when confirmUnmappedTaxTypes is true', async () => {
        setUpAcceptableOrder();
        mockPrisma.accountingConnection.findFirst.mockResolvedValue({ id: 'conn-1' });
        mockPrisma.orderLine.findMany.mockResolvedValue([{ taxTypeId: 'tt-1' }]);
        mockPrisma.taxTypeAccountingMapping.findMany.mockResolvedValue([]);

        const result = await service.acceptOrder('order-1', 'dist-1', 'user-1', true);

        expect(result.status).toBe(OrderStatus.ACCEPTED);
        expect(mockPrisma.taxType.findMany).not.toHaveBeenCalled();
      });
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
      mockPrisma.user.findUnique.mockResolvedValue({ firstName: 'Jane', lastName: 'Doe' });

      const result = await service.rejectOrder('order-1', 'dist-1', 'user-1', 'Out of stock');
      expect(result.status).toBe(OrderStatus.REJECTED);
      expect(mockOutbox.writeEvent).toHaveBeenCalledWith(
        expect.anything(), 'Order', 'order-1', 'OrderRejected', expect.any(Object),
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        mockPrisma,
        expect.objectContaining({
          entityType: 'ORDER',
          entityId: 'order-1',
          action: 'ORDER_REJECTED',
          actorType: ActorType.USER,
          actorUserId: 'user-1',
          actorName: 'Jane Doe',
          changes: { reason: 'Out of stock' },
        }),
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
      mockPrisma.user.findUnique.mockResolvedValue({ firstName: 'Jane', lastName: 'Doe' });

      const result = await service.cancelOrder('order-1', 'dist-1', 'user-1', 'Changed mind');
      expect(result.status).toBe(OrderStatus.CANCELLED);
      expect(mockAudit.record).toHaveBeenCalledWith(
        mockPrisma,
        expect.objectContaining({
          entityType: 'ORDER',
          entityId: 'order-1',
          action: 'ORDER_CANCELLED',
          actorType: ActorType.USER,
          actorUserId: 'user-1',
          actorName: 'Jane Doe',
          changes: { reason: 'Changed mind' },
        }),
      );
    });

    it('cancels an accepted order', async () => {
      const order = makeOrder({ status: OrderStatus.ACCEPTED });
      const cancelled = makeOrder({ status: OrderStatus.CANCELLED });
      mockPrisma.order.findFirst.mockResolvedValue(order);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
      mockPrisma.order.update.mockResolvedValue(cancelled);
      mockPrisma.orderLine.updateMany.mockResolvedValue({ count: 0 });
      mockOutbox.writeEvent.mockResolvedValue(undefined);
      mockPrisma.user.findUnique.mockResolvedValue({ firstName: 'Jane', lastName: 'Doe' });

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
