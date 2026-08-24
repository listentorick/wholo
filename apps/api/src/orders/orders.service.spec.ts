import { Test, TestingModule } from '@nestjs/testing';
import { UnprocessableEntityException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { CartOrderStatus, OrganisationType, OrderStatus, OrderAcceptanceMode, AcceptanceModeSource, ActorType, Prisma } from '@prisma/client';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { AuditService } from '../audit/audit.service';
import { DeliveryAvailabilityService } from '../delivery-availability/delivery-availability.service';
import { R2StorageService } from '../asset-images/r2-storage.service';

const DISTRIBUTOR_ID = 'dist-1';
const CUSTOMER_ID = 'cust-1';
const USER_ID = 'user-1';

function makeDistributor(overrides: Record<string, unknown> = {}) {
  return { id: DISTRIBUTOR_ID, distributorSettings: null, ...overrides };
}

function makeRelationship(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ACTIVE',
    minimumOrderSpend: null,
    deliveryLine1: null, deliveryLine2: null, deliveryCity: null,
    deliveryState: null, deliveryPostcode: null, deliveryCountry: null,
    traderCustomerSettings: null,
    customer: {
      billingLine1: null, billingLine2: null, billingCity: null,
      billingState: null, billingPostcode: null, billingCountry: null,
    },
    ...overrides,
  };
}

function makeCart(lines: unknown[] = [{ id: 'line-1' }]) {
  return {
    id: 'cart-1',
    distributorId: DISTRIBUTOR_ID,
    lines: lines.map((l: any) => ({
      id: l.id ?? 'line-1',
      productId: l.productId ?? 'prod-1',
      quantity: l.quantity ?? 2,
      unitPrice: l.unitPrice ?? new Prisma.Decimal('12.23'),
      resolvedPriceListId: null,
      resolvedPriceListRuleId: null,
      // Frozen at cart-add time (see CartService.upsertItem) — null by
      // default so tests unrelated to tax don't need to mock TaxType at all
      // (submitOrder skips the taxType.findMany lookup entirely when no
      // line has a taxTypeId).
      taxTypeId: l.taxTypeId ?? null,
      taxRateSnapshot: l.taxRateSnapshot ?? null,
      product: { id: l.productId ?? 'prod-1', name: 'Wine', sku: 'SKU-1', price: new Prisma.Decimal('12.23') },
    })),
  };
}

