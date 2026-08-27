import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryLinksController } from './delivery-links.controller';
import { DeliveryLinksService } from './delivery-links.service';

describe('DeliveryLinksController', () => {
  let controller: DeliveryLinksController;
  let service: { getOrder: jest.Mock; submitOutcome: jest.Mock };

  beforeEach(async () => {
    service = { getOrder: jest.fn().mockResolvedValue({ state: 'PENDING' }), submitOutcome: jest.fn().mockResolvedValue({ state: 'SUBMITTED' }) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeliveryLinksController],
      providers: [{ provide: DeliveryLinksService, useValue: service }],
    }).compile();

    controller = module.get(DeliveryLinksController);
  });

  it('passes the X-Delivery-Token header through to the service on GET', async () => {
    await controller.getOrder('order-1.sig');
    expect(service.getOrder).toHaveBeenCalledWith('order-1.sig');
  });

  it('treats a missing token header as an empty token rather than throwing directly', async () => {
    await controller.getOrder(undefined);
    expect(service.getOrder).toHaveBeenCalledWith('');
  });

  it('passes the header and body through to the service on submit', async () => {
    const dto = { outcome: 'DELIVERED' };
    await controller.submitOutcome('order-1.sig', dto);
    expect(service.submitOutcome).toHaveBeenCalledWith('order-1.sig', dto);
  });

  it('has no auth guard at all — this route is deliberately public', () => {
    const guards = Reflect.getMetadata('__guards__', DeliveryLinksController);
    expect(guards).toBeUndefined();
  });
});
