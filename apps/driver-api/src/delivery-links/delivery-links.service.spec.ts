import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryLinksService } from './delivery-links.service';
import { ApiClientService } from '../api-client/api-client.service';

describe('DeliveryLinksService', () => {
  let service: DeliveryLinksService;
  let api: { get: jest.Mock; post: jest.Mock; delete: jest.Mock; postMultipart: jest.Mock };

  beforeEach(async () => {
    api = {
      get: jest.fn().mockResolvedValue({ state: 'PENDING' }),
      post: jest.fn().mockResolvedValue({ state: 'SUBMITTED' }),
      delete: jest.fn().mockResolvedValue(undefined),
      postMultipart: jest.fn().mockResolvedValue({ id: 'photo-1' }),
    };

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

  it('forwards a photo as multipart with the token header', async () => {
    const file = { buffer: Buffer.from('img'), mimetype: 'image/jpeg', originalname: 'shot.jpg' } as Express.Multer.File;
    const result = await service.uploadPhoto('order-1.sig', file);

    expect(api.postMultipart).toHaveBeenCalledWith(
      '/delivery-links/photos',
      { 'X-Delivery-Token': 'order-1.sig' },
      expect.any(FormData),
    );
    const form = api.postMultipart.mock.calls[0][2] as FormData;
    expect(form.get('photo')).toBeInstanceOf(Blob);
    expect(result).toEqual({ id: 'photo-1' });
  });

  it('forwards a photo delete with the token header and encodes the id', async () => {
    await service.deletePhoto('order-1.sig', 'ph/1');
    expect(api.delete).toHaveBeenCalledWith('/delivery-links/photos/ph%2F1', { 'X-Delivery-Token': 'order-1.sig' });
  });
});
