import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { AccountingConnectionStatus, AccountingProvider, Role } from '@prisma/client';
import { AccountingConnectionService } from './accounting-connection.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AdminNotificationsService } from '../admin-notifications/admin-notifications.service';
import { TokenEncryptionService } from './token-encryption.service';
import { AccountingAdapterRegistry } from './adapters/accounting-adapter.registry';
import { AccountingRefreshLockService } from './accounting-refresh-lock.service';
import { AccountingProviderError } from './adapters/accounting-provider.error';

const mockPrisma = {
  accountingConnection: {
    findFirst: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  accountingOAuthState: {
    create: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  membership: {
    findMany: jest.fn(),
  },
  organisation: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockTokenEncryption = { encrypt: jest.fn(), decrypt: jest.fn() };

const mockAdapter = {
  buildAuthorizationUrl: jest.fn(),
  exchangeCodeForToken: jest.fn(),
  listAvailableOrganisations: jest.fn(),
  refreshAccessToken: jest.fn(),
};

const mockRegistry = { get: jest.fn() };

const mockRefreshLock = { tryAcquire: jest.fn() };
const mockAdminNotifications = { notifyOrganisationAdmins: jest.fn() };
const mockMail = { sendAccountingConnectionNeedsReconnect: jest.fn() };
const mockConfig = { get: jest.fn((_key: string, fallback: string) => fallback) };

const makeTokenSet = (overrides = {}) => ({
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresAt: new Date('2030-01-01').toISOString(),
  scope: 'openid accounting.contacts',
  ...overrides,
});

const makeLock = () => ({ release: jest.fn().mockResolvedValue(undefined) });

describe('AccountingConnectionService', () => {
  let service: AccountingConnectionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRegistry.get.mockReturnValue(mockAdapter);
    mockPrisma.$transaction.mockImplementation((fn: (tx: typeof mockPrisma) => Promise<void>) => fn(mockPrisma));
    mockAdminNotifications.notifyOrganisationAdmins.mockResolvedValue(undefined);
    mockMail.sendAccountingConnectionNeedsReconnect.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountingConnectionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TokenEncryptionService, useValue: mockTokenEncryption },
        { provide: AccountingAdapterRegistry, useValue: mockRegistry },
        { provide: AccountingRefreshLockService, useValue: mockRefreshLock },
        { provide: AdminNotificationsService, useValue: mockAdminNotifications },
        { provide: MailService, useValue: mockMail },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get(AccountingConnectionService);
  });

  describe('getConnectionStatus', () => {
    it('returns null when no connection exists', async () => {
      mockPrisma.accountingConnection.findFirst.mockResolvedValue(null);
      expect(await service.getConnectionStatus('dist-1')).toBeNull();
    });

    it('returns a provider-neutral shape for a connected row', async () => {
      mockPrisma.accountingConnection.findFirst.mockResolvedValue({
        provider: AccountingProvider.XERO,
        status: AccountingConnectionStatus.CONNECTED,
        externalOrganisationName: 'Acme Wines',
        connectedAt: new Date('2026-01-01'),
        lastSyncedAt: null,
        invoiceExportTargetStatus: 'DRAFT',
      });
      const result = await service.getConnectionStatus('dist-1');
      expect(result).toEqual({
        provider: AccountingProvider.XERO,
        status: AccountingConnectionStatus.CONNECTED,
        externalOrganisationName: 'Acme Wines',
        connectedAt: new Date('2026-01-01'),
        lastSyncedAt: null,
        invoiceExportTargetStatus: 'DRAFT',
      });
    });

    it('queries for CONNECTED or ERROR, so a broken connection is surfaced distinctly', async () => {
      mockPrisma.accountingConnection.findFirst.mockResolvedValue(null);
      await service.getConnectionStatus('dist-1');
      expect(mockPrisma.accountingConnection.findFirst).toHaveBeenCalledWith({
        where: {
          distributorId: 'dist-1',
          status: { in: [AccountingConnectionStatus.CONNECTED, AccountingConnectionStatus.ERROR] },
        },
        orderBy: { connectedAt: 'desc' },
      });
    });

    it('orders by connectedAt desc, so a fresh CONNECTED row wins over a stale orphaned ERROR row', async () => {
      // Regression test: without the orderBy, findFirst's pick between two
      // matching rows (an old ERROR one and a new CONNECTED one from a
      // successful reconnect) was unordered, and the admin UI kept showing
      // the stale error even after a genuinely successful reconnect.
      mockPrisma.accountingConnection.findFirst.mockResolvedValue({
        provider: AccountingProvider.XERO,
        status: AccountingConnectionStatus.CONNECTED,
        externalOrganisationName: 'Acme Wines',
        connectedAt: new Date('2026-02-01'),
        lastSyncedAt: null,
        invoiceExportTargetStatus: 'DRAFT',
      });

      const result = await service.getConnectionStatus('dist-1');

      expect(result?.status).toBe(AccountingConnectionStatus.CONNECTED);
      const call = mockPrisma.accountingConnection.findFirst.mock.calls[0][0];
      expect(call.orderBy).toEqual({ connectedAt: 'desc' });
    });
  });

  describe('updateConnectionSettings', () => {
    it('throws NotFoundException when no connection exists', async () => {
      mockPrisma.accountingConnection.findFirst.mockResolvedValue(null);
      await expect(
        service.updateConnectionSettings('dist-1', { invoiceExportTargetStatus: 'AUTHORISED' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.accountingConnection.update).not.toHaveBeenCalled();
    });

    it('updates the target status on the current connection and returns the refreshed status shape', async () => {
      mockPrisma.accountingConnection.findFirst.mockResolvedValue({ id: 'conn-1' });
      mockPrisma.accountingConnection.update.mockResolvedValue({
        provider: AccountingProvider.XERO,
        status: AccountingConnectionStatus.CONNECTED,
        externalOrganisationName: 'Acme Wines',
        connectedAt: new Date('2026-01-01'),
        lastSyncedAt: null,
        invoiceExportTargetStatus: 'AUTHORISED',
      });

      const result = await service.updateConnectionSettings('dist-1', {
        invoiceExportTargetStatus: 'AUTHORISED',
      });

      expect(mockPrisma.accountingConnection.update).toHaveBeenCalledWith({
        where: { id: 'conn-1' },
        data: { invoiceExportTargetStatus: 'AUTHORISED' },
      });
      expect(result).toEqual(expect.objectContaining({ invoiceExportTargetStatus: 'AUTHORISED' }));
    });
  });

  describe('createAuthorizationUrl', () => {
    it('persists a state row with a future expiry and returns the adapter URL', async () => {
      mockAdapter.buildAuthorizationUrl.mockResolvedValue('https://xero.example/consent');

      const result = await service.createAuthorizationUrl('dist-1', 'user-1', AccountingProvider.XERO);

      expect(result).toEqual({ authorizationUrl: 'https://xero.example/consent' });
      expect(mockPrisma.accountingOAuthState.create).toHaveBeenCalledTimes(1);
      const created = mockPrisma.accountingOAuthState.create.mock.calls[0][0].data;
      expect(created.distributorId).toBe('dist-1');
      expect(created.connectedByUserId).toBe('user-1');
      expect(created.provider).toBe(AccountingProvider.XERO);
      expect(created.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(mockAdapter.buildAuthorizationUrl).toHaveBeenCalledWith(created.state);
    });
  });

  describe('handleCallback', () => {
    const callbackUrl = 'http://localhost:3001/api/v1/accounting/xero/callback?code=abc&state=xyz';

    it('rejects an unknown state without touching any connection', async () => {
      mockPrisma.accountingOAuthState.findUnique.mockResolvedValue(null);

      await expect(service.handleCallback(callbackUrl, 'abc', 'xyz')).rejects.toMatchObject({
        reason: 'invalid_state',
      });
      expect(mockPrisma.accountingOAuthState.delete).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('deletes an expired state row and still rejects', async () => {
      mockPrisma.accountingOAuthState.findUnique.mockResolvedValue({
        id: 'state-1',
        state: 'xyz',
        provider: AccountingProvider.XERO,
        distributorId: 'dist-1',
        connectedByUserId: 'user-1',
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.handleCallback(callbackUrl, 'abc', 'xyz')).rejects.toMatchObject({
        reason: 'expired_state',
      });
      expect(mockPrisma.accountingOAuthState.delete).toHaveBeenCalledWith({ where: { id: 'state-1' } });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects when Xero returns no code (access denied)', async () => {
      mockPrisma.accountingOAuthState.findUnique.mockResolvedValue({
        id: 'state-1',
        state: 'xyz',
        provider: AccountingProvider.XERO,
        distributorId: 'dist-1',
        connectedByUserId: 'user-1',
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(service.handleCallback(callbackUrl, undefined, 'xyz')).rejects.toMatchObject({
        reason: 'access_denied',
      });
      expect(mockPrisma.accountingOAuthState.delete).toHaveBeenCalled();
    });

    it('supersedes any prior connected row and creates the new one on success', async () => {
      mockPrisma.accountingOAuthState.findUnique.mockResolvedValue({
        id: 'state-1',
        state: 'xyz',
        provider: AccountingProvider.XERO,
        distributorId: 'dist-1',
        connectedByUserId: 'user-1',
        expiresAt: new Date(Date.now() + 60_000),
      });
      const tokenSet = makeTokenSet();
      mockAdapter.exchangeCodeForToken.mockResolvedValue(tokenSet);
      mockAdapter.listAvailableOrganisations.mockResolvedValue([{ externalId: 'tenant-1', name: 'Acme Wines' }]);
      mockTokenEncryption.encrypt.mockReturnValue('encrypted-blob');

      await service.handleCallback(callbackUrl, 'abc', 'xyz');

      expect(mockPrisma.accountingConnection.updateMany).toHaveBeenCalledWith({
        where: {
          distributorId: 'dist-1',
          status: { in: [AccountingConnectionStatus.CONNECTED, AccountingConnectionStatus.ERROR] },
        },
        data: expect.objectContaining({ status: AccountingConnectionStatus.DISCONNECTED }),
      });
      expect(mockPrisma.accountingConnection.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          distributorId: 'dist-1',
          provider: AccountingProvider.XERO,
          status: AccountingConnectionStatus.CONNECTED,
          externalOrganisationId: 'tenant-1',
          externalOrganisationName: 'Acme Wines',
          scopes: tokenSet.scope,
          encryptedCredentialData: 'encrypted-blob',
          connectedByUserId: 'user-1',
        }),
      });
    });

    it('also supersedes a prior ERROR row (a broken connection must be retired by a successful reconnect, not orphaned)', async () => {
      mockPrisma.accountingOAuthState.findUnique.mockResolvedValue({
        id: 'state-1',
        state: 'xyz',
        provider: AccountingProvider.XERO,
        distributorId: 'dist-1',
        connectedByUserId: 'user-1',
        expiresAt: new Date(Date.now() + 60_000),
      });
      mockAdapter.exchangeCodeForToken.mockResolvedValue(makeTokenSet());
      mockAdapter.listAvailableOrganisations.mockResolvedValue([{ externalId: 'tenant-1', name: 'Acme Wines' }]);
      mockTokenEncryption.encrypt.mockReturnValue('encrypted-blob');

      await service.handleCallback(callbackUrl, 'abc', 'xyz');

      const updateManyWhere = mockPrisma.accountingConnection.updateMany.mock.calls[0][0].where;
      expect(updateManyWhere.status.in).toContain(AccountingConnectionStatus.ERROR);
      expect(updateManyWhere.status.in).toContain(AccountingConnectionStatus.CONNECTED);
    });

    it('takes the first organisation and logs a warning when more than one is returned', async () => {
      mockPrisma.accountingOAuthState.findUnique.mockResolvedValue({
        id: 'state-1',
        state: 'xyz',
        provider: AccountingProvider.XERO,
        distributorId: 'dist-1',
        connectedByUserId: 'user-1',
        expiresAt: new Date(Date.now() + 60_000),
      });
      mockAdapter.exchangeCodeForToken.mockResolvedValue(makeTokenSet());
      mockAdapter.listAvailableOrganisations.mockResolvedValue([
        { externalId: 'tenant-1', name: 'First Org' },
        { externalId: 'tenant-2', name: 'Second Org' },
      ]);
      mockTokenEncryption.encrypt.mockReturnValue('encrypted-blob');

      await service.handleCallback(callbackUrl, 'abc', 'xyz');

      expect(mockPrisma.accountingConnection.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ externalOrganisationId: 'tenant-1' }),
      });
    });

    it('rejects when no organisation is returned', async () => {
      mockPrisma.accountingOAuthState.findUnique.mockResolvedValue({
        id: 'state-1',
        state: 'xyz',
        provider: AccountingProvider.XERO,
        distributorId: 'dist-1',
        connectedByUserId: 'user-1',
        expiresAt: new Date(Date.now() + 60_000),
      });
      mockAdapter.exchangeCodeForToken.mockResolvedValue(makeTokenSet());
      mockAdapter.listAvailableOrganisations.mockResolvedValue([]);

      await expect(service.handleCallback(callbackUrl, 'abc', 'xyz')).rejects.toMatchObject({
        reason: 'no_organisation',
      });
      expect(mockPrisma.accountingConnection.create).not.toHaveBeenCalled();
    });

    it('wraps an adapter failure as exchange_failed', async () => {
      mockPrisma.accountingOAuthState.findUnique.mockResolvedValue({
        id: 'state-1',
        state: 'xyz',
        provider: AccountingProvider.XERO,
        distributorId: 'dist-1',
        connectedByUserId: 'user-1',
        expiresAt: new Date(Date.now() + 60_000),
      });
      mockAdapter.exchangeCodeForToken.mockRejectedValue(new Error('boom'));

      await expect(service.handleCallback(callbackUrl, 'abc', 'xyz')).rejects.toMatchObject({
        reason: 'exchange_failed',
      });
    });
  });

  describe('getValidTokenSet', () => {
    const activeConnection = {
      id: 'conn-1',
      distributorId: 'dist-1',
      provider: AccountingProvider.XERO,
      status: AccountingConnectionStatus.CONNECTED,
      encryptedCredentialData: 'encrypted-blob',
      lastErrorMessage: null as string | null,
    };

    it('throws NotFoundException when there is no active connection', async () => {
      mockPrisma.accountingConnection.findFirst.mockResolvedValue(null);

      await expect(service.getValidTokenSet('dist-1', AccountingProvider.XERO)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockRefreshLock.tryAcquire).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the connection is DISCONNECTED', async () => {
      mockPrisma.accountingConnection.findFirst.mockResolvedValue({
        ...activeConnection,
        status: AccountingConnectionStatus.DISCONNECTED,
      });

      await expect(service.getValidTokenSet('dist-1', AccountingProvider.XERO)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockTokenEncryption.decrypt).not.toHaveBeenCalled();
    });

    it('returns the token as-is when not expiring soon, without acquiring the lock', async () => {
      mockPrisma.accountingConnection.findFirst.mockResolvedValue(activeConnection);
      const tokenSet = makeTokenSet({ expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString() });
      mockTokenEncryption.decrypt.mockReturnValue(JSON.stringify(tokenSet));

      const result = await service.getValidTokenSet('dist-1', AccountingProvider.XERO);

      expect(result).toEqual(tokenSet);
      expect(mockRefreshLock.tryAcquire).not.toHaveBeenCalled();
      expect(mockAdapter.refreshAccessToken).not.toHaveBeenCalled();
    });

    describe('a stored ERROR/REVOKED connection', () => {
      it.each([AccountingConnectionStatus.ERROR, AccountingConnectionStatus.REVOKED])(
        'throws the same stable AccountingProviderError for status %s without calling the adapter',
        async (status) => {
          mockPrisma.accountingConnection.findFirst.mockResolvedValue({
            ...activeConnection,
            status,
            lastErrorMessage: 'invalid_grant: token dead',
          });

          const err = await service
            .getValidTokenSet('dist-1', AccountingProvider.XERO)
            .catch((e) => e);

          expect(err).toBeInstanceOf(AccountingProviderError);
          expect(err.transient).toBe(false);
          expect(err.message).toBe('invalid_grant: token dead');
          expect(mockAdapter.refreshAccessToken).not.toHaveBeenCalled();
          expect(mockRefreshLock.tryAcquire).not.toHaveBeenCalled();
          expect(mockAdminNotifications.notifyOrganisationAdmins).not.toHaveBeenCalled();
        },
      );

      it('a second/racing caller gets the identical stable error, not a generic NotFoundException', async () => {
        // Simulates the state after some other caller already wrote ERROR —
        // this caller never even tries to acquire the lock or call Xero.
        mockPrisma.accountingConnection.findFirst.mockResolvedValue({
          ...activeConnection,
          status: AccountingConnectionStatus.ERROR,
          lastErrorMessage: 'Xero refresh token is no longer valid (invalid_grant)',
        });

        const err = await service
          .getValidTokenSet('dist-1', AccountingProvider.XERO)
          .catch((e) => e);

        expect(err).toBeInstanceOf(AccountingProviderError);
        expect(err.transient).toBe(false);
        expect(mockAdapter.refreshAccessToken).not.toHaveBeenCalled();
      });
    });

    describe('refreshing under the lock', () => {
      beforeEach(() => {
        mockPrisma.accountingConnection.findFirst.mockResolvedValue(activeConnection);
        mockPrisma.accountingConnection.findUniqueOrThrow.mockResolvedValue(activeConnection);
      });

      it('acquires the lock, refreshes, persists via a conditional (CAS) update, and releases the lock', async () => {
        const lock = makeLock();
        mockRefreshLock.tryAcquire.mockResolvedValue(lock);
        const staleTokenSet = makeTokenSet({ expiresAt: new Date(Date.now() + 60 * 1000).toISOString() });
        const refreshedTokenSet = makeTokenSet({
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        });
        mockTokenEncryption.decrypt.mockReturnValue(JSON.stringify(staleTokenSet));
        mockAdapter.refreshAccessToken.mockResolvedValue(refreshedTokenSet);
        mockTokenEncryption.encrypt.mockReturnValue('new-encrypted-blob');
        mockPrisma.accountingConnection.updateMany.mockResolvedValue({ count: 1 });

        const result = await service.getValidTokenSet('dist-1', AccountingProvider.XERO);

        expect(mockRefreshLock.tryAcquire).toHaveBeenCalledWith('conn-1');
        expect(mockAdapter.refreshAccessToken).toHaveBeenCalledWith(staleTokenSet);
        expect(result).toEqual(refreshedTokenSet);
        expect(mockPrisma.accountingConnection.updateMany).toHaveBeenCalledWith({
          where: {
            id: 'conn-1',
            status: AccountingConnectionStatus.CONNECTED,
            encryptedCredentialData: 'encrypted-blob', // the exact ciphertext read before refreshing — the CAS predicate
          },
          data: expect.objectContaining({ encryptedCredentialData: 'new-encrypted-blob' }),
        });
        const updateData = mockPrisma.accountingConnection.updateMany.mock.calls[0][0].data;
        expect(updateData.lastSyncedAt).toBeInstanceOf(Date);
        expect(lock.release).toHaveBeenCalledTimes(1);
      });

      it('on a transient failure, leaves status untouched, releases the lock, and does not notify', async () => {
        const lock = makeLock();
        mockRefreshLock.tryAcquire.mockResolvedValue(lock);
        const staleTokenSet = makeTokenSet({ expiresAt: new Date(Date.now() + 60 * 1000).toISOString() });
        mockTokenEncryption.decrypt.mockReturnValue(JSON.stringify(staleTokenSet));
        mockAdapter.refreshAccessToken.mockRejectedValue(
          new AccountingProviderError('Xero token refresh request failed: network error', true),
        );

        await expect(service.getValidTokenSet('dist-1', AccountingProvider.XERO)).rejects.toMatchObject({
          transient: true,
        });

        expect(mockPrisma.accountingConnection.update).not.toHaveBeenCalled();
        expect(lock.release).toHaveBeenCalledTimes(1);
        expect(mockAdminNotifications.notifyOrganisationAdmins).not.toHaveBeenCalled();
        expect(mockMail.sendAccountingConnectionNeedsReconnect).not.toHaveBeenCalled();
      });

      it('wraps an unclassified (non-AccountingProviderError) failure as transient, failing open on retryability', async () => {
        const lock = makeLock();
        mockRefreshLock.tryAcquire.mockResolvedValue(lock);
        const staleTokenSet = makeTokenSet({ expiresAt: new Date(Date.now() + 60 * 1000).toISOString() });
        mockTokenEncryption.decrypt.mockReturnValue(JSON.stringify(staleTokenSet));
        mockAdapter.refreshAccessToken.mockRejectedValue(new Error('boom'));

        await expect(service.getValidTokenSet('dist-1', AccountingProvider.XERO)).rejects.toMatchObject({
          transient: true,
        });
        expect(mockPrisma.accountingConnection.update).not.toHaveBeenCalled();
      });

      it('on a permanent failure, marks the connection ERROR, releases the lock, then notifies (in-app + email)', async () => {
        const lock = makeLock();
        const callOrder: string[] = [];
        lock.release.mockImplementation(async () => {
          callOrder.push('release');
        });
        mockRefreshLock.tryAcquire.mockResolvedValue(lock);
        mockAdminNotifications.notifyOrganisationAdmins.mockImplementation(async () => {
          callOrder.push('notify-in-app');
        });
        mockMail.sendAccountingConnectionNeedsReconnect.mockImplementation(async () => {
          callOrder.push('notify-email');
        });
        const staleTokenSet = makeTokenSet({ expiresAt: new Date(Date.now() + 60 * 1000).toISOString() });
        mockTokenEncryption.decrypt.mockReturnValue(JSON.stringify(staleTokenSet));
        mockAdapter.refreshAccessToken.mockRejectedValue(
          new AccountingProviderError(
            'Xero refresh token is no longer valid (invalid_grant) — reconnecting Xero is required',
            false,
            undefined,
            'invalid_grant',
          ),
        );
        mockPrisma.membership.findMany.mockResolvedValue([
          { user: { email: 'admin1@example.com' } },
          { user: { email: 'admin2@example.com' } },
        ]);
        mockPrisma.organisation.findUnique.mockResolvedValue({ name: 'Acme Wines' });

        await expect(service.getValidTokenSet('dist-1', AccountingProvider.XERO)).rejects.toMatchObject({
          transient: false,
          code: 'invalid_grant',
        });

        expect(mockPrisma.accountingConnection.update).toHaveBeenCalledWith({
          where: { id: 'conn-1' },
          data: expect.objectContaining({
            status: AccountingConnectionStatus.ERROR,
            lastErrorMessage: expect.stringContaining('invalid_grant'),
          }),
        });
        expect(mockAdminNotifications.notifyOrganisationAdmins).toHaveBeenCalledWith(
          'dist-1',
          expect.objectContaining({ type: 'ACCOUNTING_CONNECTION_NEEDS_RECONNECT' }),
        );
        expect(mockMail.sendAccountingConnectionNeedsReconnect).toHaveBeenCalledTimes(2);
        expect(mockMail.sendAccountingConnectionNeedsReconnect).toHaveBeenCalledWith(
          'admin1@example.com',
          expect.objectContaining({
            distributorName: 'Acme Wines',
            provider: 'Xero',
            reason: 'Xero refresh token is no longer valid (invalid_grant) — reconnecting Xero is required',
          }),
        );
        // Lock is released before any notification is sent — SMTP/DB latency
        // for the notification must never extend lock hold time.
        expect(callOrder[0]).toBe('release');
      });

      it('on invalid_client, still marks ERROR and sends the in-app notification, but skips the distributor email', async () => {
        const lock = makeLock();
        mockRefreshLock.tryAcquire.mockResolvedValue(lock);
        const staleTokenSet = makeTokenSet({ expiresAt: new Date(Date.now() + 60 * 1000).toISOString() });
        mockTokenEncryption.decrypt.mockReturnValue(JSON.stringify(staleTokenSet));
        mockAdapter.refreshAccessToken.mockRejectedValue(
          new AccountingProviderError('Xero rejected this application credentials (invalid_client)', false, undefined, 'invalid_client'),
        );

        await expect(service.getValidTokenSet('dist-1', AccountingProvider.XERO)).rejects.toMatchObject({
          code: 'invalid_client',
        });

        expect(mockPrisma.accountingConnection.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ status: AccountingConnectionStatus.ERROR }) }),
        );
        expect(mockAdminNotifications.notifyOrganisationAdmins).toHaveBeenCalledTimes(1);
        expect(mockMail.sendAccountingConnectionNeedsReconnect).not.toHaveBeenCalled();
        expect(mockPrisma.membership.findMany).not.toHaveBeenCalled();
      });

      it('when the CAS write loses the race but a fresh token is now present, returns it instead of erroring', async () => {
        const lock = makeLock();
        mockRefreshLock.tryAcquire.mockResolvedValue(lock);
        const staleTokenSet = makeTokenSet({ expiresAt: new Date(Date.now() + 60 * 1000).toISOString() });
        const refreshedTokenSet = makeTokenSet({ accessToken: 'new-access-token' });
        mockTokenEncryption.decrypt
          .mockReturnValueOnce(JSON.stringify(staleTokenSet)) // initial read (top of loop)
          .mockReturnValueOnce(JSON.stringify(staleTokenSet)) // re-read under lock
          .mockReturnValueOnce(JSON.stringify(refreshedTokenSet)); // re-read after CAS conflict
        mockAdapter.refreshAccessToken.mockResolvedValue(
          makeTokenSet({ accessToken: 'race-loser-token' }),
        );
        mockTokenEncryption.encrypt.mockReturnValue('race-loser-encrypted-blob');
        mockPrisma.accountingConnection.updateMany.mockResolvedValue({ count: 0 });
        mockPrisma.accountingConnection.findUnique.mockResolvedValue({
          ...activeConnection,
          encryptedCredentialData: 'winner-encrypted-blob',
        });

        const result = await service.getValidTokenSet('dist-1', AccountingProvider.XERO);

        expect(result).toEqual(refreshedTokenSet);
      });

      it('when the CAS write loses the race and the current token is still stale, throws transient', async () => {
        const lock = makeLock();
        mockRefreshLock.tryAcquire.mockResolvedValue(lock);
        const staleTokenSet = makeTokenSet({ expiresAt: new Date(Date.now() + 60 * 1000).toISOString() });
        mockTokenEncryption.decrypt.mockReturnValue(JSON.stringify(staleTokenSet));
        mockAdapter.refreshAccessToken.mockResolvedValue(makeTokenSet({ accessToken: 'race-loser-token' }));
        mockTokenEncryption.encrypt.mockReturnValue('race-loser-encrypted-blob');
        mockPrisma.accountingConnection.updateMany.mockResolvedValue({ count: 0 });
        mockPrisma.accountingConnection.findUnique.mockResolvedValue({
          ...activeConnection,
          encryptedCredentialData: 'winner-encrypted-blob',
        });

        await expect(service.getValidTokenSet('dist-1', AccountingProvider.XERO)).rejects.toMatchObject({
          transient: true,
        });
      });

      it('re-evaluates from scratch if the row is no longer CONNECTED once the lock is held', async () => {
        const lock1 = makeLock();
        const lock2 = makeLock();
        mockRefreshLock.tryAcquire.mockResolvedValueOnce(lock1).mockResolvedValueOnce(lock2);
        // Top-of-loop read sees CONNECTED; the re-read taken under the lock
        // sees it was disconnected in the meantime.
        mockPrisma.accountingConnection.findUniqueOrThrow.mockResolvedValueOnce({
          ...activeConnection,
          status: AccountingConnectionStatus.DISCONNECTED,
        });
        const staleTokenSet = makeTokenSet({ expiresAt: new Date(Date.now() + 60 * 1000).toISOString() });
        mockTokenEncryption.decrypt.mockReturnValue(JSON.stringify(staleTokenSet));
        // Second pass through the outer loop re-reads the top-level row too.
        mockPrisma.accountingConnection.findFirst
          .mockResolvedValueOnce(activeConnection)
          .mockResolvedValueOnce({ ...activeConnection, status: AccountingConnectionStatus.DISCONNECTED });

        await expect(service.getValidTokenSet('dist-1', AccountingProvider.XERO)).rejects.toBeInstanceOf(
          NotFoundException,
        );
        expect(lock1.release).toHaveBeenCalledTimes(1);
      });
    });

    describe('lock contention', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('polls with jittered backoff while the lock is held elsewhere, then picks up the fresh token once available', async () => {
        mockPrisma.accountingConnection.findFirst.mockResolvedValue(activeConnection);
        const staleTokenSet = makeTokenSet({ expiresAt: new Date(Date.now() + 60 * 1000).toISOString() });
        const freshTokenSet = makeTokenSet({ expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString() });
        mockTokenEncryption.decrypt.mockReturnValueOnce(JSON.stringify(staleTokenSet));
        // Never acquires the lock (someone else holds it the whole time) —
        // eventually the top-of-loop read itself shows a fresh token,
        // refreshed by whoever does hold the lock.
        mockRefreshLock.tryAcquire.mockResolvedValue(null);

        const resultPromise = service.getValidTokenSet('dist-1', AccountingProvider.XERO);
        // First poll iteration still sees the stale token.
        mockTokenEncryption.decrypt.mockReturnValue(JSON.stringify(freshTokenSet));

        await jest.advanceTimersByTimeAsync(2_000);
        const result = await resultPromise;

        expect(result).toEqual(freshTokenSet);
        expect(mockRefreshLock.tryAcquire).toHaveBeenCalled();
      });

      it('throws a transient error once the waiter deadline is exceeded', async () => {
        mockPrisma.accountingConnection.findFirst.mockResolvedValue(activeConnection);
        const staleTokenSet = makeTokenSet({ expiresAt: new Date(Date.now() + 60 * 1000).toISOString() });
        mockTokenEncryption.decrypt.mockReturnValue(JSON.stringify(staleTokenSet));
        mockRefreshLock.tryAcquire.mockResolvedValue(null);

        const resultPromise = service.getValidTokenSet('dist-1', AccountingProvider.XERO);
        const assertion = expect(resultPromise).rejects.toMatchObject({ transient: true });

        await jest.advanceTimersByTimeAsync(50_000);
        await assertion;
      });
    });
  });

  describe('disconnect', () => {
    it('throws NotFoundException when there is no active connection', async () => {
      mockPrisma.accountingConnection.findFirst.mockResolvedValue(null);
      await expect(service.disconnect('dist-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(mockPrisma.accountingConnection.update).not.toHaveBeenCalled();
    });

    it('marks the active connection disconnected and never deletes it', async () => {
      mockPrisma.accountingConnection.findFirst.mockResolvedValue({ id: 'conn-1' });
      await service.disconnect('dist-1');
      expect(mockPrisma.accountingConnection.update).toHaveBeenCalledWith({
        where: { id: 'conn-1' },
        data: expect.objectContaining({ status: AccountingConnectionStatus.DISCONNECTED }),
      });
    });
  });
});
