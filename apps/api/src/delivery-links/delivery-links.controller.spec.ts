import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { DeliveryLinksController } from './delivery-links.controller';
import { DeliveryLinksService } from './delivery-links.service';

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
      // Rate limiting isn't under test here — only that the route carries no
      // auth guard beyond it (see the test below), per CLAUDE.md: "Auth
      // guard coverage is asserted by checking @UseGuards presence, not
      // re-testing NestJS internals."
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

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
    const dto = { outcome: 'DELIVERED' } as any;
    await controller.submitOutcome('order-1.sig', dto);
    expect(service.submitOutcome).toHaveBeenCalledWith('order-1.sig', dto);
  });

  it('has no auth guard beyond throttling — this route is deliberately public', () => {
    const guards = Reflect.getMetadata('__guards__', DeliveryLinksController);
    expect(guards).toHaveLength(1); // ThrottlerGuard only
  });

  it('forwards a photo upload to the service and rejects a request with no file', async () => {
    const file = { buffer: Buffer.from('x'), mimetype: 'image/jpeg', size: 1 } as Express.Multer.File;
    await controller.uploadPhoto('order-1.sig', file);
    expect(service.uploadPhoto).toHaveBeenCalledWith('order-1.sig', file);
    expect(() => controller.uploadPhoto('order-1.sig', undefined)).toThrow(BadRequestException);
  });

  it('forwards a photo delete to the service', async () => {
    await controller.deletePhoto('order-1.sig', 'photo-9');
    expect(service.deletePhoto).toHaveBeenCalledWith('order-1.sig', 'photo-9');
  });

  it('the photos upload route carries a FileInterceptor', () => {
    const interceptors = Reflect.getMetadata('__interceptors__', controller.uploadPhoto);
    expect(interceptors?.length).toBeGreaterThan(0);
  });
});
