import { Test, TestingModule } from '@nestjs/testing';
import { AccountingConnectionStatus, AccountingProvider } from '@prisma/client';
import { AccountingConnectionController } from './accounting-connection.controller';
import { AccountingConnectionService } from './accounting-connection.service';

const mockService = {
  getConnectionStatus: jest.fn(),
  createAuthorizationUrl: jest.fn(),
  disconnect: jest.fn(),
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
      providers: [{ provide: AccountingConnectionService, useValue: mockService }],
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
});