describe('OrdersService — delivery date revalidation', () => {
  let service: OrdersService;
  let prisma: jest.Mocked<PrismaService>;
  let deliveryAvailability: jest.Mocked<DeliveryAvailabilityService>;
  let outbox: jest.Mocked<OutboxService>;

  beforeEach(async () => {
    const mockPrisma = {
      organisation: { findFirst: jest.fn() },
      cartOrder: { findUnique: jest.fn(), delete: jest.fn() },
      distributorSettings: { findUnique: jest.fn() },
      tradeRelationship: { findFirst: jest.fn() },
      order: { create: jest.fn() },
      orderLine: { createMany: jest.fn() },
      cartOrderLine: { deleteMany: jest.fn() },
      assetImage: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(),
    };

    const mockOutbox = { writeEvent: jest.fn() };
    const mockAudit = { record: jest.fn() };
    const mockDelivery = { getAvailableDates: jest.fn() };
    const mockR2Storage = { getPublicUrl: jest.fn((k: string) => `https://cdn.test/${k}`) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OutboxService, useValue: mockOutbox },
        { provide: AuditService, useValue: mockAudit },
        { provide: DeliveryAvailabilityService, useValue: mockDelivery },
        { provide: R2StorageService, useValue: mockR2Storage },
      ],
    }).compile();

    service = module.get(OrdersService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
    deliveryAvailability = module.get(DeliveryAvailabilityService) as jest.Mocked<DeliveryAvailabilityService>;
    outbox = module.get(OutboxService) as jest.Mocked<OutboxService>;
  });

  function setupHappyPath() {
    (prisma.organisation.findFirst as jest.Mock).mockResolvedValue(makeDistributor());
    (prisma.cartOrder.findUnique as jest.Mock).mockResolvedValue(makeCart());
    (prisma.distributorSettings.findUnique as jest.Mock).mockResolvedValue({
      defaultOrderAcceptanceMode: OrderAcceptanceMode.MANUAL,
    });
    (prisma.tradeRelationship.findFirst as jest.Mock).mockResolvedValue(makeRelationship());
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ nextval: BigInt(1) }]);
    (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        order: { create: jest.fn().mockResolvedValue({ id: 'order-1', orderNumber: 'ORD-2024-00001', distributorId: DISTRIBUTOR_ID, traderCustomerId: CUSTOMER_ID, placedByUserId: USER_ID, status: OrderStatus.SUBMITTED, currency: 'GBP', subtotalAmount: { toFixed: () => '20.00' }, taxAmount: { toFixed: () => '0.00' }, totalAmount: { toFixed: () => '20.00' }, billingAddressSnapshot: null, deliveryAddressSnapshot: null, requestedDeliveryDate: null, customerReference: null, notes: null, acceptanceModeSnapshot: OrderAcceptanceMode.MANUAL, acceptanceModeSourceSnapshot: AcceptanceModeSource.DISTRIBUTOR_DEFAULT, submittedAt: new Date(), acceptedAt: null, acceptedByActorType: null, acceptedByUserId: null, rejectedAt: null, rejectedByUserId: null, rejectionReason: null, cancelledAt: null, cancelledByUserId: null, cancellationReason: null, createdAt: new Date(), updatedAt: new Date(), customer: { id: CUSTOMER_ID, name: 'Test Customer' }, invoiceExports: [], lines: [] }) },
        orderLine: { createMany: jest.fn().mockResolvedValue({}) },
        cartOrderLine: { deleteMany: jest.fn().mockResolvedValue({}) },
        cartOrder: { delete: jest.fn().mockResolvedValue({}) },
        orderAsSession: { deleteMany: jest.fn().mockResolvedValue({}) },
        outbox: { writeEvent: jest.fn().mockResolvedValue({}) },
        user: { findUnique: jest.fn().mockResolvedValue({ firstName: 'Jane', lastName: 'Doe' }) },
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
    (prisma.tradeRelationship.findFirst as jest.Mock).mockResolvedValue(makeRelationship());
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

  it('defaults order currency from the distributor settings', async () => {
    (prisma.cartOrder.findUnique as jest.Mock).mockResolvedValue(makeCart());
    (prisma.distributorSettings.findUnique as jest.Mock).mockResolvedValue({
      defaultOrderAcceptanceMode: OrderAcceptanceMode.MANUAL,
    });
    (prisma.tradeRelationship.findFirst as jest.Mock).mockResolvedValue(makeRelationship());
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ nextval: BigInt(1) }]);
    (prisma.organisation.findFirst as jest.Mock).mockResolvedValue(
      makeDistributor({ distributorSettings: { currencyCode: 'USD' } }),
    );
    const orderCreate = jest.fn().mockResolvedValue({
      id: 'order-1', orderNumber: 'ORD-2024-00001', distributorId: DISTRIBUTOR_ID, traderCustomerId: CUSTOMER_ID,
      placedByUserId: USER_ID, status: OrderStatus.SUBMITTED, currency: 'USD',
      subtotalAmount: { toFixed: () => '20.00' }, taxAmount: { toFixed: () => '0.00' }, totalAmount: { toFixed: () => '20.00' },
      billingAddressSnapshot: null, deliveryAddressSnapshot: null, requestedDeliveryDate: null, customerReference: null,
      notes: null, acceptanceModeSnapshot: OrderAcceptanceMode.MANUAL, acceptanceModeSourceSnapshot: AcceptanceModeSource.DISTRIBUTOR_DEFAULT,
      submittedAt: new Date(), acceptedAt: null, acceptedByActorType: null, acceptedByUserId: null, rejectedAt: null,
      rejectedByUserId: null, rejectionReason: null, cancelledAt: null, cancelledByUserId: null, cancellationReason: null,
      createdAt: new Date(), updatedAt: new Date(), customer: { id: CUSTOMER_ID, name: 'Test Customer' }, invoiceExports: [], lines: [],
    });
    (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        order: { create: orderCreate },
        orderLine: { createMany: jest.fn().mockResolvedValue({}) },
        cartOrderLine: { deleteMany: jest.fn().mockResolvedValue({}) },
        cartOrder: { delete: jest.fn().mockResolvedValue({}) },
        orderAsSession: { deleteMany: jest.fn().mockResolvedValue({}) },
        outbox: { writeEvent: jest.fn().mockResolvedValue({}) },
        user: { findUnique: jest.fn().mockResolvedValue({ firstName: 'Jane', lastName: 'Doe' }) },
      }),
    );

    await service.submitOrder({ distributorSlug: 'dist' }, USER_ID, CUSTOMER_ID);

    expect(orderCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currency: 'USD' }) }),
    );
  });

  it('falls back to GBP when the distributor has no settings row', async () => {
    setupHappyPath(); // makeDistributor() defaults distributorSettings: null
    let capturedData: Record<string, unknown> | undefined;
    (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        order: {
          create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            capturedData = data;
            return Promise.resolve({
              id: 'order-1', orderNumber: 'ORD-2024-00001', distributorId: DISTRIBUTOR_ID, traderCustomerId: CUSTOMER_ID,
              placedByUserId: USER_ID, status: OrderStatus.SUBMITTED, currency: 'GBP',
              subtotalAmount: { toFixed: () => '20.00' }, taxAmount: { toFixed: () => '0.00' }, totalAmount: { toFixed: () => '20.00' },
              billingAddressSnapshot: null, deliveryAddressSnapshot: null, requestedDeliveryDate: null, customerReference: null,
              notes: null, acceptanceModeSnapshot: OrderAcceptanceMode.MANUAL, acceptanceModeSourceSnapshot: AcceptanceModeSource.DISTRIBUTOR_DEFAULT,
              submittedAt: new Date(), acceptedAt: null, acceptedByActorType: null, acceptedByUserId: null, rejectedAt: null,
              rejectedByUserId: null, rejectionReason: null, cancelledAt: null, cancelledByUserId: null, cancellationReason: null,
              createdAt: new Date(), updatedAt: new Date(), customer: { id: CUSTOMER_ID, name: 'Test Customer' }, invoiceExports: [], lines: [],
            });
          }),
        },
        orderLine: { createMany: jest.fn().mockResolvedValue({}) },
        cartOrderLine: { deleteMany: jest.fn().mockResolvedValue({}) },
        cartOrder: { delete: jest.fn().mockResolvedValue({}) },
        orderAsSession: { deleteMany: jest.fn().mockResolvedValue({}) },
        outbox: { writeEvent: jest.fn().mockResolvedValue({}) },
        user: { findUnique: jest.fn().mockResolvedValue({ firstName: 'Jane', lastName: 'Doe' }) },
      }),
    );

    await service.submitOrder({ distributorSlug: 'dist' }, USER_ID, CUSTOMER_ID);

    expect(capturedData?.currency).toBe('GBP');
  });

  it('throws ForbiddenException without loading the cart when there is no trade relationship at all', async () => {
    (prisma.organisation.findFirst as jest.Mock).mockResolvedValue(makeDistributor());
    (prisma.tradeRelationship.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      service.submitOrder({ distributorSlug: 'dist' }, USER_ID, CUSTOMER_ID),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.cartOrder.findUnique).not.toHaveBeenCalled();
  });

  it.each(['SUSPENDED', 'PENDING_REQUEST', 'PENDING_INVITE', 'INACTIVE'])(
    'throws ForbiddenException without loading the cart when the relationship is %s',
    async (status) => {
      (prisma.organisation.findFirst as jest.Mock).mockResolvedValue(makeDistributor());
      (prisma.tradeRelationship.findFirst as jest.Mock).mockResolvedValue(makeRelationship({ status }));

      await expect(
        service.submitOrder({ distributorSlug: 'dist' }, USER_ID, CUSTOMER_ID),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.cartOrder.findUnique).not.toHaveBeenCalled();
    },
  );

  it('succeeds when the relationship is ACTIVE', async () => {
    setupHappyPath();
    await expect(
      service.submitOrder({ distributorSlug: 'dist' }, USER_ID, CUSTOMER_ID),
    ).resolves.toBeDefined();
  });

  it('writes an OrderSubmitted event with tenant, placing user and acceptance context', async () => {
    setupHappyPath();
    await service.submitOrder({ distributorSlug: 'dist' }, USER_ID, CUSTOMER_ID);

    expect(outbox.writeEvent).toHaveBeenCalledWith(
      expect.anything(),
      'Order',
      'order-1',
      'OrderSubmitted',
      expect.objectContaining({
        orderId: 'order-1',
        distributorId: DISTRIBUTOR_ID,
        tenantId: DISTRIBUTOR_ID,
        traderCustomerId: CUSTOMER_ID,
        placedByUserId: USER_ID,
        isOrderedByDelegate: false,
        acceptanceModeSnapshot: OrderAcceptanceMode.MANUAL,
        orderNumber: expect.stringMatching(/^ORD-\d{4}-\d{5}$/),
      }),
    );
  });

  // The distributor's order-placed email needs these to show a useful
  // summary (total, currency, item count) without an extra query —
  // snapshotted onto the event at zero extra cost since newOrder/lines are
  // already in scope at this exact point (see orders.service.ts submit()).
  it('snapshots order total, currency and item count onto the OrderSubmitted event', async () => {
    setupHappyPath();
    await service.submitOrder({ distributorSlug: 'dist' }, USER_ID, CUSTOMER_ID);

    expect(outbox.writeEvent).toHaveBeenCalledWith(
      expect.anything(),
      'Order',
      'order-1',
      'OrderSubmitted',
      expect.objectContaining({
        totalAmount: '20.00',
        currency: 'GBP',
        lineItemCount: 1,
        requestedDeliveryDate: null,
        customerReference: null,
        orderLines: [{ productName: 'Wine', sku: 'SKU-1', quantity: 2, lineTotal: '24.46' }],
      }),
    );
  });

  it('flags isOrderedByDelegate in the OrderSubmitted event for order-as submissions', async () => {
    setupHappyPath();
    await service.submitOrder({ distributorSlug: 'dist' }, USER_ID, CUSTOMER_ID, 'session-token-1', DISTRIBUTOR_ID);

    expect(outbox.writeEvent).toHaveBeenCalledWith(
      expect.anything(),
      'Order',
      'order-1',
      'OrderSubmitted',
      expect.objectContaining({ isOrderedByDelegate: true }),
    );
  });
});

