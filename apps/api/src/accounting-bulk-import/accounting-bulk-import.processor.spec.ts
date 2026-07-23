import { AccountingBulkImportJobStatus, AccountingBulkImportRecordType } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingProductService } from '../accounting/accounting-product.service';
import { AccountingContactService } from '../accounting/accounting-contact.service';
import { AdminNotificationsService } from '../admin-notifications/admin-notifications.service';
import { AccountingBulkImportProcessor } from './accounting-bulk-import.processor';

const makeJob = (jobId = 'job-1') =>
  ({
    id: 'evt-1',
    name: 'AccountingBulkImportRequested',
    data: { eventId: 'evt-1', aggregateType: 'AccountingBulkImportJob', aggregateId: jobId, payload: {} },
  }) as unknown as Job;

const makeBulkJob = (overrides: Record<string, unknown> = {}) => ({
  id: 'job-1',
  distributorId: 'dist-1',
  accountingConnectionId: 'conn-1',
  recordType: AccountingBulkImportRecordType.PRODUCT,
  requestedByUserId: 'user-1',
  status: AccountingBulkImportJobStatus.QUEUED,
  honourSuggestions: false,
  selection: { ids: ['ext-1'] },
  totalCount: 0,
  importedCount: 0,
  matchedCount: 0,
  skippedCount: 0,
  failedCount: 0,
  results: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  completedAt: null,
  ...overrides,
});

const makeExternalProductRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'ext-1',
  displayName: 'Widget',
  ...overrides,
});

