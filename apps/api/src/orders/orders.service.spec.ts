import { Test, TestingModule } from '@nestjs/testing';
import { UnprocessableEntityException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { CartOrderStatus, OrganisationType, OrderStatus, OrderAcceptanceMode, AcceptanceModeSource } from '@prisma/client';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { DeliveryAvailabilityService } from '../delivery-availability/delivery-availability.service';

const DISTRIBUTOR_ID = 'dist-1';
const CUSTOMER_ID = 'cust-1';
const USER_ID = 'user-1';

function makeDistributor() {
  return { id: DISTRIBUTOR_ID };
}

function makeCart(lines: unknown[] = [{ id: 'line-1' }]) {
  return {
    id: 'cart-1',
    distributorId: DISTRIBUTOR_ID,
    lines: lines.map((l: any) => ({
      id: l.id ?? 'line-1',
      productId: 'prod-1',
      quantity: 2,
      unitPrice: { toFixed: () => '10.00' },
      resolvedPriceListId: null,
      resolvedPriceListRuleId: null,
      product: { id: 'prod-1', name: 'Wine', sku: 'SKU-1', price: { toFixed: () => '10.00' } },
    })),
  };
}

describe('OrdersService — delivery date revalidation', () => {
  let service: OrdersService;
  let prisma: jest.Mocked<PrismaService>;
  let deliveryAvailability: jest.Mocked<DeliveryAvailabilityService>;

  beforeEach(async () => {
    const mockPrisma = {
      organisation: { findFirst: jest.fn() },
      cartOrder: { findUnique: jest.fn(), delete: jest.fn() },
      distributorSettings: { findUnique: jest.fn() },
      tradeRelationship: { findUnique: jest.fn() },
      order: { create: jest.fn() },
      orderLine: { createMany: jest.fn() },
      cartOrderLine: { deleteMany: jest.fn() },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(),
    };

    const mockOutbox = { writeEvent: jest.fn() };
    const mockDelivery = { getAvailableDates: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OutboxService, useValue: mockOutbox },
        { provide: DeliveryAvailabilityService, useValue: mockDelivery },
      ],
    }).compile();

    service = module.get(OrdersService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
    deliveryAvailability = module.get(DeliveryAvailabilityService) as jest.Mocked<DeliveryAvailabilityService>;
  });

  function setupHappyPath() {
    (prisma.organisation.findFirst as jest.Mock).mockResolvedValue(makeDistributor());
    (prisma.cartOrder.findUnique as jest.Mock).mockResolvedValue(makeCart());
    (prisma.distributorSettings.findUnique as jest.Mock).mockResolvedValue({
      defaultOrderAcceptanceMode: OrderAcceptanceMode.MANUAL,
    });
    (prisma.tradeRelationship.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ nextval: BigInt(1) }]);
    (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        order: { create: jest.fn().mockResolvedValue({ id: 'order-1', orderNumber: 'ORD-2024-00001', distributorId: DISTRIBUTOR_ID, traderCustomerId: CUSTOMER_ID, placedByUserId: USER_ID, status: OrderStatus.SUBMITTED, currency: 'GBP', subtotalAmount: { toFixed: () => '20.00' }, taxAmount: { toFixed: () => '0.00' }, totalAmount: { toFixed: () => '20.00' }, billingAddressSnapshot: null, deliveryAddressSnapshot: null, requestedDeliveryDate: null, customerReference: null, notes: null, acceptanceModeSnapshot: OrderAcceptanceMode.MANUAL, acceptanceModeSourceSnapshot: AcceptanceModeSource.DISTRIBUTOR_DEFAULT, submittedAt: new Date(), acceptedAt: null, acceptedByActorType: null, acceptedByUserId: null, rejectedAt: null, rejectedByUserId: null, rejectionReason: null, cancelledAt: null, cancelledByUserId: null, cancellationReason: null, createdAt: new Date(), updatedAt: new Date(), customer: { id: CUSTOMER_ID, name: 'Test Customer' }, lines: [] }) },
        orderLine: { createMany: jest.fn().mockResolvedValue({}) },
        cartOrderLine: { deleteMany: jest.fn().mockResolvedValue({}) },
        cartOrder: { delete: jest.fn().mockResolvedValue({}) },
        outbox: { writeEvent: jest.fn().mockResolvedValue({}) },
      }),
    );
  }

  it('skips delivery revalidation when no requestedDeliveryDate is provided', async () => {
    setupHappyPath();
    await service.submitOrder({ distributorSlug: 'dist', requestedDeliveryDate: undefined }, USER_ID, CUSTOMER_ID);
    expect(deliveryAvailability.getAvailableDates).not.toHaveBeenCalled();
  });

  it('accepts order when requested date is in available dates', async () => {
    setupHappyPath();
    (deliveryAvailability.getAvailableDates as jest.Mock).mockResolvedValue({
      profileId: 'profile-1',
      dates: [
        { date: '2024-06-14', cutoffDeadline: '2024-06-12T17:00:00.000Z' },
        { date: '2024-06-17', cutoffDeadline: '2024-06-14T17:00:00.000Z' },
      ],
    });
    await expect(
      service.submitOrder({ distributorSlug: 'dist', requestedDeliveryDate: '2024-06-14' }, USER_ID, CUSTOMER_ID),
    ).resolves.toBeDefined();
    expect(deliveryAvailability.getAvailableDates).toHaveBeenCalledWith(DISTRIBUTOR_ID, CUSTOMER_ID);
  });

  it('rejects order when requested date is not in available dates', async () => {
    setupHappyPath();
    (deliveryAvailability.getAvailableDates as jest.Mock).mockResolvedValue({
      profileId: 'profile-1',
      dates: [{ date: '2024-06-17', cutoffDeadline: '2024-06-14T17:00:00.000Z' }],
    });
    await expect(
      service.submitOrder({ distributorSlug: 'dist', requestedDeliveryDate: '2024-06-14' }, USER_ID, CUSTOMER_ID),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('rejects order when no dates are available (no profile assigned)', async () => {
    setupHappyPath();
    (deliveryAvailability.getAvailableDates as jest.Mock).mockResolvedValue({
      profileId: null,
      dates: [],
    });
    await expect(
      service.submitOrder({ distributorSlug: 'dist', requestedDeliveryDate: '2024-06-14' }, USER_ID, CUSTOMER_ID),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('throws NotFoundException when distributor slug is not found', async () => {
    (prisma.organisation.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      service.submitOrder({ distributorSlug: 'bad-slug' }, USER_ID, CUSTOMER_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when order-as distributorId does not match cart distributorId', async () => {
    (prisma.organisation.findFirst as jest.Mock).mockResolvedValue(makeDistributor());
    (prisma.cartOrder.findUnique as jest.Mock).mockResolvedValue(makeCart());

    await expect(
      service.submitOrder({ distributorSlug: 'dist' }, USER_ID, CUSTOMER_ID, undefined, 'other-dist-id'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('does not throw when order-as distributorId matches cart distributorId', async () => {
    setupHappyPath();
    await expect(
      service.submitOrder({ distributorSlug: 'dist' }, USER_ID, CUSTOMER_ID, undefined, DISTRIBUTOR_ID),
    ).resolves.toBeDefined();
  });
});

describe('OrdersService — listCustomerOrders', () => {
  let service: OrdersService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      organisation: { findFirst: jest.fn() },
      cartOrder: { findUnique: jest.fn() },
      distributorSettings: { findUnique: jest.fn() },
      tradeRelationship: { findUnique: jest.fn() },
      order: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), create: jest.fn() },
      orderLine: { createMany: jest.fn() },
      cartOrderLine: { deleteMany: jest.fn() },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OutboxService, useValue: { writeEvent: jest.fn() } },
        { provide: DeliveryAvailabilityService, useValue: { getAvailableDates: jest.fn() } },
      ],
    }).compile();

    service = module.get(OrdersService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
  });

  it('filters by distributorId when distributorSlug is provided', async () => {
    (prisma.organisation.findFirst as jest.Mock).mockResolvedValue({ id: DISTRIBUTOR_ID });

    await service.listCustomerOrders(CUSTOMER_ID, { distributorSlug: 'winos' });

    expect(prisma.organisation.findFirst).toHaveBeenCalledWith({
      where: { slug: 'winos', type: OrganisationType.DISTRIBUTOR },
      select: { id: true },
    });
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ traderCustomerId: CUSTOMER_ID, distributorId: DISTRIBUTOR_ID }),
          ]),
        }),
      }),
    );
  });

  it('does not filter by distributorId when no distributorSlug is provided', async () => {
    await service.listCustomerOrders(CUSTOMER_ID, {});

    expect(prisma.organisation.findFirst).not.toHaveBeenCalled();
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ traderCustomerId: CUSTOMER_ID }),
          ]),
        }),
      }),
    );
    const call = (prisma.order.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.AND[0]).not.toHaveProperty('distributorId');
  });

  it('throws NotFoundException when distributorSlug does not match a distributor', async () => {
    (prisma.organisation.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      service.listCustomerOrders(CUSTOMER_ID, { distributorSlug: 'unknown-slug' }),
    ).rejects.toThrow(NotFoundException);
  });
});
