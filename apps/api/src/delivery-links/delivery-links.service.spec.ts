import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, GoneException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DeliveryDropMethod, DeliveryOutcomeType, OrderStatus, Prisma, UnableToDeliverReason } from '@prisma/client';
import { DeliveryLinksService } from './delivery-links.service';
import { DeliveryPhotoService } from './delivery-photo.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { DeliveryTokenSigner } from './delivery-token.signer';

const order = {
  id: 'order-1',
  distributorId: 'dist-1',
  orderNumber: '10428',
  status: OrderStatus.ACCEPTED,
  deliveryAddressSnapshot: { line1: '8 High Street', city: 'Halifax', postcode: 'HX1 2AB' },
  notes: 'Use the rear entrance',
  customer: { name: 'The Old Hall', phone: '07700 900123' },
  distributor: { name: 'Blackbird Wines' },
  lines: [{ productNameSnapshot: 'Rioja Crianza', quantityOrdered: 3 }],
};

const signature = {
  format: 'signature_pad' as const,
  version: 5,
  width: 320,
  height: 200,
  strokes: [{ points: [{ x: 1, y: 2, time: 0, pressure: 0.5 }] }],
};

const capturedAt = '2026-08-26T09:00:00.000Z';

// Full valid Delivered submission — HANDED_TO_PERSON is the only usable drop
// method this increment and it requires a recipient name and a signature.
const deliveredDto = {
  outcome: DeliveryOutcomeType.DELIVERED,
  dropMethod: DeliveryDropMethod.HANDED_TO_PERSON,
  recipientName: 'Sam Taylor',
  signature,
  capturedAt,
};

function uniqueConstraintError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.2.1',
  });
}

