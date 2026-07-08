import { Test } from '@nestjs/testing';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';

const mockService = {
  getConnection: jest.fn(),
  createXeroAuthorizationUrl: jest.fn(),
  disconnect: jest.fn(),
};

function mockRequest() {
  return { user: { organisationId: 'dist-1', token: 'token-1' } } as unknown as import('express').Request;
}

function mockResponse() {
  return { status: jest.fn() } as unknown as import('express').Response;
}

describe('AccountingController (BFF)', () => {
  let controller: AccountingController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [AccountingController],
      providers: [{ provide: AccountingService, useValue: mockService }],
    }).compile();
    controller = module.get(AccountingController);
  });

  describe('getConnection', () => {
    it('returns 204 with no body when the upstream call resolves undefined', async () => {
      mockService.getConnection.mockResolvedValue(undefined);
      const res = mockResponse();

      const result = await controller.getConnection(mockRequest(), res);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(result).toBeUndefined();
    });

    it('returns the connection status when one exists', async () => {
      const connection = { provider: 'XERO', status: 'CONNECTED' };
      mockService.getConnection.mockResolvedValue(connection);
      const res = mockResponse();

      const result = await controller.getConnection(mockRequest(), res);

      expect(res.status).not.toHaveBeenCalled();
      expect(result).toBe(connection);
    });
  });

  it('createXeroAuthorizationUrl resolves organisationId from req.user, never a client-supplied id', async () => {
    mockService.createXeroAuthorizationUrl.mockResolvedValue({ authorizationUrl: 'https://xero.example' });

    await controller.createXeroAuthorizationUrl(mockRequest());

    expect(mockService.createXeroAuthorizationUrl).toHaveBeenCalledWith('dist-1', 'token-1');
  });

  it('disconnect resolves organisationId from req.user, never a client-supplied id', async () => {
    await controller.disconnect(mockRequest());
    expect(mockService.disconnect).toHaveBeenCalledWith('dist-1', 'token-1');
  });
});
