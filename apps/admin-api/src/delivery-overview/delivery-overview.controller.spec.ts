import { Test } from '@nestjs/testing';
import { DeliveryOverviewController } from './delivery-overview.controller';
import { DeliveryOverviewService } from './delivery-overview.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const req = { user: { organisationId: 'dist-1', token: 'token-1' } } as never;

describe('DeliveryOverviewController (BFF)', () => {
  let controller: DeliveryOverviewController;
  let service: { overview: jest.Mock; outcomes: jest.Mock };

  beforeEach(async () => {
    service = { overview: jest.fn().mockResolvedValue({ a: 1 }), outcomes: jest.fn().mockResolvedValue({ b: 2 }) };
    const module = await Test.createTestingModule({
      controllers: [DeliveryOverviewController],
      providers: [{ provide: DeliveryOverviewService, useValue: service }],
    }).compile();
    controller = module.get(DeliveryOverviewController);
  });

  it('requires a signed-in user', () => {
    expect(Reflect.getMetadata('__guards__', DeliveryOverviewController)).toEqual([JwtAuthGuard]);
  });

  it("serves the overview for the caller's own distributor", async () => {
    await expect(controller.overview(req)).resolves.toEqual({ a: 1 });
    expect(service.overview).toHaveBeenCalledWith('dist-1', 'token-1');
  });

  it("serves the outcome series for the caller's own distributor and the window they asked for", async () => {
    await expect(controller.outcomes({ from: '2026-09-11', to: '2026-09-17' }, req)).resolves.toEqual({ b: 2 });
    expect(service.outcomes).toHaveBeenCalledWith('dist-1', '2026-09-11', '2026-09-17', 'token-1');
  });
});
