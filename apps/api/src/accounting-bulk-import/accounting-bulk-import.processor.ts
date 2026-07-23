import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { AccountingBulkImportJob, AccountingBulkImportJobStatus, AccountingBulkImportRecordType, Prisma } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingProductService, productInclude } from '../accounting/accounting-product.service';
import { AccountingContactService, contactInclude } from '../accounting/accounting-contact.service';
import { AdminNotificationsService } from '../admin-notifications/admin-notifications.service';
import { ACCOUNTING_BULK_IMPORT_QUEUE } from '../queues/queue.constants';

interface BulkImportJobData {
  eventId: string;
  aggregateType: string;
  aggregateId: string; // AccountingBulkImportJob id
  payload: unknown;
}

type ItemOutcome = 'imported' | 'matched' | 'skipped' | 'failed';

interface ItemResult {
  externalId: string;
  displayName: string;
  outcome: ItemOutcome;
  error?: string;
}

// A PROCESSING row younger than this is presumed to have a live attempt
// behind it — see the heartbeat below, which is what makes this threshold
// safe to keep short regardless of total batch size (unlike a one-shot job,
// a bulk import can legitimately run for many minutes on a large batch, so a
// flat age check alone can't tell "still working" from "worker died").
const PROCESSING_STALE_MS = 5 * 60 * 1000;
const HEARTBEAT_ITEM_INTERVAL = 25;
const HEARTBEAT_TIME_INTERVAL_MS = 5_000;

function tally(results: ItemResult[]) {
  return {
    importedCount: results.filter((r) => r.outcome === 'imported').length,
    matchedCount: results.filter((r) => r.outcome === 'matched').length,
    skippedCount: results.filter((r) => r.outcome === 'skipped').length,
    failedCount: results.filter((r) => r.outcome === 'failed').length,
  };
}

// Processes one AccountingBulkImportJob: resolves the target external ids
// (explicit, or re-derived from a filter — never a trusted client snapshot),
// then imports/matches each one by calling the SAME per-item service methods
// the single-row "Import as new" / "Confirm match" row actions use — no
// reimplementation of that logic here. One bad item never aborts the batch;
// only a systemic failure (e.g. resolving ids itself throws) fails the job.
@Processor(ACCOUNTING_BULK_IMPORT_QUEUE)
export class AccountingBulkImportProcessor extends WorkerHost {
  private readonly logger = new Logger(AccountingBulkImportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly productService: AccountingProductService,
    private readonly contactService: AccountingContactService,
    private readonly notifications: AdminNotificationsService,
  ) {
    super();
  }

