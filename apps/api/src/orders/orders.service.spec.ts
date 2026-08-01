import { Test, TestingModule } from '@nestjs/testing';
import { UnprocessableEntityException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { CartOrderStatus, OrganisationType, OrderStatus, OrderAcceptanceMode, AcceptanceModeSource, Prisma } from '@prisma/client';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { DeliveryAvailabilityService } from '../delivery-availability/delivery-availability.service';
import { R2StorageService } from '../asset-images/r2-storage.service';

const DISTRIBUTOR_ID = 'dist-1';
const CUSTOMER_ID = 'cust-1';
const USER_ID = 'user-1';

function makeDistributor() {
  return { id: DISTRIBUTOR_ID };
}

function makeRelationship(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ACTIVE',
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
      productId: 'prod-1',
      quantity: 2,
      unitPrice: new Prisma.Decimal('12.23'),
      resolvedPriceListId: null,
      resolvedPriceListRuleId: null,
      product: { id: 'prod-1', name: 'Wine', sku: 'SKU-1', price: new Prisma.Decimal('12.23') },
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
    const mockDelivery = { getAvailableDates: jest.fn() };
    const mockR2Storage = { getPublicUrl: jest.fn((k: string) => `https://cdn.test/${k}`) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OutboxService, useValue: mockOutbox },
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

  function makeLine(overrides: Partial<{ id: string; productId: string }> = {}) {
    return {
      id: 'line-1', orderId: 'order-1', distributorId: DISTRIBUTOR_ID, traderCustomerId: CUSTOMER_ID,
      productId: 'prod-1', productVariantId: null, skuSnapshot: 'SKU-1', productNameSnapshot: 'Wine',
      unitOfMeasureSnapshot: null, quantityOrdered: 2, unitPriceSnapshot: { toFixed: () => '12.23' },
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
});
