import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { OrganisationType, TradeRelationshipStatus, InvitationStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { AdminCustomersService } from './admin-customers.service';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';

const mockPrisma = {
  tradeRelationship: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  organisation: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUniqueOrThrow: jest.fn().mockResolvedValue({ name: 'Acme Distributor' }),
    update: jest.fn(),
  },
  customerInvitation: {
    create: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockConfig = { get: jest.fn().mockReturnValue('http://portal.test') };
const mockOutbox = { writeEvent: jest.fn().mockResolvedValue({}) };

const makeOrg = (overrides = {}) => ({
  id: 'org-1',
  name: 'Acme',
  legalName: null,
  email: 'acme@example.com',
  phone: null,
  addressLine1: null,
  addressLine2: null,
  addressCity: null,
  addressState: null,
  addressPostcode: null,
  addressCountry: null,
  _count: { tradeRelationshipsAsCustomer: 0 },
  ...overrides,
});

const makeRel = (overrides = {}) => ({
  id: 'rel-1',
  customerId: 'org-1',
  distributorId: 'dist-1',
  status: TradeRelationshipStatus.ACTIVE,
  accountNumber: null,
  creditLimit: null,
  minimumOrderSpend: null,
  paymentTerms: null,
  notes: null,
  deliveryLine1: null, deliveryLine2: null, deliveryCity: null,
  deliveryState: null, deliveryPostcode: null, deliveryCountry: null,
  billingLine1: null, billingLine2: null, billingCity: null,
  billingState: null, billingPostcode: null, billingCountry: null,
  deletedAt: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  customer: makeOrg(),
  invitations: [],
  traderCustomerSettings: null,
  catalogues: [],
  ...overrides,
});

describe('AdminCustomersService', () => {
  let service: AdminCustomersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminCustomersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: OutboxService, useValue: mockOutbox },
      ],
    }).compile();
    service = module.get(AdminCustomersService);
  });

  // ── searchOrganisations ──────────────────────────────────────────────────────

  describe('searchOrganisations', () => {
    it('returns matching organisations', async () => {
      const orgs = [makeOrg(), makeOrg({ id: 'org-2', name: 'Acme Bar' })];
      mockPrisma.organisation.findMany.mockResolvedValue(orgs);

      const result = await service.searchOrganisations('dist-1', 'acme');

      expect(result).toHaveLength(2);
      expect(result[0].isExistingCustomer).toBe(false);
      expect(mockPrisma.organisation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: OrganisationType.TRADE_CUSTOMER,
            name: { contains: 'acme', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('marks org as existing customer when relationship exists', async () => {
      mockPrisma.organisation.findMany.mockResolvedValue([
        makeOrg({ _count: { tradeRelationshipsAsCustomer: 1 } }),
      ]);

      const [result] = await service.searchOrganisations('dist-1', 'acme');
      expect(result.isExistingCustomer).toBe(true);
    });

    it('respects limit', async () => {
      mockPrisma.organisation.findMany.mockResolvedValue([]);
      await service.searchOrganisations('dist-1', 'foo', 5);
      expect(mockPrisma.organisation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    });
  });

  // ── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated list', async () => {
      mockPrisma.tradeRelationship.findMany.mockResolvedValue([makeRel()]);
      mockPrisma.tradeRelationship.count.mockResolvedValue(1);

      const result = await service.findAll('dist-1', {});

      expect(result.data).toHaveLength(1);
      expect(result.pagination.hasMore).toBe(false);
    });

    it('throws BadRequestException for malformed cursor', async () => {
      mockPrisma.tradeRelationship.findMany.mockResolvedValue([]);
      mockPrisma.tradeRelationship.count.mockResolvedValue(0);

      await expect(service.findAll('dist-1', { cursor: '!!!invalid!!!' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('applies a single-value status filter as an IN clause', async () => {
      mockPrisma.tradeRelationship.findMany.mockResolvedValue([]);
      mockPrisma.tradeRelationship.count.mockResolvedValue(0);

      await service.findAll('dist-1', { status: [TradeRelationshipStatus.PENDING_INVITE] });

      expect(mockPrisma.tradeRelationship.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({ status: { in: [TradeRelationshipStatus.PENDING_INVITE] } }),
            ]),
          }),
        }),
      );
    });

    it('applies a multi-value status filter matching any of the given statuses', async () => {
      mockPrisma.tradeRelationship.findMany.mockResolvedValue([]);
      mockPrisma.tradeRelationship.count.mockResolvedValue(0);

      await service.findAll('dist-1', {
        status: [TradeRelationshipStatus.PENDING_INVITE, TradeRelationshipStatus.ACTIVE],
      });

      const call = mockPrisma.tradeRelationship.findMany.mock.calls[0][0];
      expect(call.where.AND[0].status).toEqual({
        in: [TradeRelationshipStatus.PENDING_INVITE, TradeRelationshipStatus.ACTIVE],
      });
    });

    it('applies a priceListId filter nested under traderCustomerSettings', async () => {
      mockPrisma.tradeRelationship.findMany.mockResolvedValue([]);
      mockPrisma.tradeRelationship.count.mockResolvedValue(0);

      await service.findAll('dist-1', { priceListId: ['pl-1'] });

      const call = mockPrisma.tradeRelationship.findMany.mock.calls[0][0];
      expect(call.where.AND[0].traderCustomerSettings).toEqual({ priceListId: { in: ['pl-1'] } });
    });

    it('merges priceListId and deliveryProfileId into a single traderCustomerSettings clause', async () => {
      mockPrisma.tradeRelationship.findMany.mockResolvedValue([]);
      mockPrisma.tradeRelationship.count.mockResolvedValue(0);

      await service.findAll('dist-1', { priceListId: ['pl-1'], deliveryProfileId: ['dp-1'] });

      const call = mockPrisma.tradeRelationship.findMany.mock.calls[0][0];
      // Both constraints must land in the same object — a naive flat-spread of two
      // separate `traderCustomerSettings` keys would let the second clobber the first.
      expect(call.where.AND[0].traderCustomerSettings).toEqual({
        priceListId: { in: ['pl-1'] },
        deliveryProfileId: { in: ['dp-1'] },
      });
    });

    it('applies a catalogueId filter as a some() relation filter', async () => {
      mockPrisma.tradeRelationship.findMany.mockResolvedValue([]);
      mockPrisma.tradeRelationship.count.mockResolvedValue(0);

      await service.findAll('dist-1', { catalogueId: ['cat-1', 'cat-2'] });

      const call = mockPrisma.tradeRelationship.findMany.mock.calls[0][0];
      expect(call.where.AND[0].catalogues).toEqual({ some: { catalogueId: { in: ['cat-1', 'cat-2'] } } });
    });

    it('adds no filter constraints when status/priceListId/deliveryProfileId/catalogueId are absent', async () => {
      mockPrisma.tradeRelationship.findMany.mockResolvedValue([]);
      mockPrisma.tradeRelationship.count.mockResolvedValue(0);

      await service.findAll('dist-1', {});

      const call = mockPrisma.tradeRelationship.findMany.mock.calls[0][0];
      expect(call.where.AND[0]).toEqual({ distributorId: 'dist-1', deletedAt: null });
    });
  });

  // ── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns formatted customer', async () => {
      mockPrisma.tradeRelationship.findFirst.mockResolvedValue(makeRel());

      const result = await service.findOne('rel-1', 'dist-1');
      expect(result.id).toBe('rel-1');
      expect(result.organisation.name).toBe('Acme');
    });

    it('throws NotFoundException for wrong distributor', async () => {
      mockPrisma.tradeRelationship.findFirst.mockResolvedValue(null);
      await expect(service.findOne('rel-1', 'dist-2')).rejects.toThrow(NotFoundException);
    });

    it('includes minimumOrderSpend in formatted customer', async () => {
      mockPrisma.tradeRelationship.findFirst.mockResolvedValue(
        makeRel({ minimumOrderSpend: { toString: () => '150.00', toJSON: () => '150.00' } }),
      );

      const result = await service.findOne('rel-1', 'dist-1');
      expect(result.minimumOrderSpend).not.toBeUndefined();
    });
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates org + relationship and returns invite URL when email present', async () => {
      const rel = makeRel({
        invitations: [{ id: 'inv-1', email: 'acme@example.com', status: InvitationStatus.PENDING, expiresAt: new Date(), token: 'tok' }],
      });
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        mockPrisma.organisation.create.mockResolvedValue({ id: 'org-1' });
        mockPrisma.tradeRelationship.create.mockResolvedValue({ id: 'rel-1' });
        mockPrisma.customerInvitation.create.mockResolvedValue({});
        mockPrisma.tradeRelationship.findUniqueOrThrow.mockResolvedValue(rel);
        return fn({
          organisation: { create: mockPrisma.organisation.create },
          tradeRelationship: { create: mockPrisma.tradeRelationship.create, findUniqueOrThrow: mockPrisma.tradeRelationship.findUniqueOrThrow },
          customerInvitation: { create: mockPrisma.customerInvitation.create },
        });
      });

      const result = await service.create('dist-1', { name: 'Acme', email: 'acme@example.com' });

      expect(result.id).toBe('rel-1');
      expect(result.inviteUrl).toContain('/accept-invite?token=');
      expect(mockPrisma.customerInvitation.create).toHaveBeenCalled();
    });

    it('does not create invitation when email is absent', async () => {
      const rel = makeRel({ customer: makeOrg({ email: null }) });
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        mockPrisma.organisation.create.mockResolvedValue({ id: 'org-1' });
        mockPrisma.tradeRelationship.create.mockResolvedValue({ id: 'rel-1' });
        mockPrisma.tradeRelationship.findUniqueOrThrow.mockResolvedValue(rel);
        return fn({
          organisation: { create: mockPrisma.organisation.create },
          tradeRelationship: { create: mockPrisma.tradeRelationship.create, findUniqueOrThrow: mockPrisma.tradeRelationship.findUniqueOrThrow },
          customerInvitation: { create: mockPrisma.customerInvitation.create },
        });
      });

      const result = await service.create('dist-1', { name: 'No Email' });

      expect(result.inviteUrl).toBeNull();
      expect(mockPrisma.customerInvitation.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when no organisationId and no name', async () => {
      mockPrisma.$transaction.mockImplementation(async (fn: any) =>
        fn({
          organisation: { create: mockPrisma.organisation.create, findFirst: mockPrisma.organisation.findFirst },
          tradeRelationship: { create: mockPrisma.tradeRelationship.create, findUnique: mockPrisma.tradeRelationship.findUnique, findUniqueOrThrow: mockPrisma.tradeRelationship.findUniqueOrThrow },
          customerInvitation: { create: mockPrisma.customerInvitation.create },
        }),
      );

      await expect(service.create('dist-1', {})).rejects.toThrow(BadRequestException);
    });

    it('links to existing org when organisationId provided', async () => {
      const rel = makeRel();
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        mockPrisma.organisation.findFirst.mockResolvedValue(makeOrg());
        mockPrisma.tradeRelationship.findUnique.mockResolvedValue(null);
        mockPrisma.tradeRelationship.create.mockResolvedValue({ id: 'rel-1' });
        mockPrisma.tradeRelationship.findUniqueOrThrow.mockResolvedValue(rel);
        return fn({
          organisation: { findFirst: mockPrisma.organisation.findFirst },
          tradeRelationship: { create: mockPrisma.tradeRelationship.create, findUnique: mockPrisma.tradeRelationship.findUnique, findUniqueOrThrow: mockPrisma.tradeRelationship.findUniqueOrThrow },
          customerInvitation: { create: mockPrisma.customerInvitation.create },
        });
      });

      const result = await service.create('dist-1', { organisationId: 'org-1', email: 'a@b.com' });

      expect(result.id).toBe('rel-1');
      expect(mockPrisma.organisation.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when relationship already exists for organisationId', async () => {
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        mockPrisma.organisation.findFirst.mockResolvedValue(makeOrg());
        mockPrisma.tradeRelationship.findUnique.mockResolvedValue({ id: 'rel-existing' });
        return fn({
          organisation: { findFirst: mockPrisma.organisation.findFirst },
          tradeRelationship: { findUnique: mockPrisma.tradeRelationship.findUnique },
          customerInvitation: {},
        });
      });

      await expect(service.create('dist-1', { organisationId: 'org-1' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws NotFoundException when organisationId does not exist', async () => {
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        mockPrisma.organisation.findFirst.mockResolvedValue(null);
        return fn({
          organisation: { findFirst: mockPrisma.organisation.findFirst },
          tradeRelationship: {},
          customerInvitation: {},
        });
      });

      await expect(service.create('dist-1', { organisationId: 'org-ghost' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException when the account number is already used by another customer', async () => {
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        mockPrisma.tradeRelationship.findFirst.mockResolvedValue({ id: 'rel-existing' });
        return fn({
          organisation: { create: mockPrisma.organisation.create },
          tradeRelationship: { create: mockPrisma.tradeRelationship.create, findFirst: mockPrisma.tradeRelationship.findFirst },
          customerInvitation: { create: mockPrisma.customerInvitation.create },
        });
      });

      await expect(
        service.create('dist-1', { name: 'New Co', accountNumber: 'ACC-001' }),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.tradeRelationship.create).not.toHaveBeenCalled();
    });

    it('does not check for account-number conflicts when none is supplied', async () => {
      const rel = makeRel();
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        mockPrisma.organisation.create.mockResolvedValue({ id: 'org-1' });
        mockPrisma.tradeRelationship.create.mockResolvedValue({ id: 'rel-1' });
        mockPrisma.tradeRelationship.findUniqueOrThrow.mockResolvedValue(rel);
        mockPrisma.tradeRelationship.findFirst.mockClear();
        return fn({
          organisation: { create: mockPrisma.organisation.create },
          tradeRelationship: {
            create: mockPrisma.tradeRelationship.create,
            findFirst: mockPrisma.tradeRelationship.findFirst,
            findUniqueOrThrow: mockPrisma.tradeRelationship.findUniqueOrThrow,
          },
          customerInvitation: { create: mockPrisma.customerInvitation.create },
        });
      });

      await service.create('dist-1', { name: 'No Account Number' });
      expect(mockPrisma.tradeRelationship.findFirst).not.toHaveBeenCalled();
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates org and relationship fields', async () => {
      mockPrisma.tradeRelationship.findFirst
        .mockResolvedValueOnce({ id: 'rel-1', customerId: 'org-1' })
        .mockResolvedValueOnce(makeRel({ notes: 'updated' }));
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.update('rel-1', 'dist-1', { notes: 'updated' });
      expect(result.notes).toBe('updated');
    });

    it('throws NotFoundException when not found', async () => {
      mockPrisma.tradeRelationship.findFirst.mockResolvedValue(null);
      await expect(service.update('rel-1', 'dist-2', { notes: 'x' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException when the account number is already used by a different customer', async () => {
      mockPrisma.tradeRelationship.findFirst
        .mockResolvedValueOnce({ id: 'rel-1', customerId: 'org-1' })
        .mockResolvedValueOnce({ id: 'rel-other' });

      await expect(
        service.update('rel-1', 'dist-1', { accountNumber: 'ACC-001' }),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('excludes the relationship itself when checking for account-number conflicts', async () => {
      mockPrisma.tradeRelationship.findFirst
        .mockResolvedValueOnce({ id: 'rel-1', customerId: 'org-1' })
        .mockResolvedValueOnce(null) // conflict check: no other relationship has it
        .mockResolvedValueOnce(makeRel({ accountNumber: 'ACC-001' })); // findOne after update
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.update('rel-1', 'dist-1', { accountNumber: 'ACC-001' });
      expect(result.accountNumber).toBe('ACC-001');
    });
  });

  // ── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('soft-deletes the relationship', async () => {
      mockPrisma.tradeRelationship.findFirst.mockResolvedValue({ id: 'rel-1' });
      mockPrisma.tradeRelationship.update.mockResolvedValue({});

      await service.remove('rel-1', 'dist-1');

      expect(mockPrisma.tradeRelationship.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
      );
    });

    it('throws NotFoundException when not found', async () => {
      mockPrisma.tradeRelationship.findFirst.mockResolvedValue(null);
      await expect(service.remove('rel-1', 'dist-2')).rejects.toThrow(NotFoundException);
    });
  });

  // ── invite ──────────────────────────────────────────────────────────────────

  describe('invite', () => {
    it('revokes pending invites, creates a new one, and writes a CustomerInviteSent outbox event', async () => {
      mockPrisma.tradeRelationship.findFirst.mockResolvedValue(
        makeRel({ customer: makeOrg({ email: 'acme@example.com' }), distributor: { name: 'Winos Pty Ltd' } }),
      );
      mockPrisma.customerInvitation.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.customerInvitation.create.mockResolvedValue({ id: 'inv-1' });
      mockPrisma.$transaction.mockImplementation(async (fn: any) =>
        fn({
          customerInvitation: {
            updateMany: mockPrisma.customerInvitation.updateMany,
            create: mockPrisma.customerInvitation.create,
          },
        }),
      );

      const result = await service.invite('rel-1', 'dist-1');

      expect(result.inviteUrl).toContain('/accept-invite?token=');
      expect(result.expiresAt).toBeDefined();
      expect(mockPrisma.customerInvitation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tradeRelationshipId: 'rel-1', email: 'acme@example.com' }) }),
      );
      expect(mockOutbox.writeEvent).toHaveBeenCalledWith(
        expect.anything(),
        'CustomerInvitation',
        'inv-1',
        'CustomerInviteSent',
        expect.objectContaining({
          invitationId: 'inv-1',
          distributorId: 'dist-1',
          email: 'acme@example.com',
          distributorName: 'Winos Pty Ltd',
          inviteUrl: result.inviteUrl,
        }),
      );
    });

    it('does not send the invite email directly — only writes the outbox event', async () => {
      mockPrisma.tradeRelationship.findFirst.mockResolvedValue(
        makeRel({ customer: makeOrg({ email: 'acme@example.com' }), distributor: { name: 'Winos Pty Ltd' } }),
      );
      mockPrisma.customerInvitation.create.mockResolvedValue({ id: 'inv-2' });
      mockPrisma.$transaction.mockImplementation(async (fn: any) =>
        fn({
          customerInvitation: {
            updateMany: mockPrisma.customerInvitation.updateMany,
            create: mockPrisma.customerInvitation.create,
          },
        }),
      );

      await service.invite('rel-1', 'dist-1');

      expect(mockOutbox.writeEvent).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException when relationship not found', async () => {
      mockPrisma.tradeRelationship.findFirst.mockResolvedValue(null);
      await expect(service.invite('rel-1', 'dist-2')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when customer has no email', async () => {
      mockPrisma.tradeRelationship.findFirst.mockResolvedValue(
        makeRel({ customer: makeOrg({ email: null }) }),
      );
      await expect(service.invite('rel-1', 'dist-1')).rejects.toThrow(BadRequestException);
    });
  });
});
