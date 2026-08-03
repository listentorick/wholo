import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AccountingInvoiceExportStatus, ActorType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { AuditService } from '../audit/audit.service';

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
    private readonly audit: AuditService,
  ) {}

  async retryExport(distributorId: string, exportId: string, userId: string): Promise<{ status: 'requested' }> {
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

    await this.prisma.$transaction(async (tx) => {
      await this.outbox.writeEvent(tx, 'Order', exportRow.orderId, 'AccountingInvoiceExportRequested', {
        orderId: exportRow.orderId,
        distributorId,
        exportId: exportRow.id,
      });
      const actor = await tx.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      });
      await this.audit.record(tx, {
        distributorId,
        entityType: 'ORDER',
        entityId: exportRow.orderId,
        action: 'INVOICE_EXPORT_RETRY_REQUESTED',
        actorType: ActorType.USER,
        actorUserId: userId,
        actorName: actor ? `${actor.firstName} ${actor.lastName}` : undefined,
        summary: 'Requested a retry of the invoice export',
        changes: { exportId: exportRow.id },
      });
    });
    return { status: 'requested' };
  }
}
