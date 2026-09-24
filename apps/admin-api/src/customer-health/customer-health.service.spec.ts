import { Test } from '@nestjs/testing';
import { CustomerHealthService } from './customer-health.service';
import { ApiClientService } from '../api-client/api-client.service';

describe('CustomerHealthService (BFF)', () => {
  let service: CustomerHealthService;
  let api: { get: jest.Mock };

  beforeEach(async () => {
    api = { get: jest.fn().mockResolvedValue({ ok: true }) };
    const module = await Test.createTestingModule({
      providers: [CustomerHealthService, { provide: ApiClientService, useValue: api }],
    }).compile();
    service = module.get(CustomerHealthService);
  });

  it("reads the customer health of the distributor it is given, as the caller (their token, so apps/api enforces their permissions)", async () => {
    await expect(service.getHealth('dist-1', 'token-1')).resolves.toEqual({ ok: true });
    expect(api.get).toHaveBeenCalledWith('/distributors/dist-1/customer-health', 'token-1');
  });
});
