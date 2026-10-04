import { Processor } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { AccountingInvoiceExportStatus, AccountingInvoiceState, ActorType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IngestionRunService } from '../ingestion/ingestion-run.service';
import { AccountingConnectionService } from '../accounting/accounting-connection.service';
import { AccountingAdapterRegistry } from '../accounting/adapters/accounting-adapter.registry';
import {
  AccountingConnectionAdapter,
  AccountingExternalInvoiceStatus,
} from '../accounting/adapters/accounting-connection-adapter.interface';
import { AccountingProviderError } from '../accounting/adapters/accounting-provider.error';
import { ACCOUNTING_WORKER_SETTINGS } from '../accounting/accounting-backoff';
import { ExportWithOrder, InvoicePaymentStateService, SyncedState, syncedStateChanged } from '../accounting/invoice-payment-state.service';
import { AccountingConnectionWithOrganisation, organisationScope } from '../accounting/accounting-organisation';
import {
  AccountingPullProcessorBase,
  PullContext,
  PullResult,
  RunProgress,
} from '../accounting/sync/accounting-pull-processor.base';
import { ACCOUNTING_INVOICE_SYNC_QUEUE } from '../queues/queue.constants';

const LOOKUP_CHUNK = 500;

function calendarDate(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export function toSyncedState(record: AccountingExternalInvoiceStatus): SyncedState {
  return {
    invoiceState: record.state as AccountingInvoiceState,
    invoiceTotal: record.total,
    amountPaid: record.amountPaid,
    amountCredited: record.amountCredited,
    amountDue: record.amountDue,
    issueDate: calendarDate(record.issueDate),
    dueDate: calendarDate(record.dueDate),
    fullyPaidOn: calendarDate(record.fullyPaidOn),
    providerUpdatedAt: record.providerUpdatedAt,
    externalInvoiceNumber: record.externalInvoiceNumber ?? null,
    externalInvoiceStatus: record.rawStatus,
  };
}

// Invoice status sync (ADR-072) — a pull (see AccountingPullProcessorBase
// for the pattern). Reads the status and payment facts of the invoices
// Stocdup created in the distributor's accounting system and writes them onto
// the matching AccountingInvoiceExport rows. The accounting system is the
// system of record for invoices and payments (ADR-006); Stocdup only mirrors.
// Scheduled every 15 min for organisations with unsettled invoices, and by a
// manual Sync. Everything provider-specific is behind
// adapter.listInvoiceStatuses.
//
// Writing the facts, and everything a payment status change triggers (outbox
// event, order timeline audit row, order completion), is
// InvoicePaymentStateService's job — this processor only decides which rows
// the fetched snapshot applies to.
@Processor(ACCOUNTING_INVOICE_SYNC_QUEUE, { concurrency: 2, ...ACCOUNTING_WORKER_SETTINGS })
export class AccountingInvoiceSyncProcessor extends AccountingPullProcessorBase {
  protected readonly logger = new Logger(AccountingInvoiceSyncProcessor.name);
  protected readonly recordNoun = 'invoice';
  protected readonly resourceType = 'invoice';

  constructor(
    prisma: PrismaService,
    accountingConnectionService: AccountingConnectionService,
    adapters: AccountingAdapterRegistry,
    ingestionRuns: IngestionRunService,
    private readonly paymentState: InvoicePaymentStateService,
  ) {
    super(prisma, accountingConnectionService, adapters, ingestionRuns);
  }

  protected async preflight(connection: AccountingConnectionWithOrganisation, adapter: AccountingConnectionAdapter): Promise<void> {
    if (!adapter.hasInvoiceReadScope(connection.scopes)) {
      throw new AccountingProviderError(
        'Reconnect the accounting integration to grant Stocdup permission to read invoices.',
        false,
        undefined,
        'SCOPE_MISSING',
      );
    }
  }

  protected async pull({ connection, adapter, tokenSet, cursor, progress }: PullContext): Promise<PullResult> {
    const fetched = await adapter.listInvoiceStatuses(tokenSet, connection.organisation.externalOrganisationId, cursor);
    await progress.setTotal(fetched.records.length);
    const { matched, updated, statusChanges } = await this.applyStatuses(connection, fetched.records, progress);
    return {
      counts: { recordsProcessed: fetched.records.length, recordsUpdated: updated, detailCount: statusChanges },
      nextCursor: fetched.nextCursor,
      summary: {
        fields: { fetched: fetched.records.length, matched, updated, statusChanges },
        message: `Invoice status sync complete: ${fetched.records.length} fetched, ${matched} ours, ${updated} changed, ${statusChanges} payment status change(s)`,
      },
    };
  }

  // Writes provider facts onto our export rows — every one this organisation
  // owns, whichever connection was live when it was exported. Invoices Stocdup didn't
  // create (or whose export row is gone) are ignored. Returns how many
  // fetched invoices were ours, how many rows changed, and how many derived
  // payment-status transitions were emitted.
  async applyStatuses(
    connection: AccountingConnectionWithOrganisation,
    records: AccountingExternalInvoiceStatus[],
    progress?: RunProgress,
  ): Promise<{ matched: number; updated: number; statusChanges: number }> {
    let matched = 0;
    let updated = 0;
    let statusChanges = 0;

    for (let i = 0; i < records.length; i += LOOKUP_CHUNK) {
      const chunk = records.slice(i, i + LOOKUP_CHUNK);
      const exports = (await this.prisma.accountingInvoiceExport.findMany({
        where: {
          ...organisationScope(connection),
          status: AccountingInvoiceExportStatus.COMPLETED,
          externalInvoiceId: { in: chunk.map((r) => r.externalInvoiceId) },
        },
        include: { order: { select: { traderCustomerId: true, currency: true } } },
      })) as ExportWithOrder[];
      const byExternalId = new Map(exports.map((e) => [e.externalInvoiceId as string, e]));

      for (const record of chunk) {
        await progress?.tick({ recordsUpdated: updated, detailCount: statusChanges });
        const current = byExternalId.get(record.externalInvoiceId);
        if (!current) continue;
        matched += 1;

        const next = toSyncedState(record);
        // Never let an older snapshot (an overlapping cursor window, a slow
        // retry) overwrite a newer one.
        if (
          current.providerUpdatedAt &&
          next.providerUpdatedAt &&
          next.providerUpdatedAt.getTime() < current.providerUpdatedAt.getTime()
        ) {
          continue;
        }
        // Checked here too so unchanged invoices don't each cost a transaction.
        if (!syncedStateChanged(current, next)) continue;
        const { changed, fromStatus, toStatus } = await this.prisma.$transaction((tx) =>
          this.paymentState.apply(tx, current, next, {
            source: this.adapters.displayName(connection.provider),
            currency: record.currency,
            actor: { type: ActorType.SYSTEM },
          }),
        );
        if (!changed) continue;
        updated += 1;
        if (fromStatus !== toStatus) {
          statusChanges += 1;
          this.logger.log(
            {
              event: 'accounting.invoice.payment_status_changed',
              provider: connection.provider,
              distributorId: current.distributorId,
              connectionId: connection.id,
              exportId: current.id,
              orderId: current.orderId,
              fromStatus,
              toStatus,
            },
            `Invoice for order ${current.orderId}: ${fromStatus} → ${toStatus}`,
          );
        }
      }
    }
    return { matched, updated, statusChanges };
  }
}