describe('AccountingBulkImportProcessor', () => {
  let processor: AccountingBulkImportProcessor;
  let prisma: {
    accountingBulkImportJob: { findUnique: jest.Mock; update: jest.Mock };
    externalAccountingProduct: { findFirst: jest.Mock };
    externalAccountingContact: { findFirst: jest.Mock };
  };
  let productService: {
    resolveExternalIdsForFilter: jest.Mock;
    findConflictedProductIds: jest.Mock;
    formatProduct: jest.Mock;
    confirmSuggestion: jest.Mock;
    importAsNewProduct: jest.Mock;
  };
  let contactService: {
    resolveExternalIdsForFilter: jest.Mock;
    findConflictedTradeRelationshipIds: jest.Mock;
    formatContact: jest.Mock;
    confirmSuggestion: jest.Mock;
    importAsNewCustomer: jest.Mock;
  };
  let notifications: { create: jest.Mock };
  // The DB row currently "on record" — findUnique reads it, update merges
  // into it, exactly like a real row. Setting the fixture via setJob() rather
  // than a bare findUnique.mockResolvedValue keeps the two in sync (a naive
  // update mock that merges onto a fresh default, instead of this tracked
  // state, would silently clobber whatever a test configured on the job).
  let currentJob: ReturnType<typeof makeBulkJob> | null;

  function setJob(job: ReturnType<typeof makeBulkJob> | null) {
    currentJob = job;
  }

  beforeEach(() => {
    currentJob = makeBulkJob();
    prisma = {
      accountingBulkImportJob: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(currentJob)),
        update: jest.fn().mockImplementation(({ data }) => {
          currentJob = { ...currentJob, ...data };
          return Promise.resolve(currentJob);
        }),
      },
      externalAccountingProduct: { findFirst: jest.fn() },
      externalAccountingContact: { findFirst: jest.fn() },
    };
    productService = {
      resolveExternalIdsForFilter: jest.fn(),
      findConflictedProductIds: jest.fn().mockResolvedValue(new Set()),
      formatProduct: jest.fn(),
      confirmSuggestion: jest.fn().mockResolvedValue(undefined),
      importAsNewProduct: jest.fn().mockResolvedValue({ id: 'prod-1' }),
    };
    contactService = {
      resolveExternalIdsForFilter: jest.fn(),
      findConflictedTradeRelationshipIds: jest.fn().mockResolvedValue(new Set()),
      formatContact: jest.fn(),
      confirmSuggestion: jest.fn().mockResolvedValue(undefined),
      importAsNewCustomer: jest.fn().mockResolvedValue({ id: 'rel-1' }),
    };
    notifications = { create: jest.fn().mockResolvedValue(undefined) };

    processor = new AccountingBulkImportProcessor(
      prisma as unknown as PrismaService,
      productService as unknown as AccountingProductService,
      contactService as unknown as AccountingContactService,
      notifications as unknown as AdminNotificationsService,
    );
  });

  it('no-ops when the job no longer exists', async () => {
    setJob(null);

    await processor.process(makeJob());

    expect(prisma.accountingBulkImportJob.update).not.toHaveBeenCalled();
  });

  it('no-ops when the job is already COMPLETED', async () => {
    setJob(makeBulkJob({ status: AccountingBulkImportJobStatus.COMPLETED }));

    await processor.process(makeJob());

    expect(prisma.accountingBulkImportJob.update).not.toHaveBeenCalled();
  });

  it('skips a PROCESSING job with a recent heartbeat instead of reprocessing it', async () => {
    setJob(
      makeBulkJob({ status: AccountingBulkImportJobStatus.PROCESSING, updatedAt: new Date() }),
    );

    await processor.process(makeJob());

    expect(prisma.accountingBulkImportJob.update).not.toHaveBeenCalled();
    expect(productService.resolveExternalIdsForFilter).not.toHaveBeenCalled();
  });

  it('reclaims and reprocesses a stale PROCESSING job', async () => {
    const staleDate = new Date(Date.now() - 10 * 60 * 1000);
    setJob(
      makeBulkJob({ status: AccountingBulkImportJobStatus.PROCESSING, updatedAt: staleDate, selection: { filter: {} } }),
    );
    productService.resolveExternalIdsForFilter.mockResolvedValue([]);

    await processor.process(makeJob());

    expect(prisma.accountingBulkImportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: AccountingBulkImportJobStatus.PROCESSING } }),
    );
  });

  it('uses explicit ids verbatim instead of resolving a filter', async () => {
    setJob(makeBulkJob({ selection: { ids: ['ext-1'] } }));
    prisma.externalAccountingProduct.findFirst.mockResolvedValue(makeExternalProductRow());
    productService.formatProduct.mockReturnValue({ displayName: 'Widget', status: 'READY_TO_IMPORT', suggestion: null });

    await processor.process(makeJob());

    expect(productService.resolveExternalIdsForFilter).not.toHaveBeenCalled();
    expect(productService.importAsNewProduct).toHaveBeenCalledWith('dist-1', 'user-1', 'ext-1', {});
  });

  it('resolves ids from the filter when no explicit ids are given', async () => {
    setJob(
      makeBulkJob({ selection: { filter: { status: ['READY_TO_IMPORT'] } } }),
    );
    productService.resolveExternalIdsForFilter.mockResolvedValue(['ext-1']);
    prisma.externalAccountingProduct.findFirst.mockResolvedValue(makeExternalProductRow());
    productService.formatProduct.mockReturnValue({ displayName: 'Widget', status: 'READY_TO_IMPORT', suggestion: null });

    await processor.process(makeJob());

    expect(productService.resolveExternalIdsForFilter).toHaveBeenCalledWith('dist-1', { status: ['READY_TO_IMPORT'] });
  });

  it('skips an already-LINKED item without calling import or confirm', async () => {
    setJob(makeBulkJob());
    prisma.externalAccountingProduct.findFirst.mockResolvedValue(makeExternalProductRow());
    productService.formatProduct.mockReturnValue({ displayName: 'Widget', status: 'LINKED', suggestion: null });

    await processor.process(makeJob());

    expect(productService.importAsNewProduct).not.toHaveBeenCalled();
    expect(productService.confirmSuggestion).not.toHaveBeenCalled();
    const finalUpdate = prisma.accountingBulkImportJob.update.mock.calls.at(-1)[0];
    expect(finalUpdate.data.results[0]).toMatchObject({ outcome: 'skipped' });
    expect(finalUpdate.data.skippedCount).toBe(1);
  });

  it('skips an ineligible-status item (NOT_SOLD) without calling import or confirm', async () => {
    setJob(makeBulkJob());
    prisma.externalAccountingProduct.findFirst.mockResolvedValue(makeExternalProductRow());
    productService.formatProduct.mockReturnValue({ displayName: 'Widget', status: 'NOT_SOLD', suggestion: null });

    await processor.process(makeJob());

    expect(productService.importAsNewProduct).not.toHaveBeenCalled();
    const finalUpdate = prisma.accountingBulkImportJob.update.mock.calls.at(-1)[0];
    expect(finalUpdate.data.results[0]).toMatchObject({ outcome: 'skipped' });
  });

  it('confirms the suggestion (outcome matched) when honourSuggestions is true and the item is SUGGESTED', async () => {
    setJob(makeBulkJob({ honourSuggestions: true }));
    prisma.externalAccountingProduct.findFirst.mockResolvedValue(makeExternalProductRow());
    productService.formatProduct.mockReturnValue({
      displayName: 'Widget',
      status: 'SUGGESTED',
      suggestion: { id: 'sugg-1' },
    });

    await processor.process(makeJob());

    expect(productService.confirmSuggestion).toHaveBeenCalledWith('dist-1', 'user-1', 'sugg-1');
    expect(productService.importAsNewProduct).not.toHaveBeenCalled();
    const finalUpdate = prisma.accountingBulkImportJob.update.mock.calls.at(-1)[0];
    expect(finalUpdate.data.results[0]).toMatchObject({ outcome: 'matched' });
  });

  it('imports as new (ignoring the suggestion) when honourSuggestions is false and the item is SUGGESTED', async () => {
    setJob(makeBulkJob({ honourSuggestions: false }));
    prisma.externalAccountingProduct.findFirst.mockResolvedValue(makeExternalProductRow());
    productService.formatProduct.mockReturnValue({
      displayName: 'Widget',
      status: 'SUGGESTED',
      suggestion: { id: 'sugg-1' },
    });

    await processor.process(makeJob());

    expect(productService.confirmSuggestion).not.toHaveBeenCalled();
    expect(productService.importAsNewProduct).toHaveBeenCalledWith('dist-1', 'user-1', 'ext-1', {});
    const finalUpdate = prisma.accountingBulkImportJob.update.mock.calls.at(-1)[0];
    expect(finalUpdate.data.results[0]).toMatchObject({ outcome: 'imported' });
  });

  it('records a per-item failure without aborting the rest of the batch', async () => {
    setJob(makeBulkJob({ selection: { ids: ['ext-1', 'ext-2'] } }));
    prisma.externalAccountingProduct.findFirst
      .mockResolvedValueOnce(makeExternalProductRow({ id: 'ext-1' }))
      .mockResolvedValueOnce(makeExternalProductRow({ id: 'ext-2', displayName: 'Gadget' }));
    productService.formatProduct.mockReturnValue({ displayName: 'Widget', status: 'READY_TO_IMPORT', suggestion: null });
    productService.importAsNewProduct
      .mockRejectedValueOnce(new Error('SKU collision'))
      .mockResolvedValueOnce({ id: 'prod-2' });

    await processor.process(makeJob());

    expect(productService.importAsNewProduct).toHaveBeenCalledTimes(2);
    const finalUpdate = prisma.accountingBulkImportJob.update.mock.calls.at(-1)[0];
    expect(finalUpdate.data.results).toEqual([
      expect.objectContaining({ externalId: 'ext-1', outcome: 'failed', error: 'SKU collision' }),
      expect.objectContaining({ externalId: 'ext-2', outcome: 'imported' }),
    ]);
    expect(finalUpdate.data.failedCount).toBe(1);
    expect(finalUpdate.data.importedCount).toBe(1);
  });

  it('marks the job COMPLETED and notifies the requesting user with the counts and a report link', async () => {
    setJob(makeBulkJob());
    prisma.externalAccountingProduct.findFirst.mockResolvedValue(makeExternalProductRow());
    productService.formatProduct.mockReturnValue({ displayName: 'Widget', status: 'READY_TO_IMPORT', suggestion: null });

    await processor.process(makeJob());

    const finalUpdate = prisma.accountingBulkImportJob.update.mock.calls.at(-1)[0];
    expect(finalUpdate.data.status).toBe(AccountingBulkImportJobStatus.COMPLETED);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organisationId: 'dist-1',
        userId: 'user-1',
        linkPath: '/integrations/accounting/bulk-imports/job-1?type=products',
      }),
    );
  });

  it('marks the job FAILED and notifies on a systemic failure, without swallowing the error', async () => {
    setJob(makeBulkJob({ selection: { filter: {} } }));
    productService.resolveExternalIdsForFilter.mockRejectedValue(new Error('No active accounting connection'));

    await expect(processor.process(makeJob())).rejects.toThrow('No active accounting connection');

    const finalUpdate = prisma.accountingBulkImportJob.update.mock.calls.at(-1)[0];
    expect(finalUpdate.data.status).toBe(AccountingBulkImportJobStatus.FAILED);
    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Bulk import failed' }));
  });

  it('writes progress heartbeats partway through a batch larger than the heartbeat interval', async () => {
    const ids = Array.from({ length: 30 }, (_, i) => `ext-${i}`);
    setJob(makeBulkJob({ selection: { ids } }));
    prisma.externalAccountingProduct.findFirst.mockImplementation(({ where }) =>
      Promise.resolve(makeExternalProductRow({ id: where.id })),
    );
    productService.formatProduct.mockReturnValue({ displayName: 'Widget', status: 'READY_TO_IMPORT', suggestion: null });

    await processor.process(makeJob());

    // 1 claim update + at least 1 heartbeat (every 25 items) + 1 final update
    expect(prisma.accountingBulkImportJob.update.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('routes CONTACT jobs through the contact service instead of the product service', async () => {
    setJob(
      makeBulkJob({ recordType: AccountingBulkImportRecordType.CONTACT, selection: { ids: ['ext-1'] } }),
    );
    prisma.externalAccountingContact.findFirst.mockResolvedValue({ id: 'ext-1', displayName: 'Acme Bar' });
    contactService.formatContact.mockReturnValue({ displayName: 'Acme Bar', status: 'READY_TO_IMPORT', suggestion: null });

    await processor.process(makeJob());

    expect(contactService.importAsNewCustomer).toHaveBeenCalledWith('dist-1', 'user-1', 'ext-1', {});
    expect(productService.importAsNewProduct).not.toHaveBeenCalled();
    const finalUpdate = prisma.accountingBulkImportJob.update.mock.calls.at(-1)[0];
    expect(finalUpdate.data.status).toBe(AccountingBulkImportJobStatus.COMPLETED);
  });
});
