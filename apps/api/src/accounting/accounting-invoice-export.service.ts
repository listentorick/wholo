import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AccountingInvoiceExportStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';

// HTTP-side companion to the worker's AccountingInvoiceExportProcessor:
// user-triggered actions on export records. Retry follows the uniform-outbox
// rule — it writes an AccountingInvoiceExportRequested event, never touches
// the queue; the processor's claim logic (FAILED → controlled retry) is the
// idempotency guard.
@Injectable()
export class AccountingInvoiceExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async retryExport(distributorId: string, exportId: string): Promise<{ status: 'requested' }> {
    // Scoped to the distributor — a foreign exportId is indistinguishable
    // from a nonexistent one.
    const exportRow = await this.prisma.accountingInvoiceExport.findFirst({
      where: { id: exportId, distributorId },
    });
    if (!exportRow) {
      throw new NotFoundException('Invoice export not found');
    }
    if (exportRow.status !== AccountingInvoiceExportStatus.FAILED) {
      throw new UnprocessableEntityException('Only failed invoice exports can be retried');
    }

    await this.prisma.$transaction((tx) =>
      this.outbox.writeEvent(tx, 'Order', exportRow.orderId, 'AccountingInvoiceExportRequested', {
        orderId: exportRow.orderId,
        distributorId,
        exportId: exportRow.id,
      }),
    );
    return { status: 'requested' };
  }
}
