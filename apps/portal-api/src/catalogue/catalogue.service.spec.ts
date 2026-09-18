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
    it('resolves the slug to an id, then calls the customer-catalogue path with token', async () => {
      mockApi.get.mockResolvedValueOnce({ id: 'dist-1' });
      mockApi.get.mockResolvedValueOnce({ data: [], pagination: {} });

      await service.getProducts('test-dist', {}, 'org-1', 'token-xyz');

      expect(mockApi.get).toHaveBeenNthCalledWith(1, '/distributors/test-dist', 'token-xyz');
      expect(mockApi.get).toHaveBeenNthCalledWith(
        2,
        '/distributors/dist-1/customers/org-1/catalogue',
        'token-xyz',
      );
    });

    it('appends query string when query params are provided', async () => {
      mockApi.get.mockResolvedValueOnce({ id: 'dist-1' });
      mockApi.get.mockResolvedValueOnce({ data: [], pagination: {} });

      await service.getProducts('test-dist', { limit: '10' }, 'org-1', 'token-xyz');

      expect(mockApi.get).toHaveBeenNthCalledWith(
        2,
        '/distributors/dist-1/customers/org-1/catalogue?limit=10',
        'token-xyz',
      );
    });
  });

  describe('getProduct', () => {
    it('resolves the slug to an id, then calls the customer-catalogue detail path with token', async () => {
      mockApi.get.mockResolvedValueOnce({ id: 'dist-1' });
      mockApi.get.mockResolvedValueOnce({ id: 'prod-1', name: 'Test Product', imageUrl: null });

      const result = await service.getProduct('test-dist', 'prod-1', 'org-1', 'token-xyz');

      expect(mockApi.get).toHaveBeenNthCalledWith(1, '/distributors/test-dist', 'token-xyz');
      expect(mockApi.get).toHaveBeenNthCalledWith(
        2,
        '/distributors/dist-1/customers/org-1/catalogue/prod-1',
        'token-xyz',
      );
      expect(result).toEqual({ id: 'prod-1', name: 'Test Product', imageUrl: null });
    });

    it('forwards the upstream response unchanged', async () => {
      mockApi.get.mockResolvedValueOnce({ id: 'dist-2' });
      const upstream = { id: 'prod-2', name: 'Another Product', imageUrl: 'https://cdn.example.com/img.webp', resolvedPrice: '12.50' };
      mockApi.get.mockResolvedValueOnce(upstream);

      const result = await service.getProduct('my-dist', 'prod-2', 'org-2', 'bearer-token');

      expect(result).toBe(upstream);
    });
  });
});
