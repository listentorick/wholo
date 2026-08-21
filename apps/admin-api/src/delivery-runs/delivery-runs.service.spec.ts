import { Test } from '@nestjs/testing';
import { DeliveryRunsService } from './delivery-runs.service';
import { ApiClientService } from '../api-client/api-client.service';

describe('DeliveryRunsService (BFF)', () => {
  let service: DeliveryRunsService;
  let mockApi: { get: jest.Mock; post: jest.Mock; patch: jest.Mock; delete: jest.Mock; getBinary: jest.Mock };

  beforeEach(async () => {
    mockApi = {
      get: jest.fn().mockResolvedValue({}),
      post: jest.fn().mockResolvedValue({}),
      patch: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      getBinary: jest.fn().mockResolvedValue({ buffer: Buffer.from('x'), contentType: 'application/pdf', contentDisposition: null }),
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

  it('forwards assignOrderToRun as a POST with the request body', async () => {
    const body = { orderId: 'order-1', version: 0 };
    await service.assignOrderToRun('dist-1', 'run-1', body, 'token-1');
    expect(mockApi.post).toHaveBeenCalledWith('/distributors/dist-1/delivery-runs/run-1/orders', 'token-1', body);
  });

  it('forwards unassignOrderFromRun as a DELETE with ?version= built into the path', async () => {
    await service.unassignOrderFromRun('dist-1', 'run-1', 'order-1', '3', 'token-1');
    expect(mockApi.delete).toHaveBeenCalledWith('/distributors/dist-1/delivery-runs/run-1/orders/order-1?version=3', 'token-1');
  });

  it('forwards reorderRunOrders as a PATCH with the request body', async () => {
    const body = { version: 0, orderedOrderIds: ['a', 'b'] };
    await service.reorderRunOrders('dist-1', 'run-1', body, 'token-1');
    expect(mockApi.patch).toHaveBeenCalledWith('/distributors/dist-1/delivery-runs/run-1/orders/reorder', 'token-1', body);
  });

  it('forwards updateRun as a PATCH against the run resource itself, with the request body', async () => {
    const body = { version: 0, status: 'READY' };
    await service.updateRun('dist-1', 'run-1', body, 'token-1');
    expect(mockApi.patch).toHaveBeenCalledWith('/distributors/dist-1/delivery-runs/run-1', 'token-1', body);
  });

  it('forwards getReschedulePreview with the date as a query param', async () => {
    await service.getReschedulePreview('dist-1', 'order-1', '2026-08-25', 'token-1');
    expect(mockApi.get).toHaveBeenCalledWith('/distributors/dist-1/orders/order-1/reschedule-preview?date=2026-08-25', 'token-1');
  });

  it('forwards changeScheduledDeliveryDate as a PATCH against the order resource, with the request body', async () => {
    const body = { scheduledDeliveryDate: '2026-08-25', expectedScheduledDeliveryDate: '2026-08-20' };
    await service.changeScheduledDeliveryDate('dist-1', 'order-1', body, 'token-1');
    expect(mockApi.patch).toHaveBeenCalledWith('/distributors/dist-1/orders/order-1/scheduled-delivery-date', 'token-1', body);
  });

  it('forwards getManifest as a getBinary call against the manifest resource', async () => {
    await service.getManifest('dist-1', 'run-1', 'token-1');
    expect(mockApi.getBinary).toHaveBeenCalledWith('/distributors/dist-1/delivery-runs/run-1/manifest', 'token-1');
  });
});