  async process(job: Job<BulkImportJobData>): Promise<void> {
    const bulkJob = await this.claim(job.data.aggregateId);
    if (!bulkJob) return;

    try {
      const externalIds = await this.resolveIds(bulkJob);
      const conflictedIds =
        bulkJob.recordType === AccountingBulkImportRecordType.PRODUCT
          ? await this.productService.findConflictedProductIds(bulkJob.accountingConnectionId)
          : await this.contactService.findConflictedTradeRelationshipIds(bulkJob.accountingConnectionId);

      const results: ItemResult[] = [];
      let lastHeartbeat = Date.now();

      for (const externalId of externalIds) {
        results.push(await this.processOne(bulkJob, externalId, conflictedIds));

        if (results.length % HEARTBEAT_ITEM_INTERVAL === 0 || Date.now() - lastHeartbeat > HEARTBEAT_TIME_INTERVAL_MS) {
          await this.writeProgress(bulkJob.id, externalIds.length, results);
          lastHeartbeat = Date.now();
        }
      }

      await this.finalize(bulkJob, externalIds.length, results);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Bulk import job ${bulkJob.id} failed: ${message}`);
      await this.prisma.accountingBulkImportJob.update({
        where: { id: bulkJob.id },
        data: { status: AccountingBulkImportJobStatus.FAILED, completedAt: new Date() },
      });
      await this.notifications.create({
        organisationId: bulkJob.distributorId,
        userId: bulkJob.requestedByUserId,
        type: 'ACCOUNTING_BULK_IMPORT_COMPLETED',
        title: 'Bulk import failed',
        body: `The bulk import couldn't complete: ${message}`,
        linkPath: this.reportLinkPath(bulkJob),
        payload: { jobId: bulkJob.id, recordType: bulkJob.recordType },
      });
      throw err;
    }
  }

  // Mirrors AccountingInvoiceExportProcessor.claimExport's status-transition
  // claim, adapted for a job row that already exists at enqueue time (no
  // unique-constraint "create as claim" the way per-order export rows use).
  private async claim(jobId: string): Promise<AccountingBulkImportJob | null> {
    const bulkJob = await this.prisma.accountingBulkImportJob.findUnique({ where: { id: jobId } });
    if (!bulkJob) {
      this.logger.warn(`Bulk import job ${jobId} no longer exists — skipping`);
      return null;
    }
    if (bulkJob.status === AccountingBulkImportJobStatus.COMPLETED) {
      return null;
    }
    if (bulkJob.status === AccountingBulkImportJobStatus.PROCESSING) {
      const ageMs = Date.now() - bulkJob.updatedAt.getTime();
      if (ageMs < PROCESSING_STALE_MS) {
        this.logger.log(`Bulk import job ${bulkJob.id} already in flight — skipping`);
        return null;
      }
      this.logger.warn(`Bulk import job ${bulkJob.id} is stale PROCESSING (${Math.round(ageMs / 1000)}s) — resuming`);
    }
    return this.prisma.accountingBulkImportJob.update({
      where: { id: bulkJob.id },
      data: { status: AccountingBulkImportJobStatus.PROCESSING },
    });
  }

  private async resolveIds(bulkJob: AccountingBulkImportJob): Promise<string[]> {
    // JSON column round-trip: the DTO-validated shape at enqueue time is the
    // real type guarantee here, not this cast — see BulkImport*SelectionDto.
    const selection = bulkJob.selection as { ids?: string[]; filter?: Record<string, unknown> };
    if (selection.ids?.length) return selection.ids;
    const filter = selection.filter ?? {};
    return bulkJob.recordType === AccountingBulkImportRecordType.PRODUCT
      ? this.productService.resolveExternalIdsForFilter(
          bulkJob.distributorId,
          filter as Parameters<AccountingProductService['resolveExternalIdsForFilter']>[1],
        )
      : this.contactService.resolveExternalIdsForFilter(
          bulkJob.distributorId,
          filter as Parameters<AccountingContactService['resolveExternalIdsForFilter']>[1],
        );
  }

  private processOne(bulkJob: AccountingBulkImportJob, externalId: string, conflictedIds: Set<string>): Promise<ItemResult> {
    return bulkJob.recordType === AccountingBulkImportRecordType.PRODUCT
      ? this.processOneProduct(bulkJob, externalId, conflictedIds)
      : this.processOneContact(bulkJob, externalId, conflictedIds);
  }

  private async processOneProduct(
    bulkJob: AccountingBulkImportJob,
    externalId: string,
    conflictedProductIds: Set<string>,
  ): Promise<ItemResult> {
    const row = await this.prisma.externalAccountingProduct.findFirst({
      where: { id: externalId, accountingConnectionId: bulkJob.accountingConnectionId },
      include: productInclude,
    });
    if (!row) {
      return { externalId, displayName: externalId, outcome: 'failed', error: 'Accounting product not found' };
    }

    const formatted = this.productService.formatProduct(row, conflictedProductIds);
    const displayName = formatted.displayName;

    try {
      if (formatted.status === 'LINKED') {
        return { externalId, displayName, outcome: 'skipped', error: 'Already linked' };
      }
      if (formatted.status === 'NOT_SOLD' || formatted.status === 'INACTIVE') {
        return { externalId, displayName, outcome: 'skipped', error: 'Not eligible for import' };
      }
      if (
        bulkJob.honourSuggestions &&
        (formatted.status === 'SUGGESTED' || formatted.status === 'CONFLICT') &&
        formatted.suggestion
      ) {
        await this.productService.confirmSuggestion(bulkJob.distributorId, bulkJob.requestedByUserId, formatted.suggestion.id);
        return { externalId, displayName, outcome: 'matched' };
      }
      await this.productService.importAsNewProduct(bulkJob.distributorId, bulkJob.requestedByUserId, externalId, {});
      return { externalId, displayName, outcome: 'imported' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { externalId, displayName, outcome: 'failed', error: message };
    }
  }

  private async processOneContact(
    bulkJob: AccountingBulkImportJob,
    externalId: string,
    conflictedTradeRelationshipIds: Set<string>,
  ): Promise<ItemResult> {
    const row = await this.prisma.externalAccountingContact.findFirst({
      where: { id: externalId, accountingConnectionId: bulkJob.accountingConnectionId },
      include: contactInclude,
    });
    if (!row) {
      return { externalId, displayName: externalId, outcome: 'failed', error: 'Accounting contact not found' };
    }

    const formatted = this.contactService.formatContact(row, conflictedTradeRelationshipIds);
    const displayName = formatted.displayName;

    try {
      if (formatted.status === 'LINKED') {
        return { externalId, displayName, outcome: 'skipped', error: 'Already linked' };
      }
      if (formatted.status === 'NOT_A_CUSTOMER' || formatted.status === 'ARCHIVED') {
        return { externalId, displayName, outcome: 'skipped', error: 'Not eligible for import' };
      }
      if (
        bulkJob.honourSuggestions &&
        (formatted.status === 'SUGGESTED' || formatted.status === 'CONFLICT') &&
        formatted.suggestion
      ) {
        await this.contactService.confirmSuggestion(bulkJob.distributorId, bulkJob.requestedByUserId, formatted.suggestion.id);
        return { externalId, displayName, outcome: 'matched' };
      }
      await this.contactService.importAsNewCustomer(bulkJob.distributorId, bulkJob.requestedByUserId, externalId, {});
      return { externalId, displayName, outcome: 'imported' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { externalId, displayName, outcome: 'failed', error: message };
    }
  }

  // Heartbeat: bumps updatedAt (via Prisma's @updatedAt) so a genuinely
  // active job never looks stale to another worker's claim() check,
  // regardless of total batch size. Side benefit: GET bulk-import-jobs/:jobId
  // shows live progress on an in-flight job, not just the terminal report.
  private async writeProgress(jobId: string, totalCount: number, results: ItemResult[]): Promise<void> {
    await this.prisma.accountingBulkImportJob.update({
      where: { id: jobId },
      data: { totalCount, results: results as unknown as Prisma.InputJsonValue, ...tally(results) },
    });
  }

  private async finalize(bulkJob: AccountingBulkImportJob, totalCount: number, results: ItemResult[]): Promise<void> {
    const counts = tally(results);
    await this.prisma.accountingBulkImportJob.update({
      where: { id: bulkJob.id },
      data: {
        status: AccountingBulkImportJobStatus.COMPLETED,
        totalCount,
        results: results as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
        ...counts,
      },
    });

    const succeeded = counts.importedCount + counts.matchedCount;
    await this.notifications.create({
      organisationId: bulkJob.distributorId,
      userId: bulkJob.requestedByUserId,
      type: 'ACCOUNTING_BULK_IMPORT_COMPLETED',
      title: 'Bulk import complete',
      body: `${succeeded} of ${totalCount} imported/matched, ${counts.skippedCount} skipped, ${counts.failedCount} failed`,
      linkPath: this.reportLinkPath(bulkJob),
      payload: { jobId: bulkJob.id, recordType: bulkJob.recordType },
    });
  }

  private reportLinkPath(bulkJob: AccountingBulkImportJob): string {
    const type = bulkJob.recordType === AccountingBulkImportRecordType.PRODUCT ? 'products' : 'contacts';
    return `/integrations/accounting/bulk-imports/${bulkJob.id}?type=${type}`;
  }
}
