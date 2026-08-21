import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DeliveryRunStatus } from '@prisma/client';
import { ManifestDataService, deriveRunReference, parseAddress } from './manifest-data.service';
import { PrismaService } from '../../prisma/prisma.service';

const DELIVERY_DATE = new Date('2026-08-26T00:00:00.000Z');

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderNumber: '10428',
    deliveryAddressSnapshot: {
      line1: '8 High Street', line2: null, city: 'Halifax', state: null, postcode: 'HX1 2AB', country: 'GB',
    },
    customerReference: 'PO-5571',
    notes: 'Use the rear entrance.',
    customer: { name: 'The Old Hall' },
    lines: [{ id: 'line-1', productNameSnapshot: 'Rioja Crianza', quantityOrdered: 3 }],
    ...overrides,
  };
}

function makeRunOrder(order: ReturnType<typeof makeOrder>, overrides: Record<string, unknown> = {}) {
  return { id: `dro-${order.id}`, order, ...overrides };
}

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-abc123',
    distributorId: 'dist-1',
    deliveryDate: DELIVERY_DATE,
    name: 'Yorkshire Wednesday',
    driverName: 'Alex Turner',
    status: DeliveryRunStatus.READY,
    orders: [],
    ...overrides,
  };
}

describe('ManifestDataService', () => {
  let service: ManifestDataService;
  let prisma: { deliveryRun: { findFirst: jest.Mock }; organisation: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      deliveryRun: { findFirst: jest.fn() },
      organisation: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ManifestDataService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ManifestDataService);
  });

  it('throws NotFoundException when the run does not exist or is not owned by the distributor', async () => {
    prisma.deliveryRun.findFirst.mockResolvedValue(null);
    await expect(service.getManifestData('dist-1', 'run-x')).rejects.toThrow(NotFoundException);
  });

  it('throws UnprocessableEntityException when the run is not Ready', async () => {
    prisma.deliveryRun.findFirst.mockResolvedValue(makeRun({ status: DeliveryRunStatus.OPEN }));
    await expect(service.getManifestData('dist-1', 'run-abc123')).rejects.toThrow(UnprocessableEntityException);
  });

  it('throws UnprocessableEntityException when the run has no active orders', async () => {
    prisma.deliveryRun.findFirst.mockResolvedValue(makeRun({ orders: [] }));
    await expect(service.getManifestData('dist-1', 'run-abc123')).rejects.toThrow(UnprocessableEntityException);
  });

  it('assigns stop numbers by position, matching the board\'s one-order-per-stop convention', async () => {
    const orderA = makeOrder({ id: 'order-a', orderNumber: '10420' });
    const orderB = makeOrder({ id: 'order-b', orderNumber: '10428' });
    prisma.deliveryRun.findFirst.mockResolvedValue(makeRun({
      orders: [makeRunOrder(orderA), makeRunOrder(orderB)],
    }));
    prisma.organisation.findUnique.mockResolvedValue({ name: 'Blackbird Wines' });

    const result = await service.getManifestData('dist-1', 'run-abc123');

    expect(result.orders).toHaveLength(2);
    expect(result.orders[0]).toMatchObject({ orderId: 'order-a', stopNumber: 1 });
    expect(result.orders[1]).toMatchObject({ orderId: 'order-b', stopNumber: 2 });
  });

  it('maps order fields (delivery instructions from notes, address, lines) into the manifest shape', async () => {
    const order = makeOrder();
    prisma.deliveryRun.findFirst.mockResolvedValue(makeRun({ orders: [makeRunOrder(order)] }));
    prisma.organisation.findUnique.mockResolvedValue({ name: 'Blackbird Wines' });

    const result = await service.getManifestData('dist-1', 'run-abc123');

    expect(result.distributorName).toBe('Blackbird Wines');
    expect(result.driverName).toBe('Alex Turner');
    expect(result.orders[0]).toMatchObject({
      orderNumber: '10428',
      customerName: 'The Old Hall',
      deliveryInstructions: 'Use the rear entrance.',
      customerReference: 'PO-5571',
      address: { line1: '8 High Street', city: 'Halifax', postcode: 'HX1 2AB' },
      lines: [{ productName: 'Rioja Crianza', quantity: 3 }],
    });
  });

  it('falls back to an empty distributor name when the organisation record is missing', async () => {
    prisma.deliveryRun.findFirst.mockResolvedValue(makeRun({ orders: [makeRunOrder(makeOrder())] }));
    prisma.organisation.findUnique.mockResolvedValue(null);

    const result = await service.getManifestData('dist-1', 'run-abc123');

    expect(result.distributorName).toBe('');
  });
});

describe('deriveRunReference', () => {
  it('combines the delivery date and the last 6 characters of the run id, uppercased', () => {
    expect(deriveRunReference('run-abc123xyz', DELIVERY_DATE)).toBe('RUN-2026-08-26-123XYZ');
  });
});

describe('parseAddress', () => {
  it('returns all-null fields for a null snapshot', () => {
    expect(parseAddress(null)).toEqual({
      line1: null, line2: null, city: null, state: null, postcode: null, country: null,
    });
  });

  it('returns all-null fields for a non-object snapshot', () => {
    expect(parseAddress('not-an-address' as never)).toEqual({
      line1: null, line2: null, city: null, state: null, postcode: null, country: null,
    });
  });

  it('extracts only the known string fields, ignoring unexpected shapes', () => {
    expect(parseAddress({ line1: '1 Main St', city: 'Leeds', postcode: 'LS1', extra: 123 } as never)).toEqual({
      line1: '1 Main St', line2: null, city: 'Leeds', state: null, postcode: 'LS1', country: null,
    });
  });
});
