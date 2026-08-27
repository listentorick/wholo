import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryLinksService } from './delivery-links.service';
import { ApiClientService } from '../api-client/api-client.service';

describe('DeliveryLinksService', () => {
  let service: DeliveryLinksService;
  let api: { get: jest.Mock; post: jest.Mock };

  beforeEach(async () => {
    api = { get: jest.fn().mockResolvedValue({ state: 'PENDING' }), post: jest.fn().mockResolvedValue({ state: 'SUBMITTED' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DeliveryLinksService, { provide: ApiClientService, useValue: api }],
    }).compile();

    service = module.get(DeliveryLinksService);
  });

  it('forwards the token as an X-Delivery-Token header on GET, never as a URL param', async () => {
    await service.getOrder('order-1.sig');
    expect(api.get).toHaveBeenCalledWith('/delivery-links', { 'X-Delivery-Token': 'order-1.sig' });
  });

  it('forwards the token as a header and the body as-is on submit', async () => {
    const dto = { outcome: 'DELIVERED' };
    await service.submitOutcome('order-1.sig', dto);
    expect(api.post).toHaveBeenCalledWith('/delivery-links/outcome', { 'X-Delivery-Token': 'order-1.sig' }, dto);
  });
});
