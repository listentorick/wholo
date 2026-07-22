import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let service: {
    orderSummary: jest.Mock;
    orderTrend: jest.Mock;
    customerRankings: jest.Mock;
    productRankings: jest.Mock;
    actionItems: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      orderSummary: jest.fn().mockResolvedValue({}),
      orderTrend: jest.fn().mockResolvedValue({}),
      customerRankings: jest.fn().mockResolvedValue({}),
      productRankings: jest.fn().mockResolvedValue({}),
      actionItems: jest.fn().mockResolvedValue({}),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [{ provide: AnalyticsService, useValue: service }],
    }).compile();
    controller = module.get(AnalyticsController);
  });

  it('is guarded by JwtAuthGuard and DistributorAccessGuard', () => {
    const guards = Reflect.getMetadata('__guards__', AnalyticsController);
    expect(guards).toEqual([JwtAuthGuard, DistributorAccessGuard]);
  });

  it('forwards distributorId and query to orderSummary', async () => {
    const query = { period: 'month' as const };
    await controller.orderSummary('dist-1', query);
    expect(service.orderSummary).toHaveBeenCalledWith('dist-1', query);
  });

  it('forwards distributorId and query to orderTrend', async () => {
    const query = { period: 'rolling7' as const };
    await controller.orderTrend('dist-1', query);
    expect(service.orderTrend).toHaveBeenCalledWith('dist-1', query);
  });

  it('forwards distributorId and query to customerRankings', async () => {
    const query = { period: 'month' as const, limit: 5 };
    await controller.customerRankings('dist-1', query);
    expect(service.customerRankings).toHaveBeenCalledWith('dist-1', query);
  });

  it('forwards distributorId and query to productRankings', async () => {
    const query = { period: 'month' as const };
    await controller.productRankings('dist-1', query);
    expect(service.productRankings).toHaveBeenCalledWith('dist-1', query);
  });

  it('forwards distributorId to actionItems (no query params)', async () => {
    await controller.actionItems('dist-1');
    expect(service.actionItems).toHaveBeenCalledWith('dist-1');
  });
});
