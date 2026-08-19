import { Test } from '@nestjs/testing';
import { DeliveryRoutesService } from './delivery-routes.service';
import { ApiClientService } from '../api-client/api-client.service';

describe('DeliveryRoutesService (BFF)', () => {
  let service: DeliveryRoutesService;
  let mockApi: { get: jest.Mock; post: jest.Mock; patch: jest.Mock; delete: jest.Mock };

  beforeEach(async () => {
    mockApi = {
      get: jest.fn().mockResolvedValue({}),
      post: jest.fn().mockResolvedValue({}),
      patch: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const module = await Test.createTestingModule({
      providers: [DeliveryRoutesService, { provide: ApiClientService, useValue: mockApi }],
    }).compile();
    service = module.get(DeliveryRoutesService);
  });

  it('forwards findAll with query params as a query string', async () => {
    await service.findAll('dist-1', { active: 'true' }, 'token-1');
    expect(mockApi.get).toHaveBeenCalledWith('/distributors/dist-1/delivery-routes?active=true', 'token-1');
  });

  it('omits the query string on findAll when no params are given', async () => {
    await service.findAll('dist-1', {}, 'token-1');
    expect(mockApi.get).toHaveBeenCalledWith('/distributors/dist-1/delivery-routes', 'token-1');
  });

  it('forwards findOne to the route resource', async () => {
    await service.findOne('dist-1', 'route-1', 'token-1');
    expect(mockApi.get).toHaveBeenCalledWith('/distributors/dist-1/delivery-routes/route-1', 'token-1');
  });

  it('forwards create with the request body', async () => {
    const body = { name: 'Yorkshire' };
    await service.create('dist-1', body, 'token-1');
    expect(mockApi.post).toHaveBeenCalledWith('/distributors/dist-1/delivery-routes', 'token-1', body);
  });

  it('forwards update as a PATCH to the route resource', async () => {
    const body = { name: 'Yorkshire 2' };
    await service.update('dist-1', 'route-1', body, 'token-1');
    expect(mockApi.patch).toHaveBeenCalledWith('/distributors/dist-1/delivery-routes/route-1', 'token-1', body);
  });

  it('forwards remove as a DELETE to the route resource', async () => {
    await service.remove('dist-1', 'route-1', 'token-1');
    expect(mockApi.delete).toHaveBeenCalledWith('/distributors/dist-1/delivery-routes/route-1', 'token-1');
  });

  it('forwards listCustomers to the nested customers resource', async () => {
    await service.listCustomers('dist-1', 'route-1', 'token-1');
    expect(mockApi.get).toHaveBeenCalledWith('/distributors/dist-1/delivery-routes/route-1/customers', 'token-1');
  });

  it('forwards assignCustomer with the request body', async () => {
    const body = { customerId: 'cust-1' };
    await service.assignCustomer('dist-1', 'route-1', body, 'token-1');
    expect(mockApi.post).toHaveBeenCalledWith('/distributors/dist-1/delivery-routes/route-1/customers', 'token-1', body);
  });

  it('forwards removeCustomer to the customer-specific resource', async () => {
    await service.removeCustomer('dist-1', 'route-1', 'cust-1', 'token-1');
    expect(mockApi.delete).toHaveBeenCalledWith('/distributors/dist-1/delivery-routes/route-1/customers/cust-1', 'token-1');
  });

  it('forwards reorderCustomers as a PATCH with the request body', async () => {
    const body = { orderedCustomerIds: ['cust-2', 'cust-1'] };
    await service.reorderCustomers('dist-1', 'route-1', body, 'token-1');
    expect(mockApi.patch).toHaveBeenCalledWith('/distributors/dist-1/delivery-routes/route-1/customers/reorder', 'token-1', body);
  });
});