describe('OrdersService — minimum order spend enforcement', () => {
  let service: OrdersService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      organisation: { findFirst: jest.fn() },
      cartOrder: { findUnique: jest.fn(), delete: jest.fn() },
      distributorSettings: { findUnique: jest.fn() },
      tradeRelationship: { findFirst: jest.fn() },
      order: { create: jest.fn() },
      orderLine: { createMany: jest.fn() },
      cartOrderLine: { deleteMany: jest.fn() },
      assetImage: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OutboxService, useValue: { writeEvent: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: DeliveryAvailabilityService, useValue: { getAvailableDates: jest.fn() } },
        { provide: R2StorageService, useValue: { getPublicUrl: jest.fn((k: string) => `https://cdn.test/${k}`) } },
      ],
    }).compile();

    service = module.get(OrdersService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
  });

  function setupHappyPath() {
    (prisma.organisation.findFirst as jest.Mock).mockResolvedValue(makeDistributor());
    (prisma.cartOrder.findUnique as jest.Mock).mockResolvedValue(makeCart());
    (prisma.distributorSettings.findUnique as jest.Mock).mockResolvedValue({
      defaultOrderAcceptanceMode: OrderAcceptanceMode.MANUAL,
    });
    (prisma.tradeRelationship.findFirst as jest.Mock).mockResolvedValue(makeRelationship());
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ nextval: BigInt(1) }]);
    (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        order: { create: jest.fn().mockResolvedValue({ id: 'order-1', orderNumber: 'ORD-2024-00001', distributorId: DISTRIBUTOR_ID, traderCustomerId: CUSTOMER_ID, placedByUserId: USER_ID, status: OrderStatus.SUBMITTED, currency: 'GBP', subtotalAmount: { toFixed: () => '24.46' }, taxAmount: { toFixed: () => '0.00' }, totalAmount: { toFixed: () => '24.46' }, billingAddressSnapshot: null, deliveryAddressSnapshot: null, requestedDeliveryDate: null, customerReference: null, notes: null, acceptanceModeSnapshot: OrderAcceptanceMode.MANUAL, acceptanceModeSourceSnapshot: AcceptanceModeSource.DISTRIBUTOR_DEFAULT, submittedAt: new Date(), acceptedAt: null, acceptedByActorType: null, acceptedByUserId: null, rejectedAt: null, rejectedByUserId: null, rejectionReason: null, cancelledAt: null, cancelledByUserId: null, cancellationReason: null, createdAt: new Date(), updatedAt: new Date(), customer: { id: CUSTOMER_ID, name: 'Test Customer' }, invoiceExports: [], lines: [] }) },
        orderLine: { createMany: jest.fn().mockResolvedValue({}) },
        cartOrderLine: { deleteMany: jest.fn().mockResolvedValue({}) },
        cartOrder: { delete: jest.fn().mockResolvedValue({}) },
        orderAsSession: { deleteMany: jest.fn().mockResolvedValue({}) },
        outbox: { writeEvent: jest.fn().mockResolvedValue({}) },
        user: { findUnique: jest.fn().mockResolvedValue({ firstName: 'Jane', lastName: 'Doe' }) },
      }),
    );
  }

  // makeCart()'s default single line is quantity 2 @ unitPrice 12.23 => subtotal 24.46.

  it('throws UnprocessableEntityException and does not open a transaction when subtotal is below the relationship-level minimum', async () => {
    setupHappyPath();
    (prisma.tradeRelationship.findFirst as jest.Mock).mockResolvedValue(
      makeRelationship({ minimumOrderSpend: new Prisma.Decimal('30.00') }),
    );

    await expect(
      service.submitOrder({ distributorSlug: 'dist' }, USER_ID, CUSTOMER_ID),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws when subtotal is below the distributor-level default minimum (no relationship override)', async () => {
    setupHappyPath();
    (prisma.organisation.findFirst as jest.Mock).mockResolvedValue(
      makeDistributor({ distributorSettings: { minimumOrderSpend: new Prisma.Decimal('30.00') } }),
    );

    await expect(
      service.submitOrder({ distributorSlug: 'dist' }, USER_ID, CUSTOMER_ID),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('uses the relationship override over the distributor default when both are set', async () => {
    setupHappyPath();
    (prisma.organisation.findFirst as jest.Mock).mockResolvedValue(
      makeDistributor({ distributorSettings: { minimumOrderSpend: new Prisma.Decimal('30.00') } }), // would fail
    );
    (prisma.tradeRelationship.findFirst as jest.Mock).mockResolvedValue(
      makeRelationship({ minimumOrderSpend: new Prisma.Decimal('10.00') }), // would pass
    );

    await expect(
      service.submitOrder({ distributorSlug: 'dist' }, USER_ID, CUSTOMER_ID),
    ).resolves.toBeDefined();
  });

  it('succeeds when subtotal exactly equals the minimum (met, not below)', async () => {
    setupHappyPath();
    (prisma.tradeRelationship.findFirst as jest.Mock).mockResolvedValue(
      makeRelationship({ minimumOrderSpend: new Prisma.Decimal('24.46') }),
    );

    await expect(
      service.submitOrder({ distributorSlug: 'dist' }, USER_ID, CUSTOMER_ID),
    ).resolves.toBeDefined();
  });

  it('does not enforce a minimum when neither relationship nor distributor has one set', async () => {
    setupHappyPath();

    await expect(
      service.submitOrder({ distributorSlug: 'dist' }, USER_ID, CUSTOMER_ID),
    ).resolves.toBeDefined();
  });
});

describe('OrdersService — tax calculation', () => {
  let service: OrdersService;
  let prisma: jest.Mocked<PrismaService>;
  let orderCreateData: any;
  let orderLineCreateManyData: any;

  beforeEach(async () => {
    orderCreateData = undefined;
    orderLineCreateManyData = undefined;

    const mockPrisma = {
      organisation: { findFirst: jest.fn() },
      cartOrder: { findUnique: jest.fn(), delete: jest.fn() },
      distributorSettings: { findUnique: jest.fn() },
      tradeRelationship: { findFirst: jest.fn() },
      taxType: { findMany: jest.fn().mockResolvedValue([]) },
      order: { create: jest.fn() },
      orderLine: { createMany: jest.fn() },
      cartOrderLine: { deleteMany: jest.fn() },
      assetImage: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OutboxService, useValue: { writeEvent: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: DeliveryAvailabilityService, useValue: { getAvailableDates: jest.fn() } },
        { provide: R2StorageService, useValue: { getPublicUrl: jest.fn((k: string) => `https://cdn.test/${k}`) } },
      ],
    }).compile();

    service = module.get(OrdersService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;

    (prisma.organisation.findFirst as jest.Mock).mockResolvedValue(makeDistributor());
    (prisma.distributorSettings.findUnique as jest.Mock).mockResolvedValue({
      defaultOrderAcceptanceMode: OrderAcceptanceMode.MANUAL,
    });
    (prisma.tradeRelationship.findFirst as jest.Mock).mockResolvedValue(makeRelationship());
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ nextval: BigInt(1) }]);
    (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        order: {
          create: jest.fn().mockImplementation(({ data }: any) => {
            orderCreateData = data;
            return {
              id: 'order-1', orderNumber: 'ORD-2024-00001', distributorId: DISTRIBUTOR_ID,
              traderCustomerId: CUSTOMER_ID, placedByUserId: USER_ID, status: OrderStatus.SUBMITTED,
              currency: 'GBP', subtotalAmount: data.subtotalAmount, taxAmount: data.taxAmount, totalAmount: data.totalAmount,
              billingAddressSnapshot: null, deliveryAddressSnapshot: null, requestedDeliveryDate: null,
              customerReference: null, notes: null, acceptanceModeSnapshot: OrderAcceptanceMode.MANUAL,
              acceptanceModeSourceSnapshot: AcceptanceModeSource.DISTRIBUTOR_DEFAULT, submittedAt: new Date(),
              acceptedAt: null, acceptedByActorType: null, acceptedByUserId: null, rejectedAt: null,
              rejectedByUserId: null, rejectionReason: null, cancelledAt: null, cancelledByUserId: null,
              cancellationReason: null, createdAt: new Date(), updatedAt: new Date(),
              customer: { id: CUSTOMER_ID, name: 'Test Customer' }, invoiceExports: [], lines: [],
            };
          }),
        },
        orderLine: {
          createMany: jest.fn().mockImplementation(({ data }: any) => {
            orderLineCreateManyData = data;
            return {};
          }),
        },
        cartOrderLine: { deleteMany: jest.fn().mockResolvedValue({}) },
        cartOrder: { delete: jest.fn().mockResolvedValue({}) },
        orderAsSession: { deleteMany: jest.fn().mockResolvedValue({}) },
        outbox: { writeEvent: jest.fn().mockResolvedValue({}) },
        user: { findUnique: jest.fn().mockResolvedValue({ firstName: 'Jane', lastName: 'Doe' }) },
      }),
    );
  });

  it('computes net/tax/gross from the cart line\'s frozen rate (AC5: £10 x 2 @ 20%)', async () => {
    (prisma.cartOrder.findUnique as jest.Mock).mockResolvedValue(
      makeCart([{ quantity: 2, unitPrice: new Prisma.Decimal('10.00'), taxTypeId: 'tax-1', taxRateSnapshot: new Prisma.Decimal('20.00') }]),
    );
    (prisma.taxType.findMany as jest.Mock).mockResolvedValue([
      { id: 'tax-1', name: 'Standard rate', classification: 'STANDARD' },
    ]);

    await service.submitOrder({ distributorSlug: 'dist' }, USER_ID, CUSTOMER_ID);

    expect(orderLineCreateManyData[0].subtotalAmount.toFixed(2)).toBe('20.00');
    expect(orderLineCreateManyData[0].taxAmount.toFixed(2)).toBe('4.00');
    expect(orderLineCreateManyData[0].totalAmount.toFixed(2)).toBe('24.00');
    expect(orderLineCreateManyData[0].taxTypeId).toBe('tax-1');
    expect(orderLineCreateManyData[0].taxTypeNameSnapshot).toBe('Standard rate');
    expect(orderLineCreateManyData[0].taxClassificationSnapshot).toBe('STANDARD');
    expect(orderLineCreateManyData[0].taxRatePercentageSnapshot.toFixed(2)).toBe('20.00');
    expect(orderCreateData.taxAmount.toFixed(2)).toBe('4.00');
  });

  it('uses the frozen cart-line rate rather than re-resolving from the current TaxType row', async () => {
    (prisma.cartOrder.findUnique as jest.Mock).mockResolvedValue(
      makeCart([{ quantity: 1, unitPrice: new Prisma.Decimal('10.00'), taxTypeId: 'tax-1', taxRateSnapshot: new Prisma.Decimal('20.00') }]),
    );
    // TaxType now says 5% — if the rate were re-resolved here this would leak in.
    (prisma.taxType.findMany as jest.Mock).mockResolvedValue([
      { id: 'tax-1', name: 'Standard rate', classification: 'STANDARD', ratePercentage: new Prisma.Decimal('5.00') },
    ]);

    await service.submitOrder({ distributorSlug: 'dist' }, USER_ID, CUSTOMER_ID);

    expect(orderLineCreateManyData[0].taxAmount.toFixed(2)).toBe('2.00'); // 20% of £10, not 5%
  });

  it('produces £0 tax for a zero-rated line while the classification is still snapshotted (AC6)', async () => {
    (prisma.cartOrder.findUnique as jest.Mock).mockResolvedValue(
      makeCart([{ quantity: 1, unitPrice: new Prisma.Decimal('10.00'), taxTypeId: 'tax-zero', taxRateSnapshot: new Prisma.Decimal('0.00') }]),
    );
    (prisma.taxType.findMany as jest.Mock).mockResolvedValue([
      { id: 'tax-zero', name: 'Zero-rated', classification: 'ZERO_RATED' },
    ]);

    await service.submitOrder({ distributorSlug: 'dist' }, USER_ID, CUSTOMER_ID);

    expect(orderLineCreateManyData[0].taxAmount.toFixed(2)).toBe('0.00');
    expect(orderLineCreateManyData[0].taxClassificationSnapshot).toBe('ZERO_RATED');
    expect(orderLineCreateManyData[0].taxTypeNameSnapshot).toBe('Zero-rated');
  });

  it('sums per-line tax amounts into the order-level taxAmount across multiple lines', async () => {
    (prisma.cartOrder.findUnique as jest.Mock).mockResolvedValue(
      makeCart([
        { id: 'line-1', productId: 'prod-1', quantity: 2, unitPrice: new Prisma.Decimal('10.00'), taxTypeId: 'tax-1', taxRateSnapshot: new Prisma.Decimal('20.00') },
        { id: 'line-2', productId: 'prod-2', quantity: 1, unitPrice: new Prisma.Decimal('5.00'), taxTypeId: 'tax-1', taxRateSnapshot: new Prisma.Decimal('20.00') },
      ]),
    );
    (prisma.taxType.findMany as jest.Mock).mockResolvedValue([
      { id: 'tax-1', name: 'Standard rate', classification: 'STANDARD' },
    ]);

    await service.submitOrder({ distributorSlug: 'dist' }, USER_ID, CUSTOMER_ID);

    // line-1: £20 net @ 20% = £4 tax; line-2: £5 net @ 20% = £1 tax -> order total £5
    expect(orderCreateData.taxAmount.toFixed(2)).toBe('5.00');
    expect(orderCreateData.subtotalAmount.toFixed(2)).toBe('25.00');
    expect(orderCreateData.totalAmount.toFixed(2)).toBe('30.00');
  });

  it('does not query TaxType at all when no cart line has a taxTypeId', async () => {
    (prisma.cartOrder.findUnique as jest.Mock).mockResolvedValue(makeCart());

    await service.submitOrder({ distributorSlug: 'dist' }, USER_ID, CUSTOMER_ID);

    expect(prisma.taxType.findMany).not.toHaveBeenCalled();
    expect(orderLineCreateManyData[0].taxAmount.toFixed(2)).toBe('0.00');
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
      assetImage: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OutboxService, useValue: { writeEvent: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: DeliveryAvailabilityService, useValue: { getAvailableDates: jest.fn() } },
        { provide: R2StorageService, useValue: { getPublicUrl: jest.fn((k: string) => `https://cdn.test/${k}`) } },
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

  it('maps invoiceSummary and requestedDeliveryDate when an invoice export exists', async () => {
    (prisma.order.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'order-1', orderNumber: 'ORD-2024-00001', status: OrderStatus.ACCEPTED,
        totalAmount: { toFixed: () => '20.00' },
        submittedAt: new Date(), acceptedAt: new Date(), rejectedAt: null, cancelledAt: null,
        createdAt: new Date(), requestedDeliveryDate: new Date('2024-06-14T00:00:00.000Z'),
        customer: { id: CUSTOMER_ID, name: 'Test Customer' },
        invoiceExports: [{ status: 'COMPLETED', externalInvoiceStatus: 'AUTHORISED' }],
      },
    ]);

    const result = await service.listCustomerOrders(CUSTOMER_ID, {});

    expect(result.data[0].requestedDeliveryDate).toBe('2024-06-14');
    expect(result.data[0].invoiceSummary).toEqual({ status: 'COMPLETED', externalInvoiceStatus: 'AUTHORISED' });
  });

  it('maps invoiceSummary as null and requestedDeliveryDate as null when absent', async () => {
    (prisma.order.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'order-1', orderNumber: 'ORD-2024-00001', status: OrderStatus.SUBMITTED,
        totalAmount: { toFixed: () => '20.00' },
        submittedAt: new Date(), acceptedAt: null, rejectedAt: null, cancelledAt: null,
        createdAt: new Date(), requestedDeliveryDate: null,
        customer: { id: CUSTOMER_ID, name: 'Test Customer' },
        invoiceExports: [],
      },
    ]);

    const result = await service.listCustomerOrders(CUSTOMER_ID, {});

    expect(result.data[0].requestedDeliveryDate).toBeNull();
    expect(result.data[0].invoiceSummary).toBeNull();
  });
});

