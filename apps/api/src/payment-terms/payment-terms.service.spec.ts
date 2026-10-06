import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PaymentTermType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentTermsService } from './payment-terms.service';

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
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  _count: { customerSettings: 0 },
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
  paymentTerm: {
    upsert: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  distributorSettings: { findUnique: jest.fn(), upsert: jest.fn() },
  traderCustomerSettings: { updateMany: jest.fn() },
  accountingConnection: { findFirst: jest.fn() },
  $transaction: jest.fn(),
};

describe('PaymentTermsService', () => {
  let service: PaymentTermsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    mockPrisma.paymentTerm.upsert.mockResolvedValue(systemTerm);
    mockPrisma.$transaction.mockImplementation(async (arg: any) =>
      typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg),
    );
    const module = await Test.createTestingModule({
      providers: [PaymentTermsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(PaymentTermsService);
  });

  describe('findAll', () => {
    it('lists the distributor\'s terms, then the built-in one, which is the default when none is chosen', async () => {
      mockPrisma.paymentTerm.findMany.mockResolvedValue([term({ _count: { customerSettings: 2 } }), systemTerm]);
      mockPrisma.distributorSettings.findUnique.mockResolvedValue({ defaultPaymentTermId: null });

      const result = await service.findAll('dist-1');

      expect(result.defaultPaymentTermId).toBe('pt-sys');
      expect(result.data.map((t) => [t.id, t.isSystem, t.isDefault])).toEqual([
        ['pt-1', false, false],
        ['pt-sys', true, true],
      ]);
      expect(result.data[0]).toMatchObject({ summary: '30 days after the invoice date', customerCount: 2 });
    });

    it('names the connected accounting integration, or null when there is none', async () => {
      mockPrisma.paymentTerm.findMany.mockResolvedValue([systemTerm]);
      mockPrisma.distributorSettings.findUnique.mockResolvedValue(null);

      mockPrisma.accountingConnection.findFirst.mockResolvedValueOnce({ provider: 'XERO' });
      expect((await service.findAll('dist-1')).accountingProvider).toBe('XERO');

      mockPrisma.accountingConnection.findFirst.mockResolvedValueOnce(null);
      expect((await service.findAll('dist-1')).accountingProvider).toBeNull();
    });

    it('marks the chosen default', async () => {
      mockPrisma.paymentTerm.findMany.mockResolvedValue([systemTerm, term()]);
      mockPrisma.distributorSettings.findUnique.mockResolvedValue({ defaultPaymentTermId: 'pt-1' });

      const result = await service.findAll('dist-1');
      expect(result.defaultPaymentTermId).toBe('pt-1');
    });

    it('falls back to the built-in term if the chosen default is inactive', async () => {
      mockPrisma.paymentTerm.findMany.mockResolvedValue([systemTerm, term({ active: false })]);
      mockPrisma.distributorSettings.findUnique.mockResolvedValue({ defaultPaymentTermId: 'pt-1' });

      const result = await service.findAll('dist-1');
      expect(result.defaultPaymentTermId).toBe('pt-sys');
    });
  });

  describe('create', () => {
    beforeEach(() => {
      mockPrisma.paymentTerm.create.mockResolvedValue(term());
      mockPrisma.paymentTerm.findFirst.mockResolvedValue(term());
      mockPrisma.distributorSettings.findUnique.mockResolvedValue({ defaultPaymentTerm: null });
    });

    it('creates a term', async () => {
      const result = await service.create('dist-1', { name: 'Net 30', type: PaymentTermType.DAYS_AFTER_INVOICE, days: 30 });
      expect(result).toMatchObject({ id: 'pt-1', name: 'Net 30', isDefault: false });
    });

    it('makes it the default when asked', async () => {
      mockPrisma.distributorSettings.findUnique.mockResolvedValue({ defaultPaymentTerm: { id: 'pt-1', active: true } });
      const result = await service.create('dist-1', {
        name: 'Net 30',
        type: PaymentTermType.DAYS_AFTER_INVOICE,
        days: 30,
        makeDefault: true,
      });
      expect(result.isDefault).toBe(true);
    });

    it('rejects an invalid rule', async () => {
      await expect(
        service.create('dist-1', { name: 'Bad', type: PaymentTermType.DAY_OF_MONTH, dayOfMonth: 40 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects creating another accounting-software term', async () => {
      await expect(
        service.create('dist-1', { name: 'Xero', type: PaymentTermType.ACCOUNTING_SYSTEM_DEFAULT }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    beforeEach(() => {
      mockPrisma.distributorSettings.findUnique.mockResolvedValue({ defaultPaymentTerm: null });
    });

    it('404s for another distributor\'s term', async () => {
      mockPrisma.paymentTerm.findFirst.mockResolvedValue(null);
      await expect(service.update('pt-1', 'dist-2', { name: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('re-validates the rule against the existing values when only part of it changes', async () => {
      mockPrisma.paymentTerm.findFirst.mockResolvedValue(term());
      await expect(service.update('pt-1', 'dist-1', { days: 400 })).rejects.toThrow(BadRequestException);
      await expect(service.update('pt-1', 'dist-1', { type: PaymentTermType.DAY_OF_WEEK })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses to change the built-in term', async () => {
      mockPrisma.paymentTerm.findFirst.mockResolvedValue(systemTerm);
      await expect(service.update('pt-sys', 'dist-1', { name: 'Renamed' })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('lets the built-in term be made the default', async () => {
      mockPrisma.paymentTerm.findFirst.mockResolvedValue(systemTerm);
      mockPrisma.distributorSettings.findUnique.mockResolvedValue({ defaultPaymentTerm: { id: 'pt-sys', active: true } });

      const result = await service.update('pt-sys', 'dist-1', { isDefault: true });
      expect(result.isDefault).toBe(true);
    });

    it('refuses isDefault: false — the default moves by choosing another', async () => {
      mockPrisma.paymentTerm.findFirst.mockResolvedValue(term());
      await expect(service.update('pt-1', 'dist-1', { isDefault: false })).rejects.toThrow(BadRequestException);
    });

    it('refuses to make an inactive term the default', async () => {
      mockPrisma.paymentTerm.findFirst.mockResolvedValue(term({ active: false }));
      await expect(service.update('pt-1', 'dist-1', { isDefault: true })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('deactivate', () => {
    it('refuses the built-in term', async () => {
      mockPrisma.paymentTerm.findFirst.mockResolvedValue(systemTerm);
      await expect(service.deactivate('pt-sys', 'dist-1')).rejects.toThrow(UnprocessableEntityException);
    });

    it('refuses the current default', async () => {
      mockPrisma.paymentTerm.findFirst.mockResolvedValue(term());
      mockPrisma.distributorSettings.findUnique.mockResolvedValue({ defaultPaymentTerm: { id: 'pt-1', active: true } });
      await expect(service.deactivate('pt-1', 'dist-1')).rejects.toThrow(UnprocessableEntityException);
    });

    it('deactivates and moves its customers back to the default', async () => {
      mockPrisma.paymentTerm.findFirst
        .mockResolvedValueOnce(term({ _count: { customerSettings: 3 } }))
        .mockResolvedValueOnce(term({ active: false }));
      mockPrisma.distributorSettings.findUnique.mockResolvedValue({ defaultPaymentTerm: null });

      const result = await service.deactivate('pt-1', 'dist-1');

      expect(result).toMatchObject({ active: false, customerCount: 0 });
      expect(mockPrisma.traderCustomerSettings.updateMany).toHaveBeenCalledWith({
        where: { paymentTermId: 'pt-1' },
        data: { paymentTermId: null },
      });
    });
  });

  describe('preview', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-04T12:00:00Z'));
      mockPrisma.distributorSettings.findUnique.mockResolvedValue({ timezone: 'Europe/London' });
    });
    afterEach(() => jest.useRealTimers());

    it('shows today, this month end and next month start', async () => {
      const result = await service.preview('dist-1', { type: PaymentTermType.DAYS_AFTER_MONTH_END, days: 30 });
      expect(result).toEqual({
        summary: '30 days after the end of the invoice month',
        examples: [
          { invoiceDate: '2026-10-04', dueDate: '2026-11-30' },
          { invoiceDate: '2026-10-31', dueDate: '2026-11-30' },
          { invoiceDate: '2026-11-01', dueDate: '2026-12-30' },
        ],
      });
    });

    it('refuses the accounting-software rule — there is no date to show', async () => {
      await expect(
        service.preview('dist-1', { type: PaymentTermType.ACCOUNTING_SYSTEM_DEFAULT }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an invalid rule', async () => {
      await expect(service.preview('dist-1', { type: PaymentTermType.DAY_OF_WEEK, dayOfWeek: 9 })).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
