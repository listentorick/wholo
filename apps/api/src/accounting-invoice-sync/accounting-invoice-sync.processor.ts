import { Processor } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import {
  AccountingConnection,
  AccountingConnectionStatus,
  AccountingInvoiceExportStatus,
  AccountingInvoiceState,
  ActorType,
  IngestionRunTrigger,
} from '@prisma/client';
import { Job, UnrecoverableError } from 'bullmq';
import { loggableError } from '@wholo/nest-telemetry';
import { PrismaService } from '../prisma/prisma.service';
import { IngestionRunService } from '../ingestion/ingestion-run.service';
import { AccountingConnectionService } from '../accounting/accounting-connection.service';
import { AccountingAdapterRegistry } from '../accounting/adapters/accounting-adapter.registry';
import { AccountingExternalInvoiceStatus } from '../accounting/adapters/accounting-connection-adapter.interface';
import { AccountingProviderError } from '../accounting/adapters/accounting-provider.error';
import { ACCOUNTING_WORKER_SETTINGS } from '../accounting/accounting-backoff';
import { ExportWithOrder, InvoicePaymentStateService, SyncedState, syncedStateChanged } from '../accounting/invoice-payment-state.service';
import { ACCOUNTING_SOURCE_TYPE } from '../accounting/sync/accounting-sync.constants';
import { shouldRunFull } from '../accounting/sync/accounting-sync-processor.base';
import { LoggedWorkerHost } from '../queues/logged-worker-host';
import { ACCOUNTING_INVOICE_SYNC_QUEUE } from '../queues/queue.constants';

interface OutboxEventJobData {
  eventId: string;
  aggregateType: string;
  aggregateId: string; // AccountingConnection id
  payload: unknown; // { runId?: string }
}

const RESOURCE_TYPE = 'invoice';
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

// Invoice status sync (ADR-072): pulls the status and payment facts of the
// invoices Stocdup created in the distributor's accounting system and writes
// them onto the matching AccountingInvoiceExport rows. The accounting system
// is the system of record for invoices and payments (ADR-006); Stocdup only
// mirrors. Scheduled by AccountingSyncScheduler (every 15 min, only for
// connections with unsettled invoices) and by a manual Sync, both via the
// outbox; same IngestionRun lifecycle, cursor and full-reconcile rules as the
// mapping pulls (ADR-061). Provider-neutral: everything provider-specific is
// behind adapter.listInvoiceStatuses.
//
// Writing the facts, and everything a payment status change triggers (outbox
// event, order timeline audit row, order completion), is
// InvoicePaymentStateService's job — this processor only decides which rows
// the fetched snapshot applies to.
@Processor(ACCOUNTING_INVOICE_SYNC_QUEUE, { concurrency: 2, ...ACCOUNTING_WORKER_SETTINGS })
export class AccountingInvoiceSyncProcessor extends LoggedWorkerHost {
  private readonly logger = new Logger(AccountingInvoiceSyncProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountingConnectionService: AccountingConnectionService,
    private readonly adapters: AccountingAdapterRegistry,
    private readonly ingestionRuns: IngestionRunService,
    private readonly paymentState: InvoicePaymentStateService,
  ) {
    super();
  }