describe('OrdersService — getCustomerOrder', () => {
  let service: OrdersService;
  let prisma: jest.Mocked<PrismaService>;

  function makeOrderPayload(invoiceExports: unknown[], lines: unknown[] = []) {
    return {
      id: 'order-1', orderNumber: 'ORD-2024-00001', distributorId: DISTRIBUTOR_ID,
      traderCustomerId: CUSTOMER_ID, placedByUserId: USER_ID, status: OrderStatus.ACCEPTED,
      currency: 'GBP', subtotalAmount: { toFixed: () => '20.00' }, taxAmount: { toFixed: () => '0.00' },
      totalAmount: { toFixed: () => '20.00' }, billingAddressSnapshot: null, deliveryAddressSnapshot: null,
      requestedDeliveryDate: null, customerReference: null, notes: null,
      acceptanceModeSnapshot: OrderAcceptanceMode.MANUAL, acceptanceModeSourceSnapshot: AcceptanceModeSource.DISTRIBUTOR_DEFAULT,
      submittedAt: new Date(), acceptedAt: new Date(), acceptedByActorType: null, acceptedByUserId: null,
      rejectedAt: null, rejectedByUserId: null, rejectionReason: null,
      cancelledAt: null, cancelledByUserId: null, cancellationReason: null,
      createdAt: new Date(), updatedAt: new Date(),
      customer: { id: CUSTOMER_ID, name: 'Test Customer' },
      invoiceExports,
      lines,
    };
  }

  function makeLine(overrides: Partial<{ id: string; productId: string; taxTypeNameSnapshot: string | null }> = {}) {
    return {
      id: 'line-1', orderId: 'order-1', distributorId: DISTRIBUTOR_ID, traderCustomerId: CUSTOMER_ID,
      productId: 'prod-1', productVariantId: null, skuSnapshot: 'SKU-1', productNameSnapshot: 'Wine',
      unitOfMeasureSnapshot: null, quantityOrdered: 2, unitPriceSnapshot: { toFixed: () => '12.23' },
      taxTypeId: 'tax-1', taxTypeNameSnapshot: 'VAT', taxClassificationSnapshot: 'STANDARD',
      taxRateSnapshot: '0', subtotalAmount: { toFixed: () => '24.46' }, taxAmount: { toFixed: () => '0.00' },
      totalAmount: { toFixed: () => '24.46' }, priceListIdSnapshot: null, priceListRuleIdSnapshot: null,
      status: 'ACCEPTED', createdAt: new Date(), updatedAt: new Date(),
      ...overrides,
    };
  }

  let assetImageFindMany: jest.Mock;

  beforeEach(async () => {
    assetImageFindMany = jest.fn().mockResolvedValue([]);
    const mockPrisma = {
      order: { findFirst: jest.fn() },
      assetImage: { findMany: assetImageFindMany },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OutboxService, useValue: { writeEvent: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: DeliveryAvailabilityService, useValue: { getAvailableDates: jest.fn() } },
        { provide: R2StorageService, useValue: { getPublicUrl: jest.fn((k: string) => `https://cdn.test/${k}`) } },
      ],
    }).compile();

    service = module.get(OrdersService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
  });

  it('maps invoiceSummary from the latest invoice export', async () => {
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(
      makeOrderPayload([{ status: 'COMPLETED', externalInvoiceStatus: 'DRAFT' }]),
    );

    const result = await service.getCustomerOrder('order-1', CUSTOMER_ID);

    expect(result.invoiceSummary).toEqual({ status: 'COMPLETED', externalInvoiceStatus: 'DRAFT' });
  });

  it('maps invoiceSummary as null when no invoice export exists', async () => {
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(makeOrderPayload([]));

    const result = await service.getCustomerOrder('order-1', CUSTOMER_ID);

    expect(result.invoiceSummary).toBeNull();
  });

  it('throws NotFoundException when the order does not exist', async () => {
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(service.getCustomerOrder('missing', CUSTOMER_ID)).rejects.toThrow(NotFoundException);
  });

  it('maps productThumbnailUrl from the primary product image', async () => {
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(
      makeOrderPayload([], [makeLine({ productId: 'prod-1' })]),
    );
    assetImageFindMany.mockResolvedValue([
      { entityId: 'prod-1', variants: { thumb: 'distributors/d/products/prod-1/images/img-1/thumb.webp' } },
    ]);

    const result = await service.getCustomerOrder('order-1', CUSTOMER_ID);

    expect(assetImageFindMany).toHaveBeenCalledWith({
      where: { assetType: 'product-image', entityId: { in: ['prod-1'] }, distributorId: DISTRIBUTOR_ID, isPrimary: true },
      select: { entityId: true, variants: true },
    });
    expect(result.lines[0].productThumbnailUrl).toBe(
      'https://cdn.test/distributors/d/products/prod-1/images/img-1/thumb.webp',
    );
  });

  it('maps productThumbnailUrl as null when the product has no image', async () => {
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(
      makeOrderPayload([], [makeLine({ productId: 'prod-1' })]),
    );
    assetImageFindMany.mockResolvedValue([]);

    const result = await service.getCustomerOrder('order-1', CUSTOMER_ID);

    expect(result.lines[0].productThumbnailUrl).toBeNull();
  });

  it('does not query assetImage when the order has no lines', async () => {
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(makeOrderPayload([], []));

    await service.getCustomerOrder('order-1', CUSTOMER_ID);

    expect(assetImageFindMany).not.toHaveBeenCalled();
  });

  it('sets taxLabel to the real tax type name when every line shares one', async () => {
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(
      makeOrderPayload([], [makeLine({ id: 'line-1', taxTypeNameSnapshot: 'VAT' }), makeLine({ id: 'line-2', taxTypeNameSnapshot: 'VAT' })]),
    );

    const result = await service.getCustomerOrder('order-1', CUSTOMER_ID);

    expect(result.taxLabel).toBe('VAT');
  });

  it('falls back to the generic "Tax" label when lines have different tax type names', async () => {
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(
      makeOrderPayload([], [makeLine({ id: 'line-1', taxTypeNameSnapshot: 'VAT' }), makeLine({ id: 'line-2', taxTypeNameSnapshot: 'Zero-rated' })]),
    );

    const result = await service.getCustomerOrder('order-1', CUSTOMER_ID);

    expect(result.taxLabel).toBe('Tax');
  });

  it('falls back to the generic "Tax" label for an order with no lines', async () => {
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(makeOrderPayload([], []));

    const result = await service.getCustomerOrder('order-1', CUSTOMER_ID);

    expect(result.taxLabel).toBe('Tax');
  });
});

