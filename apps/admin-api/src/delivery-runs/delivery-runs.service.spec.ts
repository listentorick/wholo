import { Test } from '@nestjs/testing';
import { DeliveryRunsService } from './delivery-runs.service';
import { ApiClientService } from '../api-client/api-client.service';

describe('DeliveryRunsService (BFF)', () => {
  let service: DeliveryRunsService;
  let mockApi: { get: jest.Mock };

  beforeEach(async () => {
    mockApi = {
      get: jest.fn().mockResolvedValue({}),
    };
    const module = await Test.createTestingModule({
      providers: [DeliveryRunsService, { provide: ApiClientService, useValue: mockApi }],
    }).compile();
    service = module.get(DeliveryRunsService);
  });

  it('forwards listDays with query params as a query string', async () => {
    await service.listDays('dist-1', { from: '2026-08-17', to: '2026-08-23' }, 'token-1');
    expect(mockApi.get).toHaveBeenCalledWith('/distributors/dist-1/delivery-days?from=2026-08-17&to=2026-08-23', 'token-1');
  });

  it('omits the query string on listDays when no params are given', async () => {
    await service.listDays('dist-1', {}, 'token-1');
    expect(mockApi.get).toHaveBeenCalledWith('/distributors/dist-1/delivery-days', 'token-1');
  });

  it('forwards getDay to the dated board resource', async () => {
    await service.getDay('dist-1', '2026-08-20', 'token-1');
    expect(mockApi.get).toHaveBeenCalledWith('/distributors/dist-1/delivery-days/2026-08-20', 'token-1');
  });
});
