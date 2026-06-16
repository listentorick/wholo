import { Test, TestingModule } from '@nestjs/testing';
import { CatalogueService } from './catalogue.service';
import { ApiClientService } from '../api-client/api-client.service';

const mockApi = {
  get: jest.fn(),
};

describe('CatalogueService (portal-api)', () => {
  let service: CatalogueService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogueService,
        { provide: ApiClientService, useValue: mockApi },
      ],
    }).compile();

    service = module.get<CatalogueService>(CatalogueService);
    jest.clearAllMocks();
  });

  describe('getDistributor', () => {
    it('calls the correct upstream path', async () => {
      mockApi.get.mockResolvedValue({ id: 'dist-1', name: 'Test', slug: 'test' });
      await service.getDistributor('test');
      expect(mockApi.get).toHaveBeenCalledWith('/distributors/test');
    });
  });

  describe('getProducts', () => {
    it('calls the correct upstream path with token', async () => {
      mockApi.get.mockResolvedValue({ data: [], pagination: {} });
      await service.getProducts('test-dist', {}, 'token-xyz');
      expect(mockApi.get).toHaveBeenCalledWith('/distributors/test-dist/products', 'token-xyz');
    });

    it('appends query string when query params are provided', async () => {
      mockApi.get.mockResolvedValue({ data: [], pagination: {} });
      await service.getProducts('test-dist', { limit: '10' }, 'token-xyz');
      expect(mockApi.get).toHaveBeenCalledWith('/distributors/test-dist/products?limit=10', 'token-xyz');
    });
  });

  describe('getProduct', () => {
    it('calls the correct upstream path with token', async () => {
      mockApi.get.mockResolvedValue({ id: 'prod-1', name: 'Test Product', imageUrl: null });
      const result = await service.getProduct('test-dist', 'prod-1', 'token-xyz');
      expect(mockApi.get).toHaveBeenCalledWith('/distributors/test-dist/products/prod-1', 'token-xyz');
      expect(result).toEqual({ id: 'prod-1', name: 'Test Product', imageUrl: null });
    });

    it('forwards the upstream response unchanged', async () => {
      const upstream = { id: 'prod-2', name: 'Another Product', imageUrl: 'https://cdn.example.com/img.webp', resolvedPrice: '12.50' };
      mockApi.get.mockResolvedValue(upstream);
      const result = await service.getProduct('my-dist', 'prod-2', 'bearer-token');
      expect(result).toBe(upstream);
    });
  });
});
