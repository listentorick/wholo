import { Test } from '@nestjs/testing';
import { AccountingService } from './accounting.service';
import { ApiClientService } from '../api-client/api-client.service';

const mockApi = {
  get: jest.fn(),
  post: jest.fn(),
  delete: jest.fn(),
  postAnonymous: jest.fn(),
};

describe('AccountingService (BFF)', () => {
  let service: AccountingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AccountingService,
        { provide: ApiClientService, useValue: mockApi },
      ],
    }).compile();
    service = module.get(AccountingService);
  });

  describe('getConnection', () => {
    it('calls api.get with the distributor path and bearer token', async () => {
      mockApi.get.mockResolvedValue({ provider: 'XERO', status: 'CONNECTED' });

      const result = await service.getConnection('dist-1', 'token-1');

      expect(mockApi.get).toHaveBeenCalledWith('/distributors/dist-1/accounting/connection', 'token-1');
      expect(result).toEqual({ provider: 'XERO', status: 'CONNECTED' });
    });
  });

  describe('createXeroAuthorizationUrl', () => {
    it('calls api.post with the distributor path and bearer token', async () => {
      mockApi.post.mockResolvedValue({ authorizationUrl: 'https://xero.example' });

      const result = await service.createXeroAuthorizationUrl('dist-1', 'token-1');

      expect(mockApi.post).toHaveBeenCalledWith(
        '/distributors/dist-1/accounting/connections/xero/authorization-url',
        'token-1',
      );
      expect(result).toEqual({ authorizationUrl: 'https://xero.example' });
    });
  });

  describe('disconnect', () => {
    it('calls api.delete with the distributor path and bearer token, never a client-supplied id', async () => {
      await service.disconnect('dist-1', 'token-1');

      expect(mockApi.delete).toHaveBeenCalledWith('/distributors/dist-1/accounting/connection', 'token-1');
    });
  });

  describe('handleXeroCallback', () => {
    it('calls api.postAnonymous with no bearer token — this is a server-to-server call, not a user request', async () => {
      mockApi.postAnonymous.mockResolvedValue({ status: 'connected' });

      const result = await service.handleXeroCallback('http://localhost:3020/callback?code=abc&state=xyz', 'abc', 'xyz');

      expect(mockApi.postAnonymous).toHaveBeenCalledWith('/accounting/xero/callback', {
        callbackUrl: 'http://localhost:3020/callback?code=abc&state=xyz',
        code: 'abc',
        state: 'xyz',
      });
      expect(result).toEqual({ status: 'connected' });
    });
  });
});
