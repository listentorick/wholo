import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { IngestionRunService } from '../ingestion/ingestion-run.service';
import { AdminNotificationsService } from '../admin-notifications/admin-notifications.service';
import { AccountingConnectionService } from '../accounting/accounting-connection.service';
import { AccountingAdapterRegistry } from '../accounting/adapters/accounting-adapter.registry';
import { AccountingExternalAccount } from '../accounting/adapters/accounting-connection-adapter.interface';
import { AccountingAccountSyncProcessor } from './accounting-account-sync.processor';

const connection = {
  id: 'conn-1',
  distributorId: 'dist-1',
  provider: 'XERO',
  status: 'CONNECTED',
  accountingOrganisationId: 'acc-org-1',
  organisation: { id: 'acc-org-1', externalOrganisationId: 'tenant-1', name: 'Acme Wines' },
  scopes: 'openid accounting.settings',
};

interface Row {
  id: string;
  accountingOrganisationId: string;
  externalAccountId: string;
  code: string;
  displayName: string;
  isActive: boolean;
}

const account = (over: Partial<AccountingExternalAccount> = {}): AccountingExternalAccount => ({
  externalId: 'acc-200',
  code: '200',
  displayName: 'Sales',
  isActive: true,
  raw: {},
  ...over,
});

const job = { id: 'job-1', name: 'AccountingAccountSyncRequested', data: { eventId: 'evt-1', aggregateType: 'AccountingConnection', aggregateId: 'conn-1', payload: { runId: 'run-1' } } } as unknown as Job;

describe('AccountingAccountSyncProcessor', () => {
  let rows: Row[];
  let defaultAccountId: string | null;
  let fetched: AccountingExternalAccount[];
  let notify: jest.Mock;
  let finalizeSuccess: jest.Mock;
  let processor: AccountingAccountSyncProcessor;

  beforeEach(() => {
    rows = [];
    defaultAccountId = null;
    fetched = [];
    notify = jest.fn();
    finalizeSuccess = jest.fn();
    let nextId = 1;
    // A small in-memory stand-in for the two tables the sync touches.
    const prisma = {
      accountingConnection: { findUnique: jest.fn().mockResolvedValue(connection), update: jest.fn() },
      externalAccountingAccount: {
        upsert: jest.fn(async ({ where, create, update }) => {
          const key = where.accountingOrganisationId_externalAccountId;
          const existing = rows.find(
            (r) => r.accountingOrganisationId === key.accountingOrganisationId && r.externalAccountId === key.externalAccountId,
          );
          if (existing) return Object.assign(existing, update);
          const row = { id: `row-${nextId++}`, ...create };
          rows.push(row);
          return row;
        }),
        updateMany: jest.fn(async ({ where, data }) => {
          const hit = rows.filter(
            (r) => r.accountingOrganisationId === where.accountingOrganisationId && !where.id.notIn.includes(r.id) && r.isActive,
          );
          hit.forEach((r) => Object.assign(r, data));
          return { count: hit.length };
        }),
      },
      accountingOrganisation: {
        findUnique: jest.fn(async () => {
          const row = rows.find((r) => r.id === defaultAccountId);
          return { invoiceDefaultAccount: row ? { isActive: row.isActive } : null };
        }),
      },
    };
    Object.assign(prisma, { $transaction: jest.fn((work) => work(prisma)) });
    const ingestionRuns = {
      ensureRun: jest.fn(),
      claim: jest.fn().mockResolvedValue({ id: 'run-1', trigger: 'SCHEDULED', cursor: null, lastFullRunAt: null }),
      setTotal: jest.fn(),
      heartbeat: jest.fn(),
      finalizeSuccess,
      finalizeFailure: jest.fn(),
      requeueForRetry: jest.fn(),
    };
    processor = new AccountingAccountSyncProcessor(
      prisma as unknown as PrismaService,
      { getValidTokenSet: jest.fn().mockResolvedValue({}) } as unknown as AccountingConnectionService,
      {
        get: () => ({ listSalesAccounts: jest.fn(async () => fetched) }),
        displayName: () => 'Xero',
      } as unknown as AccountingAdapterRegistry,
      ingestionRuns as unknown as IngestionRunService,
      { notifyOrganisationAdmins: notify } as unknown as AdminNotificationsService,
    );
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  it("caches the provider's sales accounts for the organisation", async () => {
    fetched = [account(), account({ externalId: 'acc-210', code: '210', displayName: 'Old Sales', isActive: false })];

    await processor.process(job);

    expect(rows).toEqual([
      expect.objectContaining({ accountingOrganisationId: 'acc-org-1', externalAccountId: 'acc-200', code: '200', isActive: true }),
      expect.objectContaining({ accountingOrganisationId: 'acc-org-1', externalAccountId: 'acc-210', code: '210', isActive: false }),
    ]);
    expect(finalizeSuccess).toHaveBeenCalled();
  });

  it('keeps the same row when an account is recoded, so a default pointing at it follows the new code', async () => {
    fetched = [account()];
    await processor.process(job);
    const rowId = rows[0].id;

    fetched = [account({ code: '4000' })];
    await processor.process(job);

    expect(rows).toEqual([expect.objectContaining({ id: rowId, code: '4000' })]);
  });

  it('marks accounts the provider no longer lists as inactive', async () => {
    fetched = [account(), account({ externalId: 'acc-260', code: '260' })];
    await processor.process(job);

    fetched = [account()];
    await processor.process(job);

    expect(rows.find((r) => r.externalAccountId === 'acc-260')?.isActive).toBe(false);
  });

  it("tells the distributor's admins when the default account stops being active", async () => {
    fetched = [account()];
    await processor.process(job);
    defaultAccountId = rows[0].id;

    fetched = [account({ isActive: false })];
    await processor.process(job);

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      'dist-1',
      expect.objectContaining({ type: 'ACCOUNTING_DEFAULT_ACCOUNT_INACTIVE', linkPath: '/integrations/accounting?tab=settings' }),
      expect.anything(),
    );

    // Already inactive: no repeat on the next sync.
    await processor.process(job);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('says nothing when there is no default, or it is still active', async () => {
    fetched = [account()];
    await processor.process(job);
    defaultAccountId = rows[0].id;
    await processor.process(job);

    expect(notify).not.toHaveBeenCalled();
  });
});
