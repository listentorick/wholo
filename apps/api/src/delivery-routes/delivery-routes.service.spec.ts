import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DeliveryRoutesService } from './delivery-routes.service';
import { PrismaService } from '../prisma/prisma.service';

const NOW = new Date('2026-08-19T10:00:00.000Z');

function makeRoute(overrides: Record<string, unknown> = {}) {
  return {
    id: 'route-1',
    distributorId: 'dist-1',
    name: 'Yorkshire',
    code: 'YKS',
    defaultDriverName: 'Dave Walsh',
    active: true,
    customers: [],
    _count: { customers: 0 },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeRouteCustomer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rc-1',
    routeId: 'route-1',
    customerId: 'cust-1',
    defaultDropPosition: 1,
    assignedAt: NOW,
    assignedByUserId: 'user-1',
    removedAt: null,
    removedByUserId: null,
    customer: { id: 'cust-1', name: 'Blackbird Kitchen', addressLine1: '23 The Calls', addressCity: 'Leeds', addressPostcode: 'LS1 1AA' },
    ...overrides,
  };
}

describe('DeliveryRoutesService', () => {
  let service: DeliveryRoutesService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      deliveryRoute: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      deliveryRouteCustomer: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        aggregate: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryRoutesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(DeliveryRoutesService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
  });

  describe('findAll', () => {
    it('passes active: false through to the where clause (not the ?active=false Boolean() coercion bug)', async () => {
      (prisma.deliveryRoute.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.deliveryRoute.count as jest.Mock).mockResolvedValue(0);

      await service.findAll('dist-1', { active: false });

      expect(prisma.deliveryRoute.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [expect.objectContaining({ active: false }), {}] },
        }),
      );
      expect(prisma.deliveryRoute.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ active: false }),
      });
    });
  });

  describe('findOne', () => {
    it('returns a formatted route with ordered customers', async () => {
      (prisma.deliveryRoute.findFirst as jest.Mock).mockResolvedValue(
        makeRoute({ customers: [makeRouteCustomer()] }),
      );
      const result = await service.findOne('route-1', 'dist-1');
      expect(result.id).toBe('route-1');
      expect(result.customers).toHaveLength(1);
      expect(result.customers[0].customerName).toBe('Blackbird Kitchen');
    });

    it('throws NotFoundException when route not found', async () => {
      (prisma.deliveryRoute.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(service.findOne('bad-id', 'dist-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates a route defaulting active to true', async () => {
      (prisma.deliveryRoute.create as jest.Mock).mockResolvedValue(makeRoute());
      const result = await service.create('dist-1', { name: 'Yorkshire' });
      expect(result.name).toBe('Yorkshire');
      expect(result.active).toBe(true);
      expect(result.customers).toEqual([]);
    });
  });

  describe('remove', () => {
    it('soft-deletes by setting active to false', async () => {
      (prisma.deliveryRoute.findUnique as jest.Mock).mockResolvedValue({ distributorId: 'dist-1' });
      (prisma.deliveryRoute.update as jest.Mock).mockResolvedValue({});
      await service.remove('route-1', 'dist-1');
      expect(prisma.deliveryRoute.update).toHaveBeenCalledWith({
        where: { id: 'route-1' },
        data: { active: false },
      });
    });

    it('throws NotFoundException when route belongs to a different distributor', async () => {
      (prisma.deliveryRoute.findUnique as jest.Mock).mockResolvedValue({ distributorId: 'dist-2' });
      await expect(service.remove('route-1', 'dist-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('assignCustomer', () => {
    it('assigns a customer at the next drop position', async () => {
      (prisma.deliveryRoute.findUnique as jest.Mock).mockResolvedValue({ distributorId: 'dist-1' });
      (prisma.deliveryRouteCustomer.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.deliveryRouteCustomer.aggregate as jest.Mock).mockResolvedValue({ _max: { defaultDropPosition: 2 } });
      (prisma.deliveryRouteCustomer.create as jest.Mock).mockResolvedValue(
        makeRouteCustomer({ defaultDropPosition: 3 }),
      );

      const result = await service.assignCustomer('route-1', 'dist-1', { customerId: 'cust-1' }, 'user-1');

      expect(result.defaultDropPosition).toBe(3);
      expect(prisma.deliveryRouteCustomer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ routeId: 'route-1', customerId: 'cust-1', defaultDropPosition: 3, assignedByUserId: 'user-1' }),
        }),
      );
    });

    it('throws BadRequestException when the customer already has an active route (pre-check)', async () => {
      (prisma.deliveryRoute.findUnique as jest.Mock).mockResolvedValue({ distributorId: 'dist-1' });
      (prisma.deliveryRouteCustomer.findFirst as jest.Mock).mockResolvedValue({ id: 'existing' });

      await expect(
        service.assignCustomer('route-1', 'dist-1', { customerId: 'cust-1' }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.deliveryRouteCustomer.create).not.toHaveBeenCalled();
    });

    it('translates a P2002 unique-constraint race into BadRequestException', async () => {
      (prisma.deliveryRoute.findUnique as jest.Mock).mockResolvedValue({ distributorId: 'dist-1' });
      (prisma.deliveryRouteCustomer.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.deliveryRouteCustomer.aggregate as jest.Mock).mockResolvedValue({ _max: { defaultDropPosition: null } });
      (prisma.deliveryRouteCustomer.create as jest.Mock).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '6.0.0' }),
      );

      await expect(
        service.assignCustomer('route-1', 'dist-1', { customerId: 'cust-1' }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeCustomer', () => {
    it('soft-ends the active assignment', async () => {
      (prisma.deliveryRoute.findUnique as jest.Mock).mockResolvedValue({ distributorId: 'dist-1' });
      (prisma.deliveryRouteCustomer.findFirst as jest.Mock).mockResolvedValue({ id: 'rc-1' });
      (prisma.deliveryRouteCustomer.update as jest.Mock).mockResolvedValue({});

      await service.removeCustomer('route-1', 'cust-1', 'dist-1', 'user-1');

      expect(prisma.deliveryRouteCustomer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rc-1' },
          data: expect.objectContaining({ removedByUserId: 'user-1' }),
        }),
      );
    });

    it('throws NotFoundException when there is no active assignment for that customer', async () => {
      (prisma.deliveryRoute.findUnique as jest.Mock).mockResolvedValue({ distributorId: 'dist-1' });
      (prisma.deliveryRouteCustomer.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.removeCustomer('route-1', 'cust-1', 'dist-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('reorderCustomers', () => {
    it('rejects a reorder that omits an active customer', async () => {
      (prisma.deliveryRoute.findUnique as jest.Mock).mockResolvedValue({ distributorId: 'dist-1' });
      (prisma.deliveryRouteCustomer.findMany as jest.Mock).mockResolvedValue([
        { id: 'rc-1', customerId: 'cust-1' },
        { id: 'rc-2', customerId: 'cust-2' },
      ]);

      await expect(
        service.reorderCustomers('route-1', 'dist-1', { orderedCustomerIds: ['cust-1'] }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('persists new positions in the given order', async () => {
      (prisma.deliveryRoute.findUnique as jest.Mock).mockResolvedValue({ distributorId: 'dist-1' });
      (prisma.deliveryRouteCustomer.findMany as jest.Mock)
        .mockResolvedValueOnce([
          { id: 'rc-1', customerId: 'cust-1' },
          { id: 'rc-2', customerId: 'cust-2' },
        ])
        .mockResolvedValueOnce([
          makeRouteCustomer({ id: 'rc-2', customerId: 'cust-2', defaultDropPosition: 1 }),
          makeRouteCustomer({ id: 'rc-1', customerId: 'cust-1', defaultDropPosition: 2 }),
        ]);
      (prisma.deliveryRouteCustomer.update as jest.Mock).mockReturnValue({});
      (prisma.$transaction as jest.Mock).mockResolvedValue([{}, {}]);

      const result = await service.reorderCustomers('route-1', 'dist-1', { orderedCustomerIds: ['cust-2', 'cust-1'] });

      expect(prisma.$transaction).toHaveBeenCalledWith([
        expect.objectContaining({}),
        expect.objectContaining({}),
      ]);
      expect(result[0].customerId).toBe('cust-2');
      expect(result[0].defaultDropPosition).toBe(1);
    });
  });
});