describe('DeliveryLinksService', () => {
  let service: DeliveryLinksService;
  let prisma: {
    order: { findUnique: jest.Mock; update: jest.Mock };
    orderDeliveryOutcome: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock; create: jest.Mock };
    orderDeliveryPhoto: { updateMany: jest.Mock };
    deliveryRunOrder: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let outbox: { writeEvent: jest.Mock };
  let signer: { verify: jest.Mock };

  beforeEach(async () => {
    prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(order), update: jest.fn() },
      orderDeliveryOutcome: {
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'outcome-1', outcome: DeliveryOutcomeType.DELIVERED, recordedAt: new Date() }),
      },
      orderDeliveryPhoto: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      deliveryRunOrder: { findFirst: jest.fn().mockResolvedValue({ run: { driverName: 'Alex Turner' } }) },
      $transaction: jest.fn(async (fn) => fn(prisma)),
    };
    audit = { record: jest.fn() };
    outbox = { writeEvent: jest.fn() };
    signer = { verify: jest.fn().mockReturnValue('order-1') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryLinksService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: OutboxService, useValue: outbox },
        { provide: DeliveryTokenSigner, useValue: signer },
        { provide: DeliveryPhotoService, useValue: { uploadPhoto: jest.fn(), deletePhoto: jest.fn() } },
      ],
    }).compile();

    service = module.get(DeliveryLinksService);
  });

  // matchesExisting now reads location + linked-photo fields; a stored row needs
  // them present or an idempotent retry is spuriously treated as a conflict.
  const storedRow = (over: Record<string, unknown> = {}) => ({
    outcome: DeliveryOutcomeType.DELIVERED,
    dropMethod: DeliveryDropMethod.HANDED_TO_PERSON,
    recipientName: 'Sam Taylor',
    notes: null,
    unableReason: null,
    unableReasonNote: null,
    signature,
    capturedAt: new Date(capturedAt),
    latitude: null,
    longitude: null,
    locationAccuracyM: null,
    locationCapturedAt: null,
    locationUnavailable: false,
    photos: [],
    recordedAt: new Date(),
    ...over,
  });

  describe('getOrder', () => {
    it('returns a pending view with order details but no pricing, for a valid unresolved token', async () => {
      const result = await service.getOrder('order-1.sig');

      expect(result.state).toBe('PENDING');
      expect(result.orderNumber).toBe('10428');
      expect(result.customerPhone).toBe('07700 900123');
      expect(result.lines).toEqual([{ productName: 'Rioja Crianza', quantity: 3 }]);
      expect(result).not.toHaveProperty('price');
    });

    it('throws NotFoundException for a malformed/forged token', async () => {
      signer.verify.mockReturnValue(null);
      await expect(service.getOrder('garbage')).rejects.toThrow(NotFoundException);
    });

    it('throws GoneException for a cancelled order', async () => {
      prisma.order.findUnique.mockResolvedValue({ ...order, status: OrderStatus.CANCELLED });
      await expect(service.getOrder('order-1.sig')).rejects.toThrow(GoneException);
    });

    it('returns a minimal read-only confirmation when an outcome already exists — never the signature', async () => {
      prisma.orderDeliveryOutcome.findUnique.mockResolvedValue({
        outcome: DeliveryOutcomeType.DELIVERED,
        recordedAt: new Date('2026-08-25T10:00:00Z'),
        signature,
      });

      const result = await service.getOrder('order-1.sig');

      expect(result.state).toBe('SUBMITTED');
      expect(result.outcome).toEqual(expect.objectContaining({ outcome: 'DELIVERED', driverName: 'Alex Turner' }));
      expect(result.address).toEqual({ line1: null, line2: null, city: null, state: null, postcode: null, country: null });
      expect(result.lines).toEqual([]);
      expect(JSON.stringify(result)).not.toContain('signature_pad');
    });
  });

  describe('submitOutcome', () => {
    it('records a Delivered outcome and writes an audit log entry in the same transaction', async () => {
      (prisma as any).orderDeliveryOutcome.create.mockResolvedValue({
        outcome: DeliveryOutcomeType.DELIVERED,
        recordedAt: new Date(),
      });

      await service.submitOutcome('order-1.sig', deliveredDto as any);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect((prisma as any).orderDeliveryOutcome.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId: 'order-1',
            outcome: 'DELIVERED',
            dropMethod: 'HANDED_TO_PERSON',
            recipientName: 'Sam Taylor',
            signature,
            capturedAt: new Date(capturedAt),
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(prisma, expect.objectContaining({
        distributorId: 'dist-1',
        entityType: 'ORDER',
        entityId: 'order-1',
        action: 'DELIVERY_OUTCOME_RECORDED',
        changes: expect.objectContaining({ dropMethod: 'HANDED_TO_PERSON' }),
      }));
    });

    it('sets Order.status to DELIVERED and writes an OrderDelivered outbox event, same transaction as the outcome', async () => {
      (prisma as any).orderDeliveryOutcome.create.mockResolvedValue({
        outcome: DeliveryOutcomeType.DELIVERED,
        recordedAt: new Date('2026-08-26T09:00:00Z'),
      });

      await service.submitOutcome('order-1.sig', deliveredDto as any);

      expect(prisma.order.update).toHaveBeenCalledWith({ where: { id: 'order-1' }, data: { status: OrderStatus.DELIVERED } });
      expect(outbox.writeEvent).toHaveBeenCalledWith(
        prisma,
        'Order',
        'order-1',
        'OrderDelivered',
        expect.objectContaining({
          orderId: 'order-1',
          distributorId: 'dist-1',
          driverName: 'Alex Turner',
          unableReason: null,
        }),
      );
    });

    it('sets Order.status to DELIVERY_FAILED and writes an OrderDeliveryFailed outbox event for Unable to deliver', async () => {
      (prisma as any).orderDeliveryOutcome.create.mockResolvedValue({
        outcome: DeliveryOutcomeType.UNABLE_TO_DELIVER,
        recordedAt: new Date('2026-08-26T09:00:00Z'),
      });
      const unableDto = { outcome: DeliveryOutcomeType.UNABLE_TO_DELIVER, unableReason: UnableToDeliverReason.CUSTOMER_REFUSED };

      await service.submitOutcome('order-1.sig', unableDto as any);

      expect(prisma.order.update).toHaveBeenCalledWith({ where: { id: 'order-1' }, data: { status: OrderStatus.DELIVERY_FAILED } });
      expect(outbox.writeEvent).toHaveBeenCalledWith(
        prisma,
        'Order',
        'order-1',
        'OrderDeliveryFailed',
        expect.objectContaining({ unableReason: UnableToDeliverReason.CUSTOMER_REFUSED }),
      );
    });

    it('does not write an outbox event or change status on a rejected validation error', async () => {
      await expect(
        service.submitOutcome('order-1.sig', { outcome: DeliveryOutcomeType.UNABLE_TO_DELIVER } as any),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(outbox.writeEvent).not.toHaveBeenCalled();
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('requires a reason when the outcome is Unable to deliver', async () => {
      await expect(
        service.submitOutcome('order-1.sig', { outcome: DeliveryOutcomeType.UNABLE_TO_DELIVER } as any),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('requires a note when the reason is Other', async () => {
      await expect(
        service.submitOutcome('order-1.sig', {
          outcome: DeliveryOutcomeType.UNABLE_TO_DELIVER,
          unableReason: UnableToDeliverReason.OTHER,
        } as any),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('requires a drop method when the outcome is Delivered', async () => {
      await expect(
        service.submitOutcome('order-1.sig', { outcome: DeliveryOutcomeType.DELIVERED, recipientName: 'Sam' } as any),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('requires a recipient name and signature when handed to a person', async () => {
      await expect(
        service.submitOutcome('order-1.sig', {
          outcome: DeliveryOutcomeType.DELIVERED,
          dropMethod: DeliveryDropMethod.HANDED_TO_PERSON,
          recipientName: 'Sam Taylor',
        } as any),
      ).rejects.toThrow(UnprocessableEntityException);

      await expect(
        service.submitOutcome('order-1.sig', {
          outcome: DeliveryOutcomeType.DELIVERED,
          dropMethod: DeliveryDropMethod.HANDED_TO_PERSON,
          signature,
        } as any),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rejects an oversized signature payload', async () => {
      const huge = { ...signature, strokes: [{ points: Array.from({ length: 5000 }, (_, i) => ({ x: i, y: i, time: i, pressure: 0.5 })) }] };
      await expect(
        service.submitOutcome('order-1.sig', { ...deliveredDto, signature: huge } as any),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('throws GoneException for a non-deliverable order', async () => {
      prisma.order.findUnique.mockResolvedValue({ ...order, status: OrderStatus.REJECTED });
      await expect(service.submitOutcome('order-1.sig', deliveredDto as any)).rejects.toThrow(GoneException);
    });

    it('is idempotent: retrying with the same body after a race returns the existing outcome instead of erroring', async () => {
      prisma.orderDeliveryOutcome.create.mockRejectedValue(uniqueConstraintError());
      prisma.orderDeliveryOutcome.findUniqueOrThrow.mockResolvedValue(storedRow());

      const result = await service.submitOutcome('order-1.sig', deliveredDto as any);
      expect(result.state).toBe('SUBMITTED');
    });

    it('rejects a second submission with a different body as a conflict', async () => {
      prisma.orderDeliveryOutcome.create.mockRejectedValue(uniqueConstraintError());
      prisma.orderDeliveryOutcome.findUniqueOrThrow.mockResolvedValue(
        storedRow({
          outcome: DeliveryOutcomeType.UNABLE_TO_DELIVER,
          dropMethod: null,
          recipientName: null,
          unableReason: UnableToDeliverReason.CUSTOMER_REFUSED,
          signature: null,
          capturedAt: null,
        }),
      );

      await expect(service.submitOutcome('order-1.sig', deliveredDto as any)).rejects.toThrow(ConflictException);
    });

    it('rejects a retry that changes only the signature as a conflict', async () => {
      prisma.orderDeliveryOutcome.create.mockRejectedValue(uniqueConstraintError());
      prisma.orderDeliveryOutcome.findUniqueOrThrow.mockResolvedValue(
        storedRow({ signature: { ...signature, strokes: [{ points: [{ x: 9, y: 9, time: 1, pressure: 0.1 }] }] } }),
      );

      await expect(service.submitOutcome('order-1.sig', deliveredDto as any)).rejects.toThrow(ConflictException);
    });

    it('links supplied photos to the outcome and persists device location', async () => {
      prisma.orderDeliveryPhoto.updateMany.mockResolvedValue({ count: 2 });
      const dto = {
        ...deliveredDto,
        photoIds: ['ph-1', 'ph-2'],
        location: { latitude: 53.7, longitude: -1.8, accuracyM: 8, capturedAt: '2026-08-27T10:00:00.000Z' },
      };

      await service.submitOutcome('order-1.sig', dto as any);

      expect(prisma.orderDeliveryOutcome.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            latitude: 53.7,
            longitude: -1.8,
            locationAccuracyM: 8,
            locationCapturedAt: new Date('2026-08-27T10:00:00.000Z'),
            locationUnavailable: false,
          }),
        }),
      );
      expect(prisma.orderDeliveryPhoto.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['ph-1', 'ph-2'] }, orderId: 'order-1', outcomeId: null },
        data: { outcomeId: 'outcome-1' },
      });
    });

    it('stores null coordinates when location was unavailable', async () => {
      await service.submitOutcome('order-1.sig', { ...deliveredDto, location: { unavailable: true } } as any);

      expect(prisma.orderDeliveryOutcome.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ latitude: null, longitude: null, locationUnavailable: true }),
        }),
      );
    });

    it('rejects the outcome when a supplied photo is not an unlinked photo for this order', async () => {
      prisma.orderDeliveryPhoto.updateMany.mockResolvedValue({ count: 1 });
      await expect(
        service.submitOutcome('order-1.sig', { ...deliveredDto, photoIds: ['ph-1', 'ph-2'] } as any),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('idempotent retry matches on the same photo set and location', async () => {
      prisma.orderDeliveryOutcome.create.mockRejectedValue(uniqueConstraintError());
      prisma.orderDeliveryOutcome.findUniqueOrThrow.mockResolvedValue(
        storedRow({ photos: [{ id: 'ph-2' }, { id: 'ph-1' }] }),
      );

      const result = await service.submitOutcome('order-1.sig', { ...deliveredDto, photoIds: ['ph-1', 'ph-2'] } as any);
      expect(result.state).toBe('SUBMITTED');
    });

    it('rejects a retry that changes only the photo set as a conflict', async () => {
      prisma.orderDeliveryOutcome.create.mockRejectedValue(uniqueConstraintError());
      prisma.orderDeliveryOutcome.findUniqueOrThrow.mockResolvedValue(storedRow({ photos: [{ id: 'ph-1' }] }));

      await expect(
        service.submitOutcome('order-1.sig', { ...deliveredDto, photoIds: ['ph-1', 'ph-2'] } as any),
      ).rejects.toThrow(ConflictException);
    });
  });
});
