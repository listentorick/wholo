import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AccountingInvoiceExportStatus, ActorType } from '@prisma/client';
import { AccountingInvoiceExportService } from './accounting-invoice-export.service';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { AuditService } from '../audit/audit.service';

const mockPrisma = {
  accountingInvoiceExport: { findFirst: jest.fn() },
  user: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};

const mockOutbox = { writeEvent: jest.fn() };
const mockAudit = { record: jest.fn() };

describe('AccountingInvoiceExportService', () => {
  let service: AccountingInvoiceExportService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((fn: (tx: typeof mockPrisma) => Promise<unknown>) =>
      fn(mockPrisma),
    );
    mockPrisma.user.findUnique.mockResolvedValue({ firstName: 'Jane', lastName: 'Doe' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountingInvoiceExportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OutboxService, useValue: mockOutbox },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(AccountingInvoiceExportService);
  });

  describe('retryExport', () => {
    it('throws NotFoundException when the export does not belong to the distributor', async () => {
      mockPrisma.accountingInvoiceExport.findFirst.mockResolvedValue(null);

      await expect(service.retryExport('dist-1', 'export-1', 'user-1')).rejects.toThrow(NotFoundException);

      expect(mockPrisma.accountingInvoiceExport.findFirst).toHaveBeenCalledWith({
        where: { id: 'export-1', distributorId: 'dist-1' },
      });
      expect(mockOutbox.writeEvent).not.toHaveBeenCalled();
    });

    it('rejects retrying an export that is not FAILED', async () => {
      mockPrisma.accountingInvoiceExport.findFirst.mockResolvedValue({
        id: 'export-1',
        orderId: 'order-1',
        status: AccountingInvoiceExportStatus.COMPLETED,
      });

      await expect(service.retryExport('dist-1', 'export-1', 'user-1')).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(mockOutbox.writeEvent).not.toHaveBeenCalled();
    });

    it('writes an AccountingInvoiceExportRequested outbox event for a FAILED export (never queues directly)', async () => {
      mockPrisma.accountingInvoiceExport.findFirst.mockResolvedValue({
        id: 'export-1',
        orderId: 'order-1',
        status: AccountingInvoiceExportStatus.FAILED,
      });

      const result = await service.retryExport('dist-1', 'export-1', 'user-1');

      expect(mockOutbox.writeEvent).toHaveBeenCalledWith(
        mockPrisma,
        'Order',
        'order-1',
        'AccountingInvoiceExportRequested',
        { orderId: 'order-1', distributorId: 'dist-1', exportId: 'export-1' },
      );
      expect(result).toEqual({ status: 'requested' });
    });

    it('records an INVOICE_EXPORT_RETRY_REQUESTED audit entry attributed to the requesting user', async () => {
      mockPrisma.accountingInvoiceExport.findFirst.mockResolvedValue({
        id: 'export-1',
        orderId: 'order-1',
        status: AccountingInvoiceExportStatus.FAILED,
      });

      await service.retryExport('dist-1', 'export-1', 'user-1');

      expect(mockAudit.record).toHaveBeenCalledWith(
        mockPrisma,
        expect.objectContaining({
          distributorId: 'dist-1',
          entityType: 'ORDER',
          entityId: 'order-1',
          action: 'INVOICE_EXPORT_RETRY_REQUESTED',
          actorType: ActorType.USER,
          actorUserId: 'user-1',
          actorName: 'Jane Doe',
        }),
      );
    });
  });
});
