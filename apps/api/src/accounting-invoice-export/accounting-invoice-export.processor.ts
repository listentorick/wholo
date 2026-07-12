import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import {
  AccountingConnection,
  AccountingConnectionStatus,
  AccountingInvoiceExport,
  AccountingInvoiceExportStatus,
  Order,
  OrderLine,
  OrderLineStatus,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { Job } from 'bullmq';
import { AccountingConnectionService } from '../accounting/accounting-connection.service';
import { AccountingAdapterRegistry } from '../accounting/adapters/accounting-adapter.registry';
import {
  AccountingInvoiceLineRequest,
  AccountingInvoiceRequest,
} from '../accounting/adapters/accounting-connection-adapter.interface';
import { AccountingProviderError } from '../accounting/adapters/accounting-provider.error';
import { PrismaService } from '../prisma/prisma.service';
import { ACCOUNTING_INVOICE_EXPORT_QUEUE } from '../queues/queue.constants';

interface InvoiceExportJobData {
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  payload: { orderId?: string; distributorId?: string };
}

// A PROCESSING row younger than this is presumed to have a live attempt
// behind it; older means the worker died mid-flight and the row may be
// resumed (with the SAME idempotency key, so a crash after the provider call
// succeeded replays into the provider's idempotency cache, not a duplicate).
const PROCESSING_STALE_MS = 15 * 60 * 1000;

// Creates one sales invoice in the distributor's connected accounting system
// per accepted order. Consumes OrderAccepted (domain trigger) and
// AccountingInvoiceExportRequested (manual retry) — one path for both, like
// the sync processors. Everything provider-specific lives behind the adapter
// registry; this class knows no Xero.
//
// Business idempotency is the AccountingInvoiceExport row
// (unique connectionId+orderId), claimed via status transitions before any
// provider call is made.
@Processor(ACCOUNTING_INVOICE_EXPORT_QUEUE)
export class AccountingInvoiceExportProcessor extends WorkerHost {
  private readonly logger = new Logger(AccountingInvoiceExportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountingConnectionService: AccountingConnectionService,
    private readonly adapters: AccountingAdapterRegistry,
  ) {
    super();
  }

  async process(job: Job<InvoiceExportJobData>): Promise<void> {
    const orderId = job.data.payload?.orderId;
    if (!orderId) {
      this.logger.warn(`Job ${job.id} (${job.name}) carries no orderId — skipping`);
      return;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { lines: true },
    });
    if (!order) {
      this.logger.warn(`Order ${orderId} not found — skipping invoice export`);
      return;
    }
    if (order.status !== OrderStatus.ACCEPTED && order.status !== OrderStatus.COMPLETED) {
      this.logger.log(`Order ${orderId} is ${order.status}, not invoiceable — skipping invoice export`);
      return;
    }

    // An active CONNECTED connection is the "invoice export enabled" check:
    // no connection, no export record — the distributor hasn't opted in.
    const connection = await this.prisma.accountingConnection.findFirst({
      where: { distributorId: order.distributorId, status: AccountingConnectionStatus.CONNECTED },
    });
    if (!connection) {
      this.logger.log(`No active accounting connection for distributor ${order.distributorId} — skipping invoice export`);
      return;
    }

    // Cross-connection guard: the per-connection unique alone would let a
    // disconnect/reconnect cycle invoice the same order twice.
    const completedElsewhere = await this.prisma.accountingInvoiceExport.findFirst({
      where: { orderId, status: AccountingInvoiceExportStatus.COMPLETED },
    });
    if (completedElsewhere) {
      this.logger.log(`Order ${orderId} already has a completed invoice export — skipping`);
      return;
    }

    const exportRow = await this.claimExport(connection, order);
    if (!exportRow) return;

    await this.runExport(exportRow, connection, order);
  }

  // Acquire the (connection, order) export row and move it to PROCESSING, or
  // return null when there is nothing to do. Claiming happens before any
  // provider call so concurrent jobs for the same order settle on the unique
  // constraint, not on the provider.
  private async claimExport(
    connection: AccountingConnection,
    order: Order,
  ): Promise<AccountingInvoiceExport | null> {
    try {
      return await this.prisma.accountingInvoiceExport.create({
        data: {
          distributorId: order.distributorId,
          accountingConnectionId: connection.id,
          provider: connection.provider,
          orderId: order.id,
          status: AccountingInvoiceExportStatus.PROCESSING,
          retryCount: 1,
        },
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;
    }

    const existing = await this.prisma.accountingInvoiceExport.findUnique({
      where: { accountingConnectionId_orderId: { accountingConnectionId: connection.id, orderId: order.id } },
    });
    if (!existing) return null; // raced a delete; nothing sensible to do

    switch (existing.status) {
      case AccountingInvoiceExportStatus.COMPLETED:
        return null;
      case AccountingInvoiceExportStatus.PROCESSING: {
        const ageMs = Date.now() - existing.updatedAt.getTime();
        if (ageMs < PROCESSING_STALE_MS) {
          this.logger.log(`Invoice export ${existing.id} already in flight — skipping`);
          return null;
        }
        // Stale claim: the worker died mid-attempt. Resume WITHOUT bumping
        // retryCount so the provider idempotency key replays the interrupted
        // attempt — if the invoice was created before the crash, the provider
        // returns the cached result instead of a duplicate.
        this.logger.warn(`Invoice export ${existing.id} is stale PROCESSING (${Math.round(ageMs / 1000)}s) — resuming`);
        return this.prisma.accountingInvoiceExport.update({
          where: { id: existing.id },
          data: { status: AccountingInvoiceExportStatus.PROCESSING },
        });
      }
      default:
        // PENDING or FAILED → controlled retry: fresh attempt, fresh key.
        return this.prisma.accountingInvoiceExport.update({
          where: { id: existing.id },
          data: { status: AccountingInvoiceExportStatus.PROCESSING, retryCount: { increment: 1 } },
        });
    }
  }

  private async runExport(
    exportRow: AccountingInvoiceExport,
    connection: AccountingConnection,
    order: Order & { lines: OrderLine[] },
  ): Promise<void> {
    const adapter = this.adapters.get(connection.provider);

    // Eligibility guards — recoverable, user-actionable failures. No rethrow:
    // retrying without user action would fail identically forever.
    // Connections consented before invoice support shipped lack the scope for
    // it (scope vocabulary is the adapter's business); fail fast with a
    // "reconnect" message rather than letting the provider call 403.
    if (!adapter.hasInvoiceCreationScope(connection.scopes)) {
      await this.markFailed(
        exportRow.id,
        'SCOPE_MISSING',
        'Reconnect the accounting integration to grant Wholo permission to create invoices.',
      );
      return;
    }

    const invoiceableLines = order.lines.filter(
      (line) => line.status !== OrderLineStatus.CANCELLED && line.status !== OrderLineStatus.REJECTED,
    );
    if (invoiceableLines.length === 0) {
      await this.markFailed(exportRow.id, 'ORDER_NOT_INVOICEABLE', 'The order has no invoiceable lines.');
      return;
    }

    // Contact mapping is mandatory: the invoice contact comes only from a
    // confirmed CustomerAccountingMapping. Never matched/guessed here.
    const tradeRelationship = await this.prisma.tradeRelationship.findUnique({
      where: {
        distributorId_customerId: { distributorId: order.distributorId, customerId: order.traderCustomerId },
      },
    });
    const customerMapping = tradeRelationship
      ? await this.prisma.customerAccountingMapping.findFirst({
          where: {
            accountingConnectionId: connection.id,
            tradeRelationshipId: tradeRelationship.id,
            unlinkedAt: null,
          },
          include: { externalContact: true },
        })
      : null;
    if (!customerMapping) {
      await this.markFailed(
        exportRow.id,
        'CUSTOMER_NOT_MAPPED',
        'Cannot create accounting invoice because the customer is not linked to an accounting contact.',
      );
      return;
    }

    // Product mappings are best-effort: mapped lines carry the external item
    // code and its tax/account treatment; unmapped lines still invoice from
    // the Wholo description alone. Wholo always sends quantity + unit price —
    // the provider's item defaults never determine the price.
    const productMappings = await this.prisma.productAccountingMapping.findMany({
      where: {
        accountingConnectionId: connection.id,
        productId: { in: invoiceableLines.map((line) => line.productId) },
        unlinkedAt: null,
      },
      include: { externalProduct: true },
    });
    const mappingByProductId = new Map(productMappings.map((m) => [m.productId, m]));

    const lines: AccountingInvoiceLineRequest[] = invoiceableLines.map((line) => {
      const mapping = mappingByProductId.get(line.productId);
      const external = mapping?.externalProduct;
      const description = external?.externalProductCode
        ? line.productNameSnapshot
        : [line.productNameSnapshot, line.skuSnapshot].filter(Boolean).join(' — ');
      return {
        description,
        quantity: line.quantityOrdered,
        unitPrice: line.unitPriceSnapshot.toFixed(2),
        ...(external?.externalProductCode ? { externalItemCode: external.externalProductCode } : {}),
        ...(external?.taxCode ? { taxCode: external.taxCode } : {}),
        ...(external?.accountCode ? { accountCode: external.accountCode } : {}),
      };
    });

    const request: AccountingInvoiceRequest = {
      externalContactId: customerMapping.externalContact.externalContactId,
      reference: order.orderNumber,
      currency: order.currency,
      issueDate: (order.acceptedAt ?? new Date()).toISOString().slice(0, 10),
      targetStatus: connection.invoiceExportTargetStatus,
      lines,
    };

    try {
      // getValidTokenSet is the only sanctioned token gateway (serialised
      // refresh, ERROR-state bookkeeping); never read encryptedCredentialData.
      const tokenSet = await this.accountingConnectionService.getValidTokenSet(
        order.distributorId,
        connection.provider,
      );
      const result = await adapter.createInvoice(
        tokenSet,
        connection.externalOrganisationId,
        request,
        `${exportRow.id}:${exportRow.retryCount}`,
      );

      await this.prisma.accountingInvoiceExport.update({
        where: { id: exportRow.id },
        data: {
          status: AccountingInvoiceExportStatus.COMPLETED,
          externalInvoiceId: result.externalInvoiceId,
          externalInvoiceNumber: result.externalInvoiceNumber ?? null,
          externalInvoiceStatus: result.externalInvoiceStatus ?? null,
          exportedAt: new Date(),
          failedAt: null,
          errorCode: null,
          errorMessage: null,
        },
      });
      this.logger.log(
        `Created ${connection.provider} invoice ${result.externalInvoiceNumber ?? result.externalInvoiceId} for order ${order.orderNumber}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Permanent provider rejections (validation, authorisation) wait for
      // user action + manual retry. Everything else — transient provider
      // faults, token refresh failures — is marked FAILED for visibility and
      // rethrown so BullMQ retries with backoff (the next attempt claims the
      // FAILED row again).
      const permanent = err instanceof AccountingProviderError && !err.transient;
      await this.markFailed(exportRow.id, 'PROVIDER_ERROR', message);
      if (!permanent) throw err;
    }
  }

  private async markFailed(exportId: string, errorCode: string, errorMessage: string): Promise<void> {
    this.logger.warn(`Invoice export ${exportId} failed (${errorCode}): ${errorMessage}`);
    await this.prisma.accountingInvoiceExport.update({
      where: { id: exportId },
      data: {
        status: AccountingInvoiceExportStatus.FAILED,
        failedAt: new Date(),
        errorCode,
        errorMessage,
      },
    });
  }
}
