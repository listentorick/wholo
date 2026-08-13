import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import {
  AccountingConnection,
  AccountingConnectionStatus,
  AccountingInvoiceTargetStatus,
  AccountingProvider,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AdminNotificationsService } from '../admin-notifications/admin-notifications.service';
import { TokenEncryptionService } from './token-encryption.service';
import { AccountingAdapterRegistry } from './adapters/accounting-adapter.registry';
import { AccountingOAuthError } from './accounting-oauth.error';
import { AccountingTokenSet } from './adapters/accounting-connection-adapter.interface';
import { AccountingProviderError } from './adapters/accounting-provider.error';
import { AccountingRefreshLock, AccountingRefreshLockService } from './accounting-refresh-lock.service';

const STATE_TTL_MS = 10 * 60 * 1000;
// Refresh if the access token has less than this much life left. Xero access
// tokens live ~30 min, so 5 min is a comfortable margin without refreshing
// needlessly often.
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
// A waiter (one that lost the race to acquire the refresh lock) keeps
// polling until this deadline — comfortably longer than one lock TTL plus
// the time a refresh actually takes, so a legitimate in-progress refresh
// always has time to finish and be picked up before a waiter gives up.
const WAITER_DEADLINE_MS = 45_000;
const POLL_BASE_MS = 1_000;
const POLL_JITTER_MS = 500;

function providerDisplayName(provider: AccountingProvider): string {
  switch (provider) {
    case AccountingProvider.XERO:
      return 'Xero';
    default:
      return provider;
  }
}

