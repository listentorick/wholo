import { Test } from '@nestjs/testing';
import { DeliveryOverviewService } from './delivery-overview.service';
import { ApiClientService } from '../api-client/api-client.service';

describe('DeliveryOverviewService (BFF)', () => {
  let service: DeliveryOverviewService;
  let api: { get: jest.Mock };

  beforeEach(async () => {
    api = { get: jest.fn().mockResolvedValue({ ok: true }) };
    const module = await Test.createTestingModule({
      providers: [DeliveryOverviewService, { provide: ApiClientService, useValue: api }],
    }).compile();
    service = module.get(DeliveryOverviewService);
  });

  it("reads the overview of the distributor it is given, as the caller (their token, so apps/api enforces their permissions)", async () => {
    await expect(service.overview('dist-1', 'token-1')).resolves.toEqual({ ok: true });
    expect(api.get).toHaveBeenCalledWith('/distributors/dist-1/delivery-overview', 'token-1');
  });

  it('reads the outcome series for the window given', async () => {
    await service.outcomes('dist-1', '2026-09-11', '2026-09-17', 'token-1');
    expect(api.get).toHaveBeenCalledWith('/distributors/dist-1/delivery-outcomes?from=2026-09-11&to=2026-09-17', 'token-1');
  });
});
