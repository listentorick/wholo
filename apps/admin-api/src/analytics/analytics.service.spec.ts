import { Test } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { ApiClientService } from '../api-client/api-client.service';

describe('AnalyticsService (BFF)', () => {
  let service: AnalyticsService;
  let mockApi: { get: jest.Mock };

  beforeEach(async () => {
    mockApi = { get: jest.fn().mockResolvedValue({}) };
    const module = await Test.createTestingModule({
      providers: [AnalyticsService, { provide: ApiClientService, useValue: mockApi }],
    }).compile();
    service = module.get(AnalyticsService);
  });

  it('forwards order-summary with period/start/end/limit as a query string', async () => {
    await service.orderSummary('dist-1', { period: 'custom', start: '2026-03-01', end: '2026-03-15' }, 'token-1');

    expect(mockApi.get).toHaveBeenCalledWith(
      '/distributors/dist-1/order-summary?period=custom&start=2026-03-01&end=2026-03-15',
      'token-1',
    );
  });

  it('omits query params that are not provided', async () => {
    await service.orderTrend('dist-1', {}, 'token-1');

    expect(mockApi.get).toHaveBeenCalledWith('/distributors/dist-1/order-trend', 'token-1');
  });

  it('forwards limit on customer-rankings', async () => {
    await service.customerRankings('dist-1', { period: 'month', limit: 5 }, 'token-1');

    expect(mockApi.get).toHaveBeenCalledWith('/distributors/dist-1/customer-rankings?period=month&limit=5', 'token-1');
  });

  it('forwards product-rankings the same way', async () => {
    await service.productRankings('dist-1', { period: 'week' }, 'token-1');

    expect(mockApi.get).toHaveBeenCalledWith('/distributors/dist-1/product-rankings?period=week', 'token-1');
  });

  it('calls action-items with no query string at all', async () => {
    await service.actionItems('dist-1', 'token-1');

    expect(mockApi.get).toHaveBeenCalledWith('/distributors/dist-1/action-items', 'token-1');
  });
});