describe('OrdersService — cancelCustomerOrder', () => {
  let service: OrdersService;
  let prisma: { order: { findFirst: jest.Mock }; $transaction: jest.Mock };
  let outbox: { writeEvent: jest.Mock };
  let audit: { record: jest.Mock };
  let txUserFindUnique: jest.Mock;

  function makeOrder(overrides: Record<string, unknown> = {}) {
    return {
      id: 'order-1',
      status: OrderStatus.SUBMITTED,
      distributorId: DISTRIBUTOR_ID,
      traderCustomerId: CUSTOMER_ID,
      orderNumber: 'ORD-2024-00001',
      ...overrides,
    };
  }

  function makeFullOrder(overrides: Record<string, unknown> = {}) {
    return {
      id: 'order-1', orderNumber: 'ORD-2024-00001', distributorId: DISTRIBUTOR_ID,
      traderCustomerId: CUSTOMER_ID, placedByUserId: USER_ID, status: OrderStatus.CANCELLED,
      currency: 'GBP', subtotalAmount: { toFixed: () => '20.00' }, taxAmount: { toFixed: () => '0.00' },
      totalAmount: { toFixed: () => '20.00' }, billingAddressSnapshot: null, deliveryAddressSnapshot: null,
      requestedDeliveryDate: null, customerReference: null, notes: null,
      acceptanceModeSnapshot: OrderAcceptanceMode.MANUAL, acceptanceModeSourceSnapshot: AcceptanceModeSource.DISTRIBUTOR_DEFAULT,
      submittedAt: new Date(), acceptedAt: null, acceptedByActorType: null, acceptedByUserId: null,
      rejectedAt: null, rejectedByUserId: null, rejectionReason: null,
      cancelledAt: new Date(), cancelledByUserId: CUSTOMER_ID, cancellationReason: 'Changed mind',
      createdAt: new Date(), updatedAt: new Date(),
      customer: { id: CUSTOMER_ID, name: 'Test Customer' },
      invoiceExports: [],
      lines: [],
      ...overrides,
    };
  }

  beforeEach(async () => {
    prisma = {
      order: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    outbox = { writeEvent: jest.fn() };
    audit = { record: jest.fn() };
    txUserFindUnique = jest.fn().mockResolvedValue({ firstName: 'Jane', lastName: 'Doe' });

    (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        order: { update: jest.fn().mockResolvedValue(makeFullOrder()) },
        orderLine: { updateMany: jest.fn().mockResolvedValue({}) },
        user: { findUnique: txUserFindUnique },
      }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: OutboxService, useValue: outbox },
        { provide: AuditService, useValue: audit },
        { provide: DeliveryAvailabilityService, useValue: { getAvailableDates: jest.fn() } },
        { provide: R2StorageService, useValue: { getPublicUrl: jest.fn((k: string) => `https://cdn.test/${k}`) } },
      ],
    }).compile();

    service = module.get(OrdersService);
  });

  it('cancels a submitted order, attributing the audit entry to the acting user (not placedByUserId)', async () => {
    prisma.order.findFirst.mockResolvedValue(makeOrder());

    const result = await service.cancelCustomerOrder('order-1', CUSTOMER_ID, 'Changed mind', 'acting-user-1');

    expect(result.status).toBe(OrderStatus.CANCELLED);
    expect(outbox.writeEvent).toHaveBeenCalledWith(
      expect.anything(), 'Order', 'order-1', 'OrderCancelled', expect.any(Object),
    );
    expect(txUserFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'acting-user-1' } }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: 'ORDER',
        entityId: 'order-1',
        action: 'ORDER_CANCELLED',
        actorType: ActorType.USER,
        actorUserId: 'acting-user-1',
        actorName: 'Jane Doe',
        changes: { reason: 'Changed mind' },
      }),
    );
  });

  it('throws NotFoundException when the order does not belong to the customer', async () => {
    prisma.order.findFirst.mockResolvedValue(null);
    await expect(
      service.cancelCustomerOrder('order-1', CUSTOMER_ID, 'reason', 'acting-user-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws UnprocessableEntityException when the order is not SUBMITTED', async () => {
    prisma.order.findFirst.mockResolvedValue(makeOrder({ status: OrderStatus.ACCEPTED }));
    await expect(
      service.cancelCustomerOrder('order-1', CUSTOMER_ID, 'reason', 'acting-user-1'),
    ).rejects.toThrow(UnprocessableEntityException);
  });
});
