import { Test } from '@nestjs/testing';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';

const mockService = {
  getConnection: jest.fn(),
  createXeroAuthorizationUrl: jest.fn(),
  updateConnectionSettings: jest.fn(),
  disconnect: jest.fn(),
  listContacts: jest.fn(),
  countContactsNeedingAttention: jest.fn(),
  syncContacts: jest.fn(),
  importContact: jest.fn(),
  confirmSuggestion: jest.fn(),
  matchContact: jest.fn(),
  ignoreContact: jest.fn(),
  unlinkMapping: jest.fn(),
  listProducts: jest.fn(),
  countProductsNeedingAttention: jest.fn(),
  syncProducts: jest.fn(),
  importProduct: jest.fn(),
  confirmProductSuggestion: jest.fn(),
  matchProduct: jest.fn(),
  ignoreProduct: jest.fn(),
  unlinkProductMapping: jest.fn(),
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

  it('updateConnectionSettings resolves organisationId from req.user and forwards the settings', async () => {
    const dto = { invoiceExportTargetStatus: 'DRAFT' } as never;
    await controller.updateConnectionSettings(dto, mockRequest());
    expect(mockService.updateConnectionSettings).toHaveBeenCalledWith('dist-1', dto, 'token-1');
  });

  it('listContacts resolves organisationId from req.user and forwards the query', async () => {
    const query = { limit: 20 } as never;
    await controller.listContacts(query, mockRequest());
    expect(mockService.listContacts).toHaveBeenCalledWith('dist-1', query, 'token-1');
  });

  it('countContactsNeedingAttention resolves organisationId from req.user', async () => {
    await controller.countContactsNeedingAttention(mockRequest());
    expect(mockService.countContactsNeedingAttention).toHaveBeenCalledWith('dist-1', 'token-1');
  });

  it('syncContacts resolves organisationId from req.user, never a client-supplied id', async () => {
    await controller.syncContacts(mockRequest());
    expect(mockService.syncContacts).toHaveBeenCalledWith('dist-1', 'token-1');
  });

  it('importContact forwards the contact id and DTO with the resolved organisationId', async () => {
    const dto = { name: 'Blackbird Vine & Co' } as never;
    await controller.importContact('contact-1', dto, mockRequest());
    expect(mockService.importContact).toHaveBeenCalledWith('dist-1', 'contact-1', dto, 'token-1');
  });

  it('confirmSuggestion forwards the suggestion id with the resolved organisationId', async () => {
    await controller.confirmSuggestion('sugg-1', mockRequest());
    expect(mockService.confirmSuggestion).toHaveBeenCalledWith('dist-1', 'sugg-1', 'token-1');
  });

  it('matchContact forwards the contact id and DTO with the resolved organisationId', async () => {
    const dto = { tradeRelationshipId: 'tr-1' } as never;
    await controller.matchContact('contact-1', dto, mockRequest());
    expect(mockService.matchContact).toHaveBeenCalledWith('dist-1', 'contact-1', dto, 'token-1');
  });

  it('ignoreContact forwards the contact id with the resolved organisationId', async () => {
    await controller.ignoreContact('contact-1', mockRequest());
    expect(mockService.ignoreContact).toHaveBeenCalledWith('dist-1', 'contact-1', 'token-1');
  });

  it('unlinkMapping forwards the mapping id with the resolved organisationId', async () => {
    await controller.unlinkMapping('mapping-1', mockRequest());
    expect(mockService.unlinkMapping).toHaveBeenCalledWith('dist-1', 'mapping-1', 'token-1');
  });

  it('listProducts resolves organisationId from req.user and forwards the query', async () => {
    const query = { limit: 20 } as never;
    await controller.listProducts(query, mockRequest());
    expect(mockService.listProducts).toHaveBeenCalledWith('dist-1', query, 'token-1');
  });

  it('countProductsNeedingAttention resolves organisationId from req.user', async () => {
    await controller.countProductsNeedingAttention(mockRequest());
    expect(mockService.countProductsNeedingAttention).toHaveBeenCalledWith('dist-1', 'token-1');
  });

  it('syncProducts resolves organisationId from req.user, never a client-supplied id', async () => {
    await controller.syncProducts(mockRequest());
    expect(mockService.syncProducts).toHaveBeenCalledWith('dist-1', 'token-1');
  });

  it('importProduct forwards the external product id and DTO with the resolved organisationId', async () => {
    const dto = { name: 'Cabernet Sauvignon 2023' } as never;
    await controller.importProduct('ext-1', dto, mockRequest());
    expect(mockService.importProduct).toHaveBeenCalledWith('dist-1', 'ext-1', dto, 'token-1');
  });

  it('confirmProductSuggestion forwards the suggestion id with the resolved organisationId', async () => {
    await controller.confirmProductSuggestion('sugg-1', mockRequest());
    expect(mockService.confirmProductSuggestion).toHaveBeenCalledWith('dist-1', 'sugg-1', 'token-1');
  });

  it('matchProduct forwards the external product id and DTO with the resolved organisationId', async () => {
    const dto = { productId: 'prod-1' } as never;
    await controller.matchProduct('ext-1', dto, mockRequest());
    expect(mockService.matchProduct).toHaveBeenCalledWith('dist-1', 'ext-1', dto, 'token-1');
  });

  it('ignoreProduct forwards the external product id with the resolved organisationId', async () => {
    await controller.ignoreProduct('ext-1', mockRequest());
    expect(mockService.ignoreProduct).toHaveBeenCalledWith('dist-1', 'ext-1', 'token-1');
  });

  it('unlinkProductMapping forwards the mapping id with the resolved organisationId', async () => {
    await controller.unlinkProductMapping('mapping-1', mockRequest());
    expect(mockService.unlinkProductMapping).toHaveBeenCalledWith('dist-1', 'mapping-1', 'token-1');
  });
});
