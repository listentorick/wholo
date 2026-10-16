import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryLinksController } from './delivery-links.controller';
import { DeliveryLinksService } from './delivery-links.service';
import { DeliveryLinkGuard } from './delivery-link.guard';
import { OPEN_DELIVERY_ONLY_KEY } from './open-delivery-only.decorator';

describe('DeliveryLinksController', () => {
  let controller: DeliveryLinksController;
  let service: { getOrder: jest.Mock; submitOutcome: jest.Mock };

  beforeEach(async () => {
    service = { getOrder: jest.fn().mockResolvedValue({ state: 'PENDING' }), submitOutcome: jest.fn().mockResolvedValue({ state: 'SUBMITTED' }) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeliveryLinksController],
      providers: [{ provide: DeliveryLinksService, useValue: service }],
    })
      // The guard has its own spec; here only its presence is asserted.
      .overrideGuard(DeliveryLinkGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(DeliveryLinksController);
  });

  it('passes the X-Delivery-Token header through to the service on GET', async () => {
    await controller.getOrder('AbCdEfGhIjKlMnOpQrStUv');
    expect(service.getOrder).toHaveBeenCalledWith('AbCdEfGhIjKlMnOpQrStUv');
  });

  it('treats a missing token header as an empty token rather than throwing directly', async () => {
    await controller.getOrder(undefined);
    expect(service.getOrder).toHaveBeenCalledWith('');
  });

  it('passes the header and body through to the service on submit', async () => {
    const dto = { outcome: 'DELIVERED' };
    await controller.submitOutcome('AbCdEfGhIjKlMnOpQrStUv', dto);
    expect(service.submitOutcome).toHaveBeenCalledWith('AbCdEfGhIjKlMnOpQrStUv', dto);
  });

  it('checks the delivery link on every route, and nothing else — there is no login', () => {
    const guards = Reflect.getMetadata('__guards__', DeliveryLinksController);
    expect(guards).toEqual([DeliveryLinkGuard]);
  });

  it('confirms the delivery is open before a photo upload is read, and only then', () => {
    const openOnly = (handler: keyof DeliveryLinksController) =>
      Reflect.getMetadata(OPEN_DELIVERY_ONLY_KEY, DeliveryLinksController.prototype[handler]) === true;
    expect(openOnly('uploadPhoto')).toBe(true);
    expect(openOnly('getOrder')).toBe(false);
    expect(openOnly('submitOutcome')).toBe(false);
    expect(openOnly('deletePhoto')).toBe(false);
  });
});
