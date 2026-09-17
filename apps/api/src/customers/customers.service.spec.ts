import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CustomersService', () => {
  let service: CustomersService;
  let prisma: jest.Mocked<PrismaService>;

  const relRow = {
    id: 'rel-1',
    distributorId: 'dist-1',
    customerId: 'cust-1',
    status: 'ACTIVE',
    accountNumber: 'ACC-42',
    creditLimit: '5000.00',
    minimumOrderSpend: '100.00',
    paymentTerms: 'NET 30',
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
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CustomersService, { provide: PrismaService, useValue: mockPrisma }],
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
        paymentTerms: 'NET 30',
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

    it('re-requesting flips an INACTIVE relationship back to PENDING_REQUEST, overwriting the prior answer', async () => {
      (prisma.tradeRelationship.findUnique as jest.Mock).mockResolvedValue({ id: 'rel-1', status: 'INACTIVE' });

      await service.requestAccess('dist-1', 'cust-1', false);

      expect(prisma.tradeRelationship.update).toHaveBeenCalledWith({
        where: { id: 'rel-1' },
        data: { status: 'PENDING_REQUEST', recentContactSelfDeclared: false },
      });
      expect(prisma.tradeRelationship.create).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the relationship is SUSPENDED, with no customer-triggered reinstatement', async () => {
      (prisma.tradeRelationship.findUnique as jest.Mock).mockResolvedValue({ id: 'rel-1', status: 'SUSPENDED' });

      await expect(service.requestAccess('dist-1', 'cust-1', true)).rejects.toThrow(ForbiddenException);
      expect(prisma.tradeRelationship.create).not.toHaveBeenCalled();
      expect(prisma.tradeRelationship.update).not.toHaveBeenCalled();
    });

    it.each(['ACTIVE', 'PENDING_INVITE', 'PENDING_REQUEST'])(
      'throws ConflictException when the relationship is already %s',
      async (status) => {
        (prisma.tradeRelationship.findUnique as jest.Mock).mockResolvedValue({ id: 'rel-1', status });

        await expect(service.requestAccess('dist-1', 'cust-1', true)).rejects.toThrow(ConflictException);
        expect(prisma.tradeRelationship.create).not.toHaveBeenCalled();
        expect(prisma.tradeRelationship.update).not.toHaveBeenCalled();
      },
    );

    it('returns the full customer record after a successful request', async () => {
      (prisma.tradeRelationship.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.requestAccess('dist-1', 'cust-1', true);

      expect(result).toMatchObject({ id: 'rel-1', status: 'ACTIVE' });
    });
  });
});
