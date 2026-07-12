import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  AccountingConnection,
  AccountingConnectionStatus,
  AccountingInvoiceTargetStatus,
  AccountingProvider,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TokenEncryptionService } from './token-encryption.service';
import { AccountingAdapterRegistry } from './adapters/accounting-adapter.registry';
import { AccountingOAuthError } from './accounting-oauth.error';
import { AccountingTokenSet } from './adapters/accounting-connection-adapter.interface';

const STATE_TTL_MS = 10 * 60 * 1000;
// Refresh if the access token has less than this much life left. Xero access
// tokens live ~30 min, so 5 min is a comfortable margin without refreshing
// needlessly often.
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

@Injectable()
export class AccountingConnectionService {
  private readonly logger = new Logger(AccountingConnectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenEncryption: TokenEncryptionService,
    private readonly adapters: AccountingAdapterRegistry,
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
        where: { distributorId: stateRow.distributorId, status: AccountingConnectionStatus.CONNECTED },
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
  async getValidTokenSet(distributorId: string, provider: AccountingProvider): Promise<AccountingTokenSet> {
    return this.prisma.$transaction(async (tx) => {
      const connection = await tx.accountingConnection.findFirst({
        where: { distributorId, provider, status: AccountingConnectionStatus.CONNECTED },
      });
      if (!connection) {
        throw new NotFoundException('No active accounting connection for this distributor');
      }

      // Serializes concurrent refresh attempts for this connection so two
      // racing callers can't both submit the same (about-to-be-invalidated)
      // refresh token to Xero. Auto-released when the transaction ends. This
      // deliberately holds the transaction open for the refresh network
      // call — correctness here matters more than avoiding a brief held-open
      // transaction for what's a low-frequency, sub-second call.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${connection.id}))`;

      // Re-read now the lock is held — a concurrent caller may have already
      // refreshed (or disconnected) while this one was waiting.
      const current = await tx.accountingConnection.findUniqueOrThrow({ where: { id: connection.id } });
      if (current.status !== AccountingConnectionStatus.CONNECTED) {
        throw new NotFoundException('No active accounting connection for this distributor');
      }

      const tokenSet: AccountingTokenSet = JSON.parse(this.tokenEncryption.decrypt(current.encryptedCredentialData));
      const msUntilExpiry = new Date(tokenSet.expiresAt).getTime() - Date.now();
      if (msUntilExpiry > REFRESH_BUFFER_MS) {
        return tokenSet;
      }

      try {
        const refreshed = await this.adapters.get(current.provider).refreshAccessToken(tokenSet);
        await tx.accountingConnection.update({
          where: { id: current.id },
          data: {
            encryptedCredentialData: this.tokenEncryption.encrypt(JSON.stringify(refreshed)),
            lastSyncedAt: new Date(),
          },
        });
        return refreshed;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Accounting token refresh failed for distributor ${distributorId}: ${message}`);
        await tx.accountingConnection.update({
          where: { id: current.id },
          data: {
            status: AccountingConnectionStatus.ERROR,
            lastErrorAt: new Date(),
            lastErrorMessage: message,
          },
        });
        throw new Error(`Failed to refresh accounting connection for distributor ${distributorId}: ${message}`);
      }
    });
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
