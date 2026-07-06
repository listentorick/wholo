import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
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
    minimumOrderSpend: '100.00',
    paymentTerms: 'NET 30',
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
  };

  beforeEach(async () => {
    const mockPrisma = {
      organisation: { findFirst: jest.fn() },
      tradeRelationship: { findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CustomersService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get(CustomersService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
  });

  it('returns the customer record with trade information', async () => {
    (prisma.organisation.findFirst as jest.Mock).mockResolvedValue({ id: 'dist-1' });
    (prisma.tradeRelationship.findFirst as jest.Mock).mockResolvedValue(relRow);

    const result = await service.getSelfView('dist-1', 'cust-1');

    expect(result).toMatchObject({
      id: 'rel-1',
      organisationId: 'cust-1',
      distributorId: 'dist-1',
      status: 'ACTIVE',
      accountNumber: 'ACC-42',
      paymentTerms: 'NET 30',
      deliveryLine1: '1 Wine Lane',
      deliveryCity: 'Melbourne',
      billingLine1: '3 Bill Rd',
      organisation: { id: 'cust-1', name: 'The Bistro' },
    });
  });

  it('never exposes the distributor working data on the self view', async () => {
    (prisma.organisation.findFirst as jest.Mock).mockResolvedValue({ id: 'dist-1' });
    (prisma.tradeRelationship.findFirst as jest.Mock).mockResolvedValue(relRow);

    const result = await service.getSelfView('dist-1', 'cust-1');

    expect(result).not.toHaveProperty('notes');
    expect(result).not.toHaveProperty('creditLimit');
    expect(result).not.toHaveProperty('priceListId');
    expect(result).not.toHaveProperty('priceList');
    expect(result).not.toHaveProperty('deliveryProfileId');
    expect(result).not.toHaveProperty('deliveryProfile');
    expect(result).not.toHaveProperty('catalogues');
    expect(result).not.toHaveProperty('invitations');
  });

  it('throws NotFoundException when the distributor does not exist', async () => {
    (prisma.organisation.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(service.getSelfView('nope', 'cust-1')).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when no trade relationship exists', async () => {
    (prisma.organisation.findFirst as jest.Mock).mockResolvedValue({ id: 'dist-1' });
    (prisma.tradeRelationship.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(service.getSelfView('dist-1', 'cust-1')).rejects.toThrow(NotFoundException);
  });
});