@Injectable()
export class AccountingConnectionService {
  private readonly logger = new Logger(AccountingConnectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenEncryption: TokenEncryptionService,
    private readonly adapters: AccountingAdapterRegistry,
    private readonly refreshLock: AccountingRefreshLockService,
    private readonly adminNotifications: AdminNotificationsService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async getConnectionStatus(distributorId: string) {
    const connection = await this.findCurrentConnection(distributorId);
    if (!connection) return null;
    return this.toConnectionStatus(connection);
  }

  // Per-connection (not per-distributor) settings: the invoice target status
  // is about how this provider's invoices are raised, so it lives and dies
  // with the connection.
  async updateConnectionSettings(
    distributorId: string,
    settings: { invoiceExportTargetStatus: AccountingInvoiceTargetStatus },
  ) {
    const connection = await this.findCurrentConnection(distributorId);
    if (!connection) {
      throw new NotFoundException('No accounting connection exists for this distributor');
    }
    const updated = await this.prisma.accountingConnection.update({
      where: { id: connection.id },
      data: { invoiceExportTargetStatus: settings.invoiceExportTargetStatus },
    });
    return this.toConnectionStatus(updated);
  }

  // Include ERROR so a broken connection (e.g. refresh failed, revoked
  // access) is surfaced distinctly rather than looking indistinguishable
  // from "never connected".
  private findCurrentConnection(distributorId: string) {
    return this.prisma.accountingConnection.findFirst({
      where: {
        distributorId,
        status: { in: [AccountingConnectionStatus.CONNECTED, AccountingConnectionStatus.ERROR] },
      },
      // Without this, a stale ERROR row and a freshly-reconnected CONNECTED
      // row can both match and findFirst's pick is otherwise unordered —
      // always surface the most recent one.
      orderBy: { connectedAt: 'desc' },
    });
  }

  private toConnectionStatus(connection: AccountingConnection) {
    return {
      provider: connection.provider,
      status: connection.status,
      externalOrganisationName: connection.externalOrganisationName,
      connectedAt: connection.connectedAt,
      lastSyncedAt: connection.lastSyncedAt,
      invoiceExportTargetStatus: connection.invoiceExportTargetStatus,
    };
  }

  async createAuthorizationUrl(
    distributorId: string,
    connectedByUserId: string,
    provider: AccountingProvider,
  ): Promise<{ authorizationUrl: string }> {
    const state = randomBytes(32).toString('hex');
    await this.prisma.accountingOAuthState.create({
      data: {
        state,
        provider,
        distributorId,
        connectedByUserId,
        expiresAt: new Date(Date.now() + STATE_TTL_MS),
      },
    });
    const authorizationUrl = await this.adapters.get(provider).buildAuthorizationUrl(state);
    return { authorizationUrl };
  }

  // Called only by the public callback controller — code/state come straight
  // from the provider's browser redirect, never from an authenticated caller.
  async handleCallback(
    callbackUrl: string,
    code: string | undefined,
    state: string | undefined,
  ): Promise<void> {
    if (!state) {
      throw new AccountingOAuthError('invalid_state');
    }

    const stateRow = await this.prisma.accountingOAuthState.findUnique({ where: { state } });
    if (!stateRow) {
      throw new AccountingOAuthError('invalid_state');
    }
    // Single-use: delete before any external call so a retried/duplicate
    // callback can't reuse it.
    await this.prisma.accountingOAuthState.delete({ where: { id: stateRow.id } });

    if (stateRow.expiresAt.getTime() < Date.now()) {
      throw new AccountingOAuthError('expired_state');
    }

    if (!code) {
      // Distributor declined consent in Xero (error=access_denied) — the
      // state row is still consumed above so it can't be replayed.
      throw new AccountingOAuthError('access_denied');
    }

    const adapter = this.adapters.get(stateRow.provider);

    let tokenSet;
    let organisations;
    try {
      tokenSet = await adapter.exchangeCodeForToken(callbackUrl, state);
      organisations = await adapter.listAvailableOrganisations(tokenSet);
    } catch (err) {
      this.logger.error(
        `Accounting token exchange failed for distributor ${stateRow.distributorId}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new AccountingOAuthError('exchange_failed');
    }

    if (organisations.length === 0) {
      throw new AccountingOAuthError('no_organisation');
    }
    if (organisations.length > 1) {
      this.logger.warn(
        `Accounting authorization for distributor ${stateRow.distributorId} returned ` +
          `${organisations.length} organisations; using the first (multi-org selection is not yet supported)`,
      );
    }
    const organisation = organisations[0];
    const encryptedCredentialData = this.tokenEncryption.encrypt(JSON.stringify(tokenSet));
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.accountingConnection.updateMany({
        // ERROR included, not just CONNECTED — a broken connection must be
        // retired by a successful reconnect too, or it lingers as an
        // orphaned row that findCurrentConnection could still surface.
        where: {
          distributorId: stateRow.distributorId,
          status: { in: [AccountingConnectionStatus.CONNECTED, AccountingConnectionStatus.ERROR] },
        },
        data: { status: AccountingConnectionStatus.DISCONNECTED, disconnectedAt: now },
      });
      await tx.accountingConnection.create({
        data: {
          distributorId: stateRow.distributorId,
          provider: stateRow.provider,
          status: AccountingConnectionStatus.CONNECTED,
          externalOrganisationId: organisation.externalId,
          externalOrganisationName: organisation.name,
          scopes: tokenSet.scope,
          encryptedCredentialData,
          connectedByUserId: stateRow.connectedByUserId,
          connectedAt: now,
        },
      });
    });
  }

  // The single place any Xero-API-calling code goes through to get a usable
  // token — callers never touch encryptedCredentialData or the adapter's
  // refreshAccessToken directly. Provider-neutral: refresh mechanics are
  // entirely delegated to whichever adapter the registry resolves.
  //
  // No DB transaction wraps this — mutual exclusion for the actual refresh is
  // a Redis lock (AccountingRefreshLockService), not a held-open Postgres
  // transaction, so a slow/unavailable Xero never pins a pooled DB
  // connection. See the design notes on AccountingRefreshLockService and the
  // "Resilient Xero token refresh" plan for the full reasoning: a fixed-TTL
  // lock alone isn't a sufficient guarantee (the lock renews its own lease
  // while held, see AccountingRefreshLock), so performRefresh's persistence
  // is a compare-and-swap as defense-in-depth, not just a blind write.
  async getValidTokenSet(distributorId: string, provider: AccountingProvider): Promise<AccountingTokenSet> {
    const deadline = Date.now() + WAITER_DEADLINE_MS;

    for (;;) {
      const connection = await this.prisma.accountingConnection.findFirst({
        where: { distributorId, provider },
        orderBy: { connectedAt: 'desc' },
      });

      // Status-agnostic on purpose: a CONNECTED-only lookup would make every
      // caller after the one that first discovers a dead connection see a
      // generic NotFoundException instead of the real (permanent) reason —
      // invisible to invoice-export's transient/permanent retry check, which
      // would then burn all its retries identically to a network blip.
      if (!connection || connection.status === AccountingConnectionStatus.DISCONNECTED) {
        throw new NotFoundException('No active accounting connection for this distributor');
      }
      if (
        connection.status === AccountingConnectionStatus.ERROR ||
        connection.status === AccountingConnectionStatus.REVOKED
      ) {
        // Same stable error every time, regardless of who asks or how many
        // times — reconstructed from the stored message, no Xero call.
        throw new AccountingProviderError(
          connection.lastErrorMessage ?? 'Accounting connection requires reconnection',
          false,
        );
      }

      const tokenSet: AccountingTokenSet = JSON.parse(this.tokenEncryption.decrypt(connection.encryptedCredentialData));
      const msUntilExpiry = new Date(tokenSet.expiresAt).getTime() - Date.now();
      if (msUntilExpiry > REFRESH_BUFFER_MS) {
        return tokenSet;
      }

      const lock = await this.refreshLock.tryAcquire(connection.id);
      if (lock) {
        const result = await this.refreshHoldingLock(lock, connection.id, distributorId);
        if (result !== 'retry') return result;
        continue;
      }

      if (Date.now() > deadline) {
        throw new AccountingProviderError('Timed out waiting for the accounting refresh lock', true);
      }
      await this.sleep(POLL_BASE_MS + Math.random() * POLL_JITTER_MS);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Runs entirely while `lock` is held; always releases it. On a permanent
  // failure, the ERROR write happens before release (fast, no external
  // call) but the notification send happens after — SMTP latency must never
  // extend lock hold time.
  private async refreshHoldingLock(
    lock: AccountingRefreshLock,
    connectionId: string,
    distributorId: string,
  ): Promise<AccountingTokenSet | 'retry'> {
    let permanentError: AccountingProviderError | null = null;
    let provider: AccountingProvider | null = null;
    try {
      const locked = await this.prisma.accountingConnection.findUniqueOrThrow({ where: { id: connectionId } });
      provider = locked.provider;
      if (locked.status !== AccountingConnectionStatus.CONNECTED) {
        // Raced with a disconnect/reconnect/another failure while we were
        // acquiring the lock — re-evaluate from scratch at the top of the
        // caller's loop rather than assuming anything about why.
        return 'retry';
      }

      const tokenSet: AccountingTokenSet = JSON.parse(this.tokenEncryption.decrypt(locked.encryptedCredentialData));
      const msUntilExpiry = new Date(tokenSet.expiresAt).getTime() - Date.now();
      if (msUntilExpiry > REFRESH_BUFFER_MS) {
        // Someone else refreshed it while we were waiting for the lock.
        return tokenSet;
      }

      return await this.performRefresh(locked, tokenSet, distributorId);
    } catch (err) {
      if (err instanceof AccountingProviderError && !err.transient) {
        permanentError = err;
      }
      throw err;
    } finally {
      await lock.release();
      if (permanentError && provider) {
        await this.notifyReconnectNeeded(distributorId, provider, permanentError).catch((notifyErr) => {
          this.logger.error(
            `Failed to send accounting-reconnect notification for distributor ${distributorId}: ` +
              `${notifyErr instanceof Error ? notifyErr.message : String(notifyErr)}`,
          );
        });
      }
    }
  }

  private async performRefresh(
    connection: AccountingConnection,
    currentTokenSet: AccountingTokenSet,
    distributorId: string,
  ): Promise<AccountingTokenSet> {
    let refreshed: AccountingTokenSet;
    try {
      refreshed = await this.adapters.get(connection.provider).refreshAccessToken(currentTokenSet);
    } catch (err) {
      // Unknown (non-AccountingProviderError) failures fail open on
      // retryability, not on trust — an adapter that forgot to classify
      // something shouldn't accidentally strand a connection in ERROR.
      const providerError =
        err instanceof AccountingProviderError ? err : new AccountingProviderError(
          err instanceof Error ? err.message : String(err),
          true,
          err,
        );

      this.logger.error(
        `Accounting token refresh failed for distributor ${distributorId} (connection ${connection.id}): ${providerError.message}`,
      );

      if (!providerError.transient) {
        await this.prisma.accountingConnection.update({
          where: { id: connection.id },
          data: {
            status: AccountingConnectionStatus.ERROR,
            lastErrorAt: new Date(),
            lastErrorMessage: providerError.message,
          },
        });
      }
      throw providerError;
    }

    const newCiphertext = this.tokenEncryption.encrypt(JSON.stringify(refreshed));
    // Conditional write, not a blind update: predicated on the exact
    // ciphertext just read, so a write that raced past the lock (which
    // shouldn't happen, but the lock's guarantee is defense-in-depth, not
    // provable) affects zero rows instead of silently clobbering a newer
    // credential with a stale one.
    const result = await this.prisma.accountingConnection.updateMany({
      where: {
        id: connection.id,
        status: AccountingConnectionStatus.CONNECTED,
        encryptedCredentialData: connection.encryptedCredentialData,
      },
      data: { encryptedCredentialData: newCiphertext, lastSyncedAt: new Date() },
    });

    if (result.count !== 1) {
      // Should be rare — it means the lock's mutual-exclusion guarantee was
      // violated (TTL lapsed despite renewal, or a bug). Worth alerting on;
      // re-read and return whatever is now current rather than assuming our
      // own refreshed value is still the right one to hand back.
      this.logger.error(
        `Accounting refresh CAS write lost the race for connection ${connection.id} (distributor ${distributorId}) — ` +
          'the refresh lock guarantee may have been violated',
      );
      const current = await this.prisma.accountingConnection.findUnique({ where: { id: connection.id } });
      if (current?.status === AccountingConnectionStatus.CONNECTED) {
        const currentTokenSet: AccountingTokenSet = JSON.parse(this.tokenEncryption.decrypt(current.encryptedCredentialData));
        const msLeft = new Date(currentTokenSet.expiresAt).getTime() - Date.now();
        if (msLeft > REFRESH_BUFFER_MS) return currentTokenSet;
      }
      throw new AccountingProviderError('Accounting refresh write conflict — retry', true);
    }

    return refreshed;
  }

  // Only ever called once per CONNECTED -> ERROR transition (see
  // refreshHoldingLock/getValidTokenSet's status-agnostic read) — every
  // other racing caller gets the stable stored error without reaching here,
  // so this doesn't need its own dedupe. AdminNotification itself has no
  // uniqueness constraint (see ADR-055); a rare double-send is possible only
  // under crash/retry timing during the send itself, an accepted risk that
  // mirrors ADR-055's own precedent for ORDER_PLACED.
  private async notifyReconnectNeeded(
    distributorId: string,
    provider: AccountingProvider,
    error: AccountingProviderError,
  ): Promise<void> {
    const providerName = providerDisplayName(provider);

    await this.adminNotifications.notifyOrganisationAdmins(distributorId, {
      type: 'ACCOUNTING_CONNECTION_NEEDS_RECONNECT',
      title: `${providerName} connection needs to be reconnected`,
      body: `Your ${providerName} connection has stopped working and needs to be reconnected: ${error.message}`,
      linkPath: '/integrations/accounting',
    });

    if (error.code === 'invalid_client') {
      // Our application's credentials, not this distributor's consent, are
      // the problem — reconnecting reuses the same client id/secret at
      // token-exchange time and won't fix it. Don't send a distributor email
      // telling them to do something that won't help; this needs an
      // engineer, and it affects every distributor's refresh, not just this
      // one, so it's logged at a severity worth alerting on rather than
      // routed through the per-distributor notification channels.
      this.logger.error(
        `Accounting connection for distributor ${distributorId} failed with invalid_client — this affects ` +
          'every distributor refresh and needs application-credential investigation, not a distributor reconnect',
      );
      return;
    }

    const [admins, distributor] = await Promise.all([
      this.prisma.membership.findMany({
        where: { organisationId: distributorId, role: Role.DISTRIBUTOR_ADMIN },
        select: { user: { select: { email: true } } },
      }),
      this.prisma.organisation.findUnique({ where: { id: distributorId }, select: { name: true } }),
    ]);
    const adminUrl = this.config.get<string>('ADMIN_URL', 'http://localhost:3020');

    await Promise.all(
      admins.map((admin) =>
        this.mail
          .sendAccountingConnectionNeedsReconnect(admin.user.email, {
            distributorName: distributor?.name ?? 'Your organisation',
            provider: providerName,
            reconnectUrl: `${adminUrl}/integrations/accounting`,
            // Same message already used for the in-app notification's body
            // above — human-authored, already deemed presentable to this
            // exact audience; previously only reached the in-app inbox, not
            // the email most likely to actually be seen promptly.
            reason: error.message,
          })
          .catch((err) => {
            this.logger.error(
              `Failed to send accounting-reconnect email to ${admin.user.email}: ` +
                `${err instanceof Error ? err.message : String(err)}`,
            );
          }),
      ),
    );
  }

  async disconnect(distributorId: string): Promise<void> {
    const connection = await this.prisma.accountingConnection.findFirst({
      where: { distributorId, status: AccountingConnectionStatus.CONNECTED },
    });
    if (!connection) {
      throw new NotFoundException('No active accounting connection for this distributor');
    }
    await this.prisma.accountingConnection.update({
      where: { id: connection.id },
      data: { status: AccountingConnectionStatus.DISCONNECTED, disconnectedAt: new Date() },
    });
  }
}
