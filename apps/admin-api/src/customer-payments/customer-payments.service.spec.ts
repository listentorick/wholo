import { Test } from '@nestjs/testing';
import { CustomerPaymentsService } from './customer-payments.service';
import { ApiClientService } from '../api-client/api-client.service';

describe('CustomerPaymentsService (BFF)', () => {
  let service: CustomerPaymentsService;
  let api: { get: jest.Mock };

  beforeEach(async () => {
    api = { get: jest.fn().mockResolvedValue({ ok: true }) };
    const module = await Test.createTestingModule({
      providers: [CustomerPaymentsService, { provide: ApiClientService, useValue: api }],
    }).compile();
    service = module.get(CustomerPaymentsService);
  });

  it("reads the customer's payments with the signed-in distributor, as the caller (their token)", async () => {
    await expect(service.getSummary('dist-1', 'cust-1', 'token-1')).resolves.toEqual({ ok: true });
    expect(api.get).toHaveBeenCalledWith('/distributors/dist-1/customers/cust-1/payments', 'token-1');
  });

  it('encodes the customer id into the path', async () => {
    await service.getSummary('dist-1', 'a/../b', 'token-1');
    expect(api.get).toHaveBeenCalledWith('/distributors/dist-1/customers/a%2F..%2Fb/payments', 'token-1');
  });
});