  async process(job: Job<OutboxEventJobData>): Promise<void> {
    const connectionId = job.data.aggregateId;
    const runIdFromPayload = (job.data.payload as { runId?: string } | undefined)?.runId ?? null;

    const connection = await this.prisma.accountingConnection.findUnique({ where: { id: connectionId } });
    if (!connection || connection.status !== AccountingConnectionStatus.CONNECTED) {
      this.logger.log(
        { event: 'accounting.sync.skipped', reason: connection ? 'not_connected' : 'connection_missing', connectionId, resourceType: RESOURCE_TYPE },
        `Invoice status sync skipped for connection ${connectionId}`,
      );
      if (runIdFromPayload) {
        await this.ingestionRuns.finalizeFailure(runIdFromPayload, 'Accounting connection is not connected');
      }
      return;
    }

    const runId =
      runIdFromPayload ??
      (await this.ingestionRuns.ensureRun({
        distributorId: connection.distributorId,
        sourceType: ACCOUNTING_SOURCE_TYPE,
        sourceRef: connection.id,
        resourceType: RESOURCE_TYPE,
        trigger: IngestionRunTrigger.SCHEDULED,
      }));
    const run = await this.ingestionRuns.claim(runId);
    if (!run) return;

    const full = shouldRunFull(run);
    const logFields = {
      provider: connection.provider,
      distributorId: connection.distributorId,
      connectionId: connection.id,
      externalOrgId: connection.externalOrganisationId,
      runId,
      resourceType: RESOURCE_TYPE,
      trigger: run.trigger,
      mode: full ? 'full' : 'incremental',
      jobId: job.id,
      eventId: job.data.eventId,
    };
    this.logger.log({ event: 'accounting.sync.started', ...logFields }, `Invoice status sync started (${logFields.mode})`);
    const started = Date.now();

    try {
      const adapter = this.adapters.get(connection.provider);
      if (!adapter.hasInvoiceReadScope(connection.scopes)) {
        throw new AccountingProviderError(
          'Reconnect the accounting integration to grant Stocdup permission to read invoices.',
          false,
          undefined,
          'SCOPE_MISSING',
        );
      }
      const tokenSet = await this.accountingConnectionService.getValidTokenSet(connection.distributorId, connection.provider);
      const fetched = await adapter.listInvoiceStatuses(tokenSet, connection.externalOrganisationId, full ? null : run.cursor);
      await this.ingestionRuns.setTotal(runId, fetched.records.length);

      const { matched, updated, statusChanges } = await this.applyStatuses(connection, fetched.records);

      await this.prisma.accountingConnection.update({ where: { id: connection.id }, data: { lastSyncedAt: new Date() } });
      await this.ingestionRuns.finalizeSuccess(
        runId,
        { recordsProcessed: fetched.records.length, recordsUpdated: updated, detailCount: statusChanges },
        { cursor: fetched.nextCursor, full },
      );
      this.logger.log(
        {
          event: 'accounting.sync.completed',
          ...logFields,
          durationMs: Date.now() - started,
          fetched: fetched.records.length,
          matched,
          updated,
          statusChanges,
        },
        `Invoice status sync complete: ${fetched.records.length} fetched, ${matched} ours, ${updated} changed, ${statusChanges} payment status change(s)`,
      );
    } catch (err) {
      await this.handleFailure(err, job, runId, logFields, started);
    }
  }

  // Same failure policy as the mapping pulls (AccountingSyncProcessorBase).
  private async handleFailure(
    err: unknown,
    job: Job<OutboxEventJobData>,
    runId: string,
    logFields: Record<string, unknown>,
    started: number,
  ): Promise<never> {
    const message = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - started;
    const permanent = err instanceof AccountingProviderError && !err.transient;
    const lastAttempt = (job.attemptsMade ?? 0) + 1 >= (job.opts?.attempts ?? 1);
    if (permanent || lastAttempt) {
      await this.ingestionRuns.finalizeFailure(runId, message);
    } else {
      await this.ingestionRuns.requeueForRetry(runId, message);
    }
    if (err instanceof AccountingProviderError) {
      this.logger.warn(
        { event: 'accounting.sync.failed', ...logFields, durationMs, code: err.code, statusCode: err.statusCode, transient: err.transient },
        `Invoice status sync failed: ${message}`,
      );
      if (permanent) throw new UnrecoverableError(message);
    } else {
      this.logger.error(
        { event: 'accounting.sync.failed', ...logFields, durationMs, err: loggableError(err) },
        'Invoice status sync failed unexpectedly',
      );
    }
    throw err;
  }

  // Writes provider facts onto our export rows. Invoices Stocdup didn't
  // create (or whose export row is gone) are ignored. Returns how many
  // fetched invoices were ours, how many rows changed, and how many derived
  // payment-status transitions were emitted.
  async applyStatuses(
    connection: AccountingConnection,
    records: AccountingExternalInvoiceStatus[],
  ): Promise<{ matched: number; updated: number; statusChanges: number }> {
    let matched = 0;
    let updated = 0;
    let statusChanges = 0;

    for (let i = 0; i < records.length; i += LOOKUP_CHUNK) {
      const chunk = records.slice(i, i + LOOKUP_CHUNK);
      const exports = (await this.prisma.accountingInvoiceExport.findMany({
        where: {
          accountingConnectionId: connection.id,
          status: AccountingInvoiceExportStatus.COMPLETED,
          externalInvoiceId: { in: chunk.map((r) => r.externalInvoiceId) },
        },
        include: { order: { select: { traderCustomerId: true, currency: true } } },
      })) as ExportWithOrder[];
      const byExternalId = new Map(exports.map((e) => [e.externalInvoiceId as string, e]));

      for (const record of chunk) {
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
            source: connection.provider,
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
