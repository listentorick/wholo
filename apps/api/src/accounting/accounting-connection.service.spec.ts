import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AccountingConnectionStatus, AccountingProvider } from '@prisma/client';
import { AccountingConnectionService } from './accounting-connection.service';
import { PrismaService } from '../prisma/prisma.service';
import { TokenEncryptionService } from './token-encryption.service';
import { AccountingAdapterRegistry } from './adapters/accounting-adapter.registry';

const mockPrisma = {
  accountingConnection: {
    findFirst: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  accountingOAuthState: {
    create: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn(),
  $executeRaw: jest.fn(),
};

const mockTokenEncryption = { encrypt: jest.fn(), decrypt: jest.fn() };

const mockAdapter = {
  buildAuthorizationUrl: jest.fn(),
  exchangeCodeForToken: jest.fn(),
  listAvailableOrganisations: jest.fn(),
  refreshAccessToken: jest.fn(),
};

const mockRegistry = { get: jest.fn() };

const makeTokenSet = (overrides = {}) => ({
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresAt: new Date('2030-01-01').toISOString(),
  scope: 'openid accounting.contacts',
  ...overrides,
});

describe('AccountingConnectionService', () => {
  let service: AccountingConnectionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRegistry.get.mockReturnValue(mockAdapter);
    mockPrisma.$transaction.mockImplementation((fn: (tx: typeof mockPrisma) => Promise<void>) => fn(mockPrisma));
    mockPrisma.$executeRaw.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountingConnectionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TokenEncryptionService, useValue: mockTokenEncryption },
        { provide: AccountingAdapterRegistry, useValue: mockRegistry },
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
      });
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
        where: { distributorId: 'dist-1', status: AccountingConnectionStatus.CONNECTED },
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
    };

    it('throws NotFoundException when there is no active connection', async () => {
      mockPrisma.accountingConnection.findFirst.mockResolvedValue(null);

      await expect(service.getValidTokenSet('dist-1', AccountingProvider.XERO)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('acquires the advisory lock, then returns the token as-is when not expiring soon', async () => {
      mockPrisma.accountingConnection.findFirst.mockResolvedValue(activeConnection);
      mockPrisma.accountingConnection.findUniqueOrThrow.mockResolvedValue(activeConnection);
      const tokenSet = makeTokenSet({ expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString() });
      mockTokenEncryption.decrypt.mockReturnValue(JSON.stringify(tokenSet));

      const result = await service.getValidTokenSet('dist-1', AccountingProvider.XERO);

      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(result).toEqual(tokenSet);
      expect(mockAdapter.refreshAccessToken).not.toHaveBeenCalled();
      expect(mockPrisma.accountingConnection.update).not.toHaveBeenCalled();
    });

    it('refreshes, persists the rotated token, and updates lastSyncedAt when expiring soon', async () => {
      mockPrisma.accountingConnection.findFirst.mockResolvedValue(activeConnection);
      mockPrisma.accountingConnection.findUniqueOrThrow.mockResolvedValue(activeConnection);
      const staleTokenSet = makeTokenSet({ expiresAt: new Date(Date.now() + 60 * 1000).toISOString() });
      const refreshedTokenSet = makeTokenSet({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });
      mockTokenEncryption.decrypt.mockReturnValue(JSON.stringify(staleTokenSet));
      mockAdapter.refreshAccessToken.mockResolvedValue(refreshedTokenSet);
      mockTokenEncryption.encrypt.mockReturnValue('new-encrypted-blob');

      const result = await service.getValidTokenSet('dist-1', AccountingProvider.XERO);

      expect(mockAdapter.refreshAccessToken).toHaveBeenCalledWith(staleTokenSet);
      expect(result).toEqual(refreshedTokenSet);
      expect(mockPrisma.accountingConnection.update).toHaveBeenCalledWith({
        where: { id: 'conn-1' },
        data: expect.objectContaining({ encryptedCredentialData: 'new-encrypted-blob' }),
      });
      const updateData = mockPrisma.accountingConnection.update.mock.calls[0][0].data;
      expect(updateData.lastSyncedAt).toBeInstanceOf(Date);
    });

    it('marks the connection ERROR and throws (does not retry) when the adapter refresh fails', async () => {
      mockPrisma.accountingConnection.findFirst.mockResolvedValue(activeConnection);
      mockPrisma.accountingConnection.findUniqueOrThrow.mockResolvedValue(activeConnection);
      const staleTokenSet = makeTokenSet({ expiresAt: new Date(Date.now() + 60 * 1000).toISOString() });
      mockTokenEncryption.decrypt.mockReturnValue(JSON.stringify(staleTokenSet));
      mockAdapter.refreshAccessToken.mockRejectedValue(new Error('invalid_grant'));

      await expect(service.getValidTokenSet('dist-1', AccountingProvider.XERO)).rejects.toThrow();

      expect(mockPrisma.accountingConnection.update).toHaveBeenCalledWith({
        where: { id: 'conn-1' },
        data: expect.objectContaining({
          status: AccountingConnectionStatus.ERROR,
          lastErrorMessage: expect.stringContaining('invalid_grant'),
        }),
      });
    });

    it('throws NotFoundException if the connection was disconnected while waiting for the lock', async () => {
      mockPrisma.accountingConnection.findFirst.mockResolvedValue(activeConnection);
      mockPrisma.accountingConnection.findUniqueOrThrow.mockResolvedValue({
        ...activeConnection,
        status: AccountingConnectionStatus.DISCONNECTED,
      });

      await expect(service.getValidTokenSet('dist-1', AccountingProvider.XERO)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockTokenEncryption.decrypt).not.toHaveBeenCalled();
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
