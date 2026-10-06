import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';

describe('CustomersService', () => {
  let service: CustomersService;
  let prisma: jest.Mocked<PrismaService>;
  let outbox: { writeEvent: jest.Mock };

  const relRow = {
    id: 'rel-1',
    distributorId: 'dist-1',
    customerId: 'cust-1',
    status: 'ACTIVE',
    accountNumber: 'ACC-42',
    creditLimit: '5000.00',
    minimumOrderSpend: '100.00',
    notes: 'VIP — always calls ahead',
    recentContactSelfDeclared: true,
    deliveryLine1: '1 Wine Lane',
    deliveryLine2: null,
    deliveryCity: 'Melbourne',
    deliveryState: 'VIC',
    deliveryPostcode: '3000',
    deliveryCountry: 'Australia',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    customer: {
      id: 'cust-1',
      name: 'The Bistro',
      legalName: 'Bistro Pty Ltd',
      email: 'orders@bistro.example',
      phone: '0400000000',
      addressLine1: '2 Cafe St',
      addressLine2: null,
      addressCity: 'Melbourne',
      addressState: 'VIC',
      addressPostcode: '3000',
      addressCountry: 'Australia',
      billingLine1: '3 Bill Rd',
      billingLine2: null,
      billingCity: 'Melbourne',
      billingState: 'VIC',
      billingPostcode: '3000',
      billingCountry: 'Australia',
    },
    traderCustomerSettings: {
      priceListId: 'pl-1',
      priceList: { id: 'pl-1', name: 'Trade' },
      deliveryProfileId: 'dp-1',
      deliveryProfile: { id: 'dp-1', name: 'Tuesdays' },
    },
    catalogues: [{ catalogue: { id: 'cat-1', name: 'Core range' } }],
    invitations: [{ id: 'inv-1', email: 'a@b.com', status: 'PENDING', expiresAt: new Date('2026-02-01'), createdAt: new Date('2026-01-01') }],
  };

  beforeEach(async () => {
    const mockPrisma = {
      organisation: { findFirst: jest.fn() },
      tradeRelationship: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    mockPrisma.$transaction.mockImplementation((fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma));
    outbox = { writeEvent: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OutboxService, useValue: outbox },
      ],
    }).compile();

    service = module.get(CustomersService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
  });

  describe('getCustomer', () => {
    it('returns the full customer record — same shape for staff and self, trimming is a BFF concern', async () => {
      (prisma.tradeRelationship.findFirst as jest.Mock).mockResolvedValue(relRow);

      const result = await service.getCustomer('dist-1', 'cust-1');

      expect(result).toMatchObject({
        id: 'rel-1',
        organisationId: 'cust-1',
        distributorId: 'dist-1',
        status: 'ACTIVE',
        accountNumber: 'ACC-42',
        creditLimit: '5000.00',
        notes: 'VIP — always calls ahead',
        recentContactSelfDeclared: true,
        deliveryLine1: '1 Wine Lane',
        deliveryCity: 'Melbourne',
        billingLine1: '3 Bill Rd',
        organisation: { id: 'cust-1', name: 'The Bistro' },
        priceListId: 'pl-1',
        priceList: { id: 'pl-1', name: 'Trade' },
        deliveryProfileId: 'dp-1',
        deliveryProfile: { id: 'dp-1', name: 'Tuesdays' },
        catalogues: [{ id: 'cat-1', name: 'Core range' }],
      });
      expect(result.invitations).toHaveLength(1);
      expect(prisma.tradeRelationship.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { distributorId: 'dist-1', customerId: 'cust-1', deletedAt: null } }),
      );
    });

    it('throws NotFoundException when no trade relationship exists', async () => {
      (prisma.tradeRelationship.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.getCustomer('dist-1', 'cust-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('requestAccess', () => {
    beforeEach(() => {
      (prisma.organisation.findFirst as jest.Mock).mockResolvedValue({ id: 'dist-1' });
      (prisma.tradeRelationship.findFirst as jest.Mock).mockResolvedValue(relRow);
    });

    it('throws NotFoundException when the distributor does not exist', async () => {
      (prisma.organisation.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(service.requestAccess('nope', 'cust-1', true)).rejects.toThrow(NotFoundException);
    });

    it('creates a PENDING_REQUEST relationship with the self-declared answer when none exists', async () => {
      (prisma.tradeRelationship.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.tradeRelationship.create as jest.Mock).mockResolvedValue({ id: 'rel-new', distributorId: 'dist-1', customerId: 'cust-1', status: 'PENDING_REQUEST' });

      await service.requestAccess('dist-1', 'cust-1', true);

      expect(prisma.tradeRelationship.create).toHaveBeenCalledWith({
        data: {
          distributorId: 'dist-1',
          customerId: 'cust-1',
          status: 'PENDING_REQUEST',
          recentContactSelfDeclared: true,
        },
      });
      expect(prisma.tradeRelationship.update).not.toHaveBeenCalled();
    });

    it('records an access-requested event opening the relationship, carrying the self-declared answer', async () => {
      (prisma.tradeRelationship.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.tradeRelationship.create as jest.Mock).mockResolvedValue({ id: 'rel-new', distributorId: 'dist-1', customerId: 'cust-1', status: 'PENDING_REQUEST' });

      await service.requestAccess('dist-1', 'cust-1', true);

      expect(outbox.writeEvent).toHaveBeenCalledTimes(1);
      expect(outbox.writeEvent).toHaveBeenCalledWith(
        expect.anything(), 'TradeRelationship', 'rel-new', 'TradeRelationshipAccessRequested',
        expect.objectContaining({
          relationshipId: 'rel-new', distributorId: 'dist-1', customerId: 'cust-1',
          fromStatus: null, toStatus: 'PENDING_REQUEST', recentContactSelfDeclared: true,
        }),
      );
    });

    it('re-requesting flips an INACTIVE relationship back to PENDING_REQUEST, overwriting the prior answer', async () => {
      (prisma.tradeRelationship.findUnique as jest.Mock).mockResolvedValue({ id: 'rel-1', status: 'INACTIVE' });
      (prisma.tradeRelationship.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await service.requestAccess('dist-1', 'cust-1', false);

      expect(prisma.tradeRelationship.updateMany).toHaveBeenCalledWith({
        where: { id: 'rel-1', status: 'INACTIVE' },
        data: { status: 'PENDING_REQUEST', recentContactSelfDeclared: false },
      });
      expect(prisma.tradeRelationship.create).not.toHaveBeenCalled();
      // A re-request is its own event, so the earlier request and decline stay in the history.
      expect(outbox.writeEvent).toHaveBeenCalledWith(
        expect.anything(), 'TradeRelationship', 'rel-1', 'TradeRelationshipAccessRequested',
        expect.objectContaining({ fromStatus: 'INACTIVE', toStatus: 'PENDING_REQUEST' }),
      );
    });

    it('throws ConflictException and records nothing when the INACTIVE relationship changed underneath the re-request', async () => {
      (prisma.tradeRelationship.findUnique as jest.Mock).mockResolvedValue({ id: 'rel-1', status: 'INACTIVE' });
      (prisma.tradeRelationship.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(service.requestAccess('dist-1', 'cust-1', true)).rejects.toThrow(ConflictException);
      expect(outbox.writeEvent).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the relationship is SUSPENDED, with no customer-triggered reinstatement', async () => {
      (prisma.tradeRelationship.findUnique as jest.Mock).mockResolvedValue({ id: 'rel-1', status: 'SUSPENDED' });

      await expect(service.requestAccess('dist-1', 'cust-1', true)).rejects.toThrow(ForbiddenException);
      expect(prisma.tradeRelationship.create).not.toHaveBeenCalled();
      expect(prisma.tradeRelationship.updateMany).not.toHaveBeenCalled();
      expect(outbox.writeEvent).not.toHaveBeenCalled();
    });

    it.each(['ACTIVE', 'PENDING_INVITE', 'PENDING_REQUEST'])(
      'throws ConflictException when the relationship is already %s',
      async (status) => {
        (prisma.tradeRelationship.findUnique as jest.Mock).mockResolvedValue({ id: 'rel-1', status });

        await expect(service.requestAccess('dist-1', 'cust-1', true)).rejects.toThrow(ConflictException);
        expect(prisma.tradeRelationship.create).not.toHaveBeenCalled();
        expect(prisma.tradeRelationship.updateMany).not.toHaveBeenCalled();
        expect(outbox.writeEvent).not.toHaveBeenCalled();
      },
    );

    it('returns the full customer record after a successful request', async () => {
      (prisma.tradeRelationship.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.tradeRelationship.create as jest.Mock).mockResolvedValue({ id: 'rel-1', distributorId: 'dist-1', customerId: 'cust-1', status: 'PENDING_REQUEST' });

      const result = await service.requestAccess('dist-1', 'cust-1', true);

      expect(result).toMatchObject({ id: 'rel-1', status: 'ACTIVE' });
    });
  });
});
