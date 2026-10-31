import { Processor } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ACCOUNTING_ACCOUNT_SYNC_QUEUE } from '../queues/queue.constants';
import { IngestionRunService } from '../ingestion/ingestion-run.service';
import { AdminNotificationsService } from '../admin-notifications/admin-notifications.service';
import { AccountingConnectionService } from '../accounting/accounting-connection.service';
import { AccountingAdapterRegistry } from '../accounting/adapters/accounting-adapter.registry';
import { ACCOUNTING_WORKER_SETTINGS } from '../accounting/accounting-backoff';
import { AccountingConnectionWithOrganisation, organisationScope } from '../accounting/accounting-organisation';
import { AccountingPullProcessorBase, PullContext, PullResult } from '../accounting/sync/accounting-pull-processor.base';

// Part of the provider-neutral accounting integration framework — overview and
// provider contract in accounting/adapters/accounting-connection-adapter.interface.ts.
//
// Sales account sync (ADR-079) — a pull (see AccountingPullProcessorBase for
// the pattern). Caches the sales accounts in the distributor's chart of
// accounts, which the organisation's default sales account is chosen from;
// invoice export reads the default's code from this cache, so the code it
// sends is always the one the last sync saw. Nothing in Stocdup is mapped to
// these rows, so this extends the pull base directly rather than
// AccountingSyncProcessorBase (no matching, no suggestions, no review).
//
// Consumes AccountingAccountSyncRequested (scheduled, and manual Sync).
// Every pull is full, like tax rates: an account missing from the fetch is
// marked inactive. When the default account stops being active, the
// distributor's admins are told to choose another.
// Prisma's 5s default is tight for a long chart of accounts, one upsert each.
const WRITE_TRANSACTION_TIMEOUT_MS = 60_000;

@Processor(ACCOUNTING_ACCOUNT_SYNC_QUEUE, { concurrency: 2, ...ACCOUNTING_WORKER_SETTINGS })
export class AccountingAccountSyncProcessor extends AccountingPullProcessorBase {
  protected readonly logger = new Logger(AccountingAccountSyncProcessor.name);
  protected readonly recordNoun = 'account';
  protected readonly resourceType = 'account';

  constructor(
    prisma: PrismaService,
    accountingConnectionService: AccountingConnectionService,
    adapters: AccountingAdapterRegistry,
    ingestionRuns: IngestionRunService,
    private readonly adminNotifications: AdminNotificationsService,
  ) {
    super(prisma, accountingConnectionService, adapters, ingestionRuns);
  }

  protected async pull({ connection, adapter, tokenSet, progress }: PullContext): Promise<PullResult> {
    const accounts = await adapter.listSalesAccounts(tokenSet, connection.organisation.externalOrganisationId);
    await progress.setTotal(accounts.length);

    // One transaction, so a failure rolls the account changes back too: the
    // retry still sees the default as active and sends the notification, which
    // commits with the change it reports.
    const { updated, deactivated } = await this.prisma.$transaction(
      async (tx) => {
        const defaultWasActive = await this.isDefaultAccountActive(tx, connection);

        const now = new Date();
        const seenIds: string[] = [];
        for (const account of accounts) {
          const shared = {
            code: account.code,
            displayName: account.displayName,
            isActive: account.isActive,
            lastSyncedAt: now,
            rawProviderData: account.raw as Prisma.InputJsonValue,
          };
          const row = await tx.externalAccountingAccount.upsert({
            where: {
              accountingOrganisationId_externalAccountId: {
                accountingOrganisationId: connection.accountingOrganisationId,
                externalAccountId: account.externalId,
              },
            },
            create: { ...organisationScope(connection), provider: connection.provider, externalAccountId: account.externalId, ...shared },
            update: shared,
          });
          seenIds.push(row.id);
        }

        // Deleted in the provider, or no longer a coded sales account.
        const { count } = await tx.externalAccountingAccount.updateMany({
          where: { ...organisationScope(connection), id: { notIn: seenIds }, isActive: true },
          data: { isActive: false },
        });

        if (defaultWasActive && !(await this.isDefaultAccountActive(tx, connection))) {
          await this.notifyDefaultAccountInactive(tx, connection);
        }
        return { updated: seenIds.length, deactivated: count };
      },
      { timeout: WRITE_TRANSACTION_TIMEOUT_MS },
    );

    return {
      counts: { recordsProcessed: accounts.length, recordsUpdated: updated, recordsRemoved: deactivated },
      nextCursor: null,
      summary: {
        fields: { fetched: accounts.length, deactivated },
        message: `Account sync complete: ${accounts.length} fetched, ${deactivated} no longer listed`,
      },
    };
  }

  private async isDefaultAccountActive(tx: Prisma.TransactionClient, connection: AccountingConnectionWithOrganisation): Promise<boolean> {
    const organisation = await tx.accountingOrganisation.findUnique({
      where: { id: connection.accountingOrganisationId },
      select: { invoiceDefaultAccount: { select: { isActive: true } } },
    });
    return organisation?.invoiceDefaultAccount?.isActive ?? false;
  }

  private async notifyDefaultAccountInactive(tx: Prisma.TransactionClient, connection: AccountingConnectionWithOrganisation): Promise<void> {
    const provider = this.adapters.displayName(connection.provider);
    await this.adminNotifications.notifyOrganisationAdmins(connection.distributorId, {
      type: 'ACCOUNTING_DEFAULT_ACCOUNT_INACTIVE',
      title: `Default sales account no longer active in ${provider}`,
      body: `Your default sales account was archived or deleted in ${provider}. Until you choose another, invoice lines without an account of their own are sent without one, and submitted or authorised invoices may fail.`,
      linkPath: '/integrations/accounting?tab=settings',
      payload: { distributorId: connection.distributorId, accountingOrganisationId: connection.accountingOrganisationId },
    }, tx);
  }
}
