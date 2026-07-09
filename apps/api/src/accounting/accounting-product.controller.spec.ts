import { Test, TestingModule } from '@nestjs/testing';
import { AccountingProductController } from './accounting-product.controller';
import { AccountingProductService } from './accounting-product.service';

const mockService = {
  listProducts: jest.fn(),
  countNeedsAttention: jest.fn(),
  requestManualSync: jest.fn(),
  importAsNewProduct: jest.fn(),
  confirmSuggestion: jest.fn(),
  matchToExistingProduct: jest.fn(),
  ignore: jest.fn(),
  unlink: jest.fn(),
};

const req = { user: { sub: 'user-1', organisationId: 'dist-1' } } as never;

describe('AccountingProductController', () => {
  let controller: AccountingProductController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountingProductController],
      providers: [{ provide: AccountingProductService, useValue: mockService }],
    }).compile();
    controller = module.get(AccountingProductController);
  });

  it('listProducts delegates to the service', async () => {
    mockService.listProducts.mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false } });
    const query = { limit: 20 } as never;

    const result = await controller.listProducts('dist-1', query);

    expect(mockService.listProducts).toHaveBeenCalledWith('dist-1', query);
    expect(result).toEqual({ data: [], pagination: { nextCursor: null, hasMore: false } });
  });

  it('countNeedsAttention wraps the service count in a {count} envelope', async () => {
    mockService.countNeedsAttention.mockResolvedValue(4);
    const result = await controller.countNeedsAttention('dist-1');
    expect(result).toEqual({ count: 4 });
  });

  it('requestManualSync delegates to the service, never running sync inline', async () => {
    mockService.requestManualSync.mockResolvedValue({ queued: true });
    const result = await controller.requestManualSync('dist-1');
    expect(mockService.requestManualSync).toHaveBeenCalledWith('dist-1');
    expect(result).toEqual({ queued: true });
  });

  it('importAsNewProduct passes the caller sub as the importing user', async () => {
    const dto = { name: 'Cabernet Sauvignon 2023' } as never;
    await controller.importAsNewProduct('dist-1', 'ext-1', dto, req);
    expect(mockService.importAsNewProduct).toHaveBeenCalledWith('dist-1', 'user-1', 'ext-1', dto);
  });

  it('confirmSuggestion passes the caller sub as the confirming user', async () => {
    await controller.confirmSuggestion('dist-1', 'sugg-1', req);
    expect(mockService.confirmSuggestion).toHaveBeenCalledWith('dist-1', 'user-1', 'sugg-1');
  });

  it('matchToExistingProduct unpacks productId from the body', async () => {
    await controller.matchToExistingProduct('dist-1', 'ext-1', { productId: 'prod-1' }, req);
    expect(mockService.matchToExistingProduct).toHaveBeenCalledWith('dist-1', 'user-1', 'ext-1', 'prod-1');
  });

  it('ignore passes the caller sub', async () => {
    await controller.ignore('dist-1', 'ext-1', req);
    expect(mockService.ignore).toHaveBeenCalledWith('dist-1', 'user-1', 'ext-1');
  });

  it('unlink delegates to the service', async () => {
    await controller.unlink('dist-1', 'mapping-1');
    expect(mockService.unlink).toHaveBeenCalledWith('dist-1', 'mapping-1');
  });
});
