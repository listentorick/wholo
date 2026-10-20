import { Test } from '@nestjs/testing';
import { CustomerOrderingService } from './customer-ordering.service';
import { ApiClientService } from '../api-client/api-client.service';

describe('CustomerOrderingService (BFF)', () => {
  let service: CustomerOrderingService;
  let api: { get: jest.Mock };

  beforeEach(async () => {
    api = { get: jest.fn().mockResolvedValue({ ok: true }) };
    const module = await Test.createTestingModule({
      providers: [CustomerOrderingService, { provide: ApiClientService, useValue: api }],
    }).compile();
    service = module.get(CustomerOrderingService);
  });

  it("reads the customer's ordering behaviour with the signed-in distributor, as the caller (their token)", async () => {
    await expect(service.getBehaviour('dist-1', 'cust-1', 'token-1')).resolves.toEqual({ ok: true });
    expect(api.get).toHaveBeenCalledWith('/distributors/dist-1/customers/cust-1/ordering-behaviour', 'token-1');
  });

  it('encodes the customer id into the path', async () => {
    await service.getBehaviour('dist-1', 'a/../b', 'token-1');
    expect(api.get).toHaveBeenCalledWith('/distributors/dist-1/customers/a%2F..%2Fb/ordering-behaviour', 'token-1');
  });
});
