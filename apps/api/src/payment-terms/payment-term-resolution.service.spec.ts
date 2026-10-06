import { Test } from '@nestjs/testing';
import { PaymentTermSource, PaymentTermType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentTermResolutionService } from './payment-term-resolution.service';

const term = (overrides: Record<string, unknown> = {}) => ({
  id: 'pt-1',
  distributorId: 'dist-1',
  name: 'Net 30',
  type: PaymentTermType.DAYS_AFTER_INVOICE,
  days: 30,
  dayOfWeek: null,
  dayOfMonth: null,
  systemKey: null,
  active: true,
  ...overrides,
});
const systemTerm = term({
  id: 'pt-sys',
  name: 'Set by accounting software',
  type: PaymentTermType.ACCOUNTING_SYSTEM_DEFAULT,
  days: null,
  systemKey: 'ACCOUNTING_SYSTEM_DEFAULT',
});

const mockPrisma = {
  tradeRelationship: { findUnique: jest.fn() },
  distributorSettings: { findUnique: jest.fn() },
};

const givenOverride = (paymentTerm: unknown) =>
  mockPrisma.tradeRelationship.findUnique.mockResolvedValue({ traderCustomerSettings: { paymentTerm } });
const givenSettings = (defaultPaymentTerm: unknown, timezone = 'UTC') =>
  mockPrisma.distributorSettings.findUnique.mockResolvedValue({ defaultPaymentTerm, timezone });

describe('PaymentTermResolutionService', () => {
  let service: PaymentTermResolutionService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        PaymentTermResolutionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(PaymentTermResolutionService);
  });

  describe('resolve', () => {
    it('uses the customer override first', async () => {
      givenOverride(term({ id: 'pt-cust' }));
      givenSettings(term({ id: 'pt-default' }));
      expect(await service.resolve('dist-1', 'cust-1')).toMatchObject({
        term: { id: 'pt-cust' },
        source: PaymentTermSource.TRADER_CUSTOMER_OVERRIDE,
      });
    });

    it('honours an override to the accounting-software term', async () => {
      givenOverride(systemTerm);
      givenSettings(term({ id: 'pt-default' }));
      expect(await service.resolve('dist-1', 'cust-1')).toMatchObject({
        term: { id: 'pt-sys' },
        source: PaymentTermSource.TRADER_CUSTOMER_OVERRIDE,
      });
    });

    it('falls back to the distributor default when there is no override', async () => {
      mockPrisma.tradeRelationship.findUnique.mockResolvedValue({ traderCustomerSettings: null });
      givenSettings(term({ id: 'pt-default' }));
      expect(await service.resolve('dist-1', 'cust-1')).toMatchObject({
        term: { id: 'pt-default' },
        source: PaymentTermSource.DISTRIBUTOR_DEFAULT,
      });
    });

    it('ignores an inactive override', async () => {
      givenOverride(term({ id: 'pt-cust', active: false }));
      givenSettings(term({ id: 'pt-default' }));
      expect((await service.resolve('dist-1', 'cust-1')).term.id).toBe('pt-default');
    });

    it('ignores an override or default that belongs to another distributor', async () => {
      givenOverride(term({ id: 'pt-cust', distributorId: 'dist-2' }));
      givenSettings(term({ id: 'pt-default', distributorId: 'dist-2' }));
      expect((await service.resolve('dist-1', 'cust-1')).term).toMatchObject({
        id: null,
        type: PaymentTermType.ACCOUNTING_SYSTEM_DEFAULT,
      });
    });

    it('uses the built-in accounting-software rule, without creating its row, when no default is set', async () => {
      mockPrisma.tradeRelationship.findUnique.mockResolvedValue(null);
      mockPrisma.distributorSettings.findUnique.mockResolvedValue(null);
      expect(await service.resolve('dist-1', 'cust-1')).toEqual({
        term: {
          id: null,
          name: 'Set by accounting software',
          type: PaymentTermType.ACCOUNTING_SYSTEM_DEFAULT,
          days: null,
          dayOfWeek: null,
          dayOfMonth: null,
        },
        source: PaymentTermSource.DISTRIBUTOR_DEFAULT,
      });
    });
  });

  describe('snapshotForAcceptance', () => {
    it('dates the invoice in the distributor timezone and freezes the rule', async () => {
      mockPrisma.tradeRelationship.findUnique.mockResolvedValue(null);
      // 23:30 UTC on 31 Oct is already 1 Nov in Sydney.
      givenSettings(term({ id: 'pt-default' }), 'Australia/Sydney');

      const snapshot = await service.snapshotForAcceptance('dist-1', 'cust-1', new Date('2026-10-31T23:30:00Z'));

      expect(snapshot).toEqual({
        invoiceDate: new Date('2026-11-01T00:00:00Z'),
        dueDate: new Date('2026-12-01T00:00:00Z'),
        paymentTermIdSnapshot: 'pt-default',
        paymentTermSnapshot: { name: 'Net 30', type: 'DAYS_AFTER_INVOICE', days: 30, dayOfWeek: null, dayOfMonth: null },
        paymentTermSourceSnapshot: PaymentTermSource.DISTRIBUTOR_DEFAULT,
      });
    });

    it('records the accounting-software term with no due date', async () => {
      mockPrisma.tradeRelationship.findUnique.mockResolvedValue(null);
      givenSettings(null);

      const snapshot = await service.snapshotForAcceptance('dist-1', 'cust-1', new Date('2026-10-04T10:00:00Z'));

      expect(snapshot).toMatchObject({
        invoiceDate: new Date('2026-10-04T00:00:00Z'),
        dueDate: null,
        paymentTermIdSnapshot: null,
        paymentTermSnapshot: { name: 'Set by accounting software', type: 'ACCOUNTING_SYSTEM_DEFAULT', days: null, dayOfWeek: null, dayOfMonth: null },
      });
    });
  });
});
