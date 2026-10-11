import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { DeliveryLinksController } from './delivery-links.controller';
import { DeliveryLinkGuard } from './delivery-link.guard';
import { DeliveryLinksService, OrderForDeliveryLink } from './delivery-links.service';

// What DeliveryLinkGuard hands each handler once it has resolved the token.
const order = { id: 'order-1' } as OrderForDeliveryLink;

describe('DeliveryLinksController', () => {
  let controller: DeliveryLinksController;
  let service: {
    getOrder: jest.Mock;
    submitOutcome: jest.Mock;
    uploadPhoto: jest.Mock;
    deletePhoto: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      getOrder: jest.fn().mockResolvedValue({ state: 'PENDING' }),
      submitOutcome: jest.fn().mockResolvedValue({ state: 'SUBMITTED' }),
      uploadPhoto: jest.fn().mockResolvedValue({ id: 'photo-1', thumbnailUrl: 'https://cdn/x' }),
      deletePhoto: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeliveryLinksController],
      providers: [{ provide: DeliveryLinksService, useValue: service }],
    })
      // Neither guard is under test here (DeliveryLinkGuard has its own spec)
      // — only that the routes carry them (see the test below), per
      // CLAUDE.md: "Auth guard coverage is asserted by checking @UseGuards
      // presence, not re-testing NestJS internals."
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(DeliveryLinkGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(DeliveryLinksController);
  });

  it('returns the service view of the resolved order on GET', async () => {
    await expect(controller.getOrder(order)).resolves.toEqual({ state: 'PENDING' });
    expect(service.getOrder).toHaveBeenCalledWith(order);
  });

  it('passes the resolved order and body through to the service on submit', async () => {
    const dto = { outcome: 'DELIVERED' } as any;
    await expect(controller.submitOutcome(order, dto)).resolves.toEqual({ state: 'SUBMITTED' });
    expect(service.submitOutcome).toHaveBeenCalledWith(order, dto);
  });

  it('throttles, then resolves the delivery token, on every route — and has no login guard', () => {
    const guards = Reflect.getMetadata('__guards__', DeliveryLinksController);
    expect(guards).toEqual([ThrottlerGuard, DeliveryLinkGuard]);
  });

  it('forwards a photo upload to the service and rejects a request with no file', async () => {
    const file = { buffer: Buffer.from('x'), mimetype: 'image/jpeg', size: 1 } as Express.Multer.File;
    await controller.uploadPhoto(order, file);
    expect(service.uploadPhoto).toHaveBeenCalledWith(order, file);
    expect(() => controller.uploadPhoto(order, undefined)).toThrow(BadRequestException);
  });

  it('forwards a photo delete to the service', async () => {
    await controller.deletePhoto(order, 'photo-9');
    expect(service.deletePhoto).toHaveBeenCalledWith(order, 'photo-9');
  });

  it('the photos upload route carries a FileInterceptor', () => {
    const interceptors = Reflect.getMetadata('__interceptors__', controller.uploadPhoto);
    expect(interceptors?.length).toBeGreaterThan(0);
  });
});
