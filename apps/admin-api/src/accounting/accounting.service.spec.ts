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

  describe('listContacts', () => {
    it('forwards limit/cursor/search/status as query params', async () => {
      mockApi.get.mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false } });

      await service.listContacts('dist-1', { limit: 20, cursor: 'abc', search: 'blackbird', status: 'SUGGESTED' }, 'token-1');

      expect(mockApi.get).toHaveBeenCalledWith(
        '/distributors/dist-1/accounting/contacts?limit=20&cursor=abc&search=blackbird&status=SUGGESTED',
        'token-1',
      );
    });

    it('omits the query string entirely when no filters are supplied', async () => {
      mockApi.get.mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false } });
      await service.listContacts('dist-1', {}, 'token-1');
      expect(mockApi.get).toHaveBeenCalledWith('/distributors/dist-1/accounting/contacts', 'token-1');
    });

    it('forwards the type filter (customers/suppliers/archived)', async () => {
      mockApi.get.mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false } });
      await service.listContacts('dist-1', { type: 'suppliers' }, 'token-1');
      expect(mockApi.get).toHaveBeenCalledWith('/distributors/dist-1/accounting/contacts?type=suppliers', 'token-1');
    });
  });

  describe('countContactsNeedingAttention', () => {
    it('calls the needs-attention-count route', async () => {
      mockApi.get.mockResolvedValue({ count: 3 });
      const result = await service.countContactsNeedingAttention('dist-1', 'token-1');
      expect(mockApi.get).toHaveBeenCalledWith('/distributors/dist-1/accounting/contacts/needs-attention-count', 'token-1');
      expect(result).toEqual({ count: 3 });
    });
  });

  describe('syncContacts', () => {
    it('posts to the sync route', async () => {
      mockApi.post.mockResolvedValue({ queued: true });
      const result = await service.syncContacts('dist-1', 'token-1');
      expect(mockApi.post).toHaveBeenCalledWith('/distributors/dist-1/accounting/contacts/sync', 'token-1');
      expect(result).toEqual({ queued: true });
    });
  });

  describe('importContact', () => {
    it('posts the import DTO to the contact-scoped import route', async () => {
      const dto = { name: 'Blackbird Vine & Co' };
      await service.importContact('dist-1', 'contact-1', dto, 'token-1');
      expect(mockApi.post).toHaveBeenCalledWith('/distributors/dist-1/accounting/contacts/contact-1/import', 'token-1', dto);
    });
  });

  describe('confirmSuggestion', () => {
    it('posts to the suggestion-scoped confirm route', async () => {
      await service.confirmSuggestion('dist-1', 'sugg-1', 'token-1');
      expect(mockApi.post).toHaveBeenCalledWith('/distributors/dist-1/accounting/contacts/suggestions/sugg-1/confirm', 'token-1');
    });
  });

  describe('matchContact', () => {
    it('posts the match DTO to the contact-scoped match route', async () => {
      const dto = { tradeRelationshipId: 'tr-1' };
      await service.matchContact('dist-1', 'contact-1', dto, 'token-1');
      expect(mockApi.post).toHaveBeenCalledWith('/distributors/dist-1/accounting/contacts/contact-1/match', 'token-1', dto);
    });
  });

  describe('ignoreContact', () => {
    it('posts to the contact-scoped ignore route', async () => {
      await service.ignoreContact('dist-1', 'contact-1', 'token-1');
      expect(mockApi.post).toHaveBeenCalledWith('/distributors/dist-1/accounting/contacts/contact-1/ignore', 'token-1');
    });
  });

  describe('unlinkMapping', () => {
    it('posts to the mapping-scoped unlink route', async () => {
      await service.unlinkMapping('dist-1', 'mapping-1', 'token-1');
      expect(mockApi.post).toHaveBeenCalledWith('/distributors/dist-1/accounting/contacts/mappings/mapping-1/unlink', 'token-1');
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
