import { Test, TestingModule } from '@nestjs/testing';
import { AccountingConnectionStatus, AccountingProvider } from '@prisma/client';
import { AccountingConnectionController } from './accounting-connection.controller';
import { AccountingConnectionService } from './accounting-connection.service';
import { AccountingSyncService } from './sync/accounting-sync.service';

const mockService = {
  getConnectionStatus: jest.fn(),
  createAuthorizationUrl: jest.fn(),
  updateConnectionSettings: jest.fn(),
  disconnect: jest.fn(),
};

const mockSyncService = {
  requestSync: jest.fn(),
  getStatus: jest.fn(),
};

function mockResponse() {
  return { status: jest.fn() } as unknown as import('express').Response;
}

describe('AccountingConnectionController', () => {
  let controller: AccountingConnectionController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountingConnectionController],
      providers: [
        { provide: AccountingConnectionService, useValue: mockService },
        { provide: AccountingSyncService, useValue: mockSyncService },
      ],
    }).compile();
    controller = module.get(AccountingConnectionController);
  });

  describe('getConnection', () => {
    it('returns 204 with no body when there is no active connection', async () => {
      mockService.getConnectionStatus.mockResolvedValue(null);
      const res = mockResponse();

      const result = await controller.getConnection('dist-1', res);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(result).toBeUndefined();
    });

    it('returns the connection status when one exists', async () => {
      const status = {
        provider: AccountingProvider.XERO,
        status: AccountingConnectionStatus.CONNECTED,
        externalOrganisationName: 'Acme Wines',
        connectedAt: new Date(),
        lastSyncedAt: null,
      };
      mockService.getConnectionStatus.mockResolvedValue(status);
      const res = mockResponse();

      const result = await controller.getConnection('dist-1', res);

      expect(res.status).not.toHaveBeenCalled();
      expect(result).toBe(status);
    });
  });

  describe('updateConnectionSettings', () => {
    it('forwards the path distributorId and settings body to the service', async () => {
      const status = { invoiceExportTargetStatus: 'AUTHORISED' };
      mockService.updateConnectionSettings.mockResolvedValue(status);

      const result = await controller.updateConnectionSettings('dist-1', {
        invoiceExportTargetStatus: 'AUTHORISED' as never,
      });

      expect(mockService.updateConnectionSettings).toHaveBeenCalledWith('dist-1', {
        invoiceExportTargetStatus: 'AUTHORISED',
      });
      expect(result).toBe(status);
    });
  });

  describe('createXeroAuthorizationUrl', () => {
    it('passes the caller sub as connectedByUserId', async () => {
      mockService.createAuthorizationUrl.mockResolvedValue({ authorizationUrl: 'https://xero.example' });

      await controller.createXeroAuthorizationUrl('dist-1', {
        user: { sub: 'user-1', organisationId: 'dist-1' },
      } as never);

      expect(mockService.createAuthorizationUrl).toHaveBeenCalledWith(
        'dist-1',
        'user-1',
        AccountingProvider.XERO,
      );
    });
  });

  describe('disconnect', () => {
    it('delegates to the service', async () => {
      await controller.disconnect('dist-1');
      expect(mockService.disconnect).toHaveBeenCalledWith('dist-1');
    });
  });

  describe('sync', () => {
    it('requestSync triggers a MANUAL sync for the path distributor', async () => {
      mockSyncService.requestSync.mockResolvedValue({ runs: [], lastSucceededAt: null });
      await controller.requestSync('dist-1');
      expect(mockSyncService.requestSync).toHaveBeenCalledWith('dist-1', 'MANUAL');
    });

    it('getSyncStatus delegates to the service', async () => {
      mockSyncService.getStatus.mockResolvedValue({ runs: [], lastSucceededAt: null });
      await controller.getSyncStatus('dist-1');
      expect(mockSyncService.getStatus).toHaveBeenCalledWith('dist-1');
    });
  });
});
