import { Test } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const makeReq = () => ({ user: { organisationId: 'dist-1', token: 'token-1' } }) as never;

describe('AnalyticsController (BFF)', () => {
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
    const module = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [{ provide: AnalyticsService, useValue: service }],
    }).compile();
    controller = module.get(AnalyticsController);
  });

  it('is guarded by JwtAuthGuard', () => {
    const guards = Reflect.getMetadata('__guards__', AnalyticsController);
    expect(guards).toEqual([JwtAuthGuard]);
  });

  it('resolves organisationId and token from req.user for order-summary', async () => {
    const query = { period: 'month' as const };
    await controller.orderSummary(query, makeReq());
    expect(service.orderSummary).toHaveBeenCalledWith('dist-1', query, 'token-1');
  });

  it('resolves organisationId and token from req.user for action-items', async () => {
    await controller.actionItems(makeReq());
    expect(service.actionItems).toHaveBeenCalledWith('dist-1', 'token-1');
  });
});
