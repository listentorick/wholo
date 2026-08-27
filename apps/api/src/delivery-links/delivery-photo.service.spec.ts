import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, GoneException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DeliveryPhotoService } from './delivery-photo.service';
import { PrismaService } from '../prisma/prisma.service';
import { ImageProcessingService } from '../asset-images/image-processing.service';
import { R2StorageService } from '../asset-images/r2-storage.service';

const order = { id: 'order-1', distributorId: 'dist-1' };

const processed = {
  variants: new Map([
    ['full', { buffer: Buffer.from('full'), width: 1600, height: 1200 }],
    ['thumb', { buffer: Buffer.from('thumb'), width: 400, height: 400 }],
  ]),
  sourceWidth: 4000,
  sourceHeight: 3000,
};

describe('DeliveryPhotoService', () => {
  let service: DeliveryPhotoService;
  let prisma: {
    orderDeliveryOutcome: { findUnique: jest.Mock };
    orderDeliveryPhoto: { count: jest.Mock; create: jest.Mock; findFirst: jest.Mock; delete: jest.Mock };
  };
  let imageProcessing: { process: jest.Mock };
  let r2: { upload: jest.Mock; delete: jest.Mock; getPublicUrl: jest.Mock };

  beforeEach(async () => {
    prisma = {
      orderDeliveryOutcome: { findUnique: jest.fn().mockResolvedValue(null) },
      orderDeliveryPhoto: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    imageProcessing = { process: jest.fn().mockResolvedValue(processed) };
    r2 = {
      upload: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      getPublicUrl: jest.fn((key: string) => `https://cdn.example.com/${key}`),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryPhotoService,
        { provide: PrismaService, useValue: prisma },
        { provide: ImageProcessingService, useValue: imageProcessing },
        { provide: R2StorageService, useValue: r2 },
      ],
    }).compile();

    service = module.get(DeliveryPhotoService);
  });

  describe('uploadPhoto', () => {
    it('processes, uploads each variant to R2, stores keys (not URLs), and returns the thumb URL', async () => {
      const result = await service.uploadPhoto(order, Buffer.from('img'), 'image/jpeg', 1234);

      expect(r2.upload).toHaveBeenCalledTimes(2);
      expect(r2.upload).toHaveBeenCalledWith(expect.stringContaining('/full.webp'), processed.variants.get('full')!.buffer, 'image/webp');

      const created = prisma.orderDeliveryPhoto.create.mock.calls[0][0].data;
      expect(created.orderId).toBe('order-1');
      expect(created.distributorId).toBe('dist-1');
      expect(created.variants.full).toMatch(/^distributors\/dist-1\/deliveries\/order-1\/.+\/full\.webp$/);
      expect(created.variants.full).not.toContain('https://');
      expect(created.sourceSizeBytes).toBe(1234);

      expect(result.thumbnailUrl).toBe(`https://cdn.example.com/${created.variants.thumb}`);
      expect(result.id).toBe(created.id);
    });

    it('rejects once the delivery outcome has been recorded', async () => {
      prisma.orderDeliveryOutcome.findUnique.mockResolvedValue({ id: 'outcome-1' });
      await expect(service.uploadPhoto(order, Buffer.from('img'), 'image/jpeg', 1)).rejects.toThrow(GoneException);
      expect(r2.upload).not.toHaveBeenCalled();
    });

    it('rejects the 11th photo', async () => {
      prisma.orderDeliveryPhoto.count.mockResolvedValue(10);
      await expect(service.uploadPhoto(order, Buffer.from('img'), 'image/jpeg', 1)).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('deletePhoto', () => {
    it('removes every variant object from R2 and the row', async () => {
      const full = 'distributors/dist-1/deliveries/order-1/ph-1/full.webp';
      const thumb = 'distributors/dist-1/deliveries/order-1/ph-1/thumb.webp';
      prisma.orderDeliveryPhoto.findFirst.mockResolvedValue({ id: 'ph-1', outcomeId: null, variants: { full, thumb } });

      await service.deletePhoto(order, 'ph-1');

      expect(r2.delete).toHaveBeenCalledWith(full);
      expect(r2.delete).toHaveBeenCalledWith(thumb);
      expect(prisma.orderDeliveryPhoto.delete).toHaveBeenCalledWith({ where: { id: 'ph-1' } });
    });

    it('never deletes an R2 key outside this order’s own prefix', async () => {
      prisma.orderDeliveryPhoto.findFirst.mockResolvedValue({
        id: 'ph-1',
        outcomeId: null,
        variants: { full: 'distributors/other-dist/deliveries/other-order/x/full.webp' },
      });

      await service.deletePhoto(order, 'ph-1');

      expect(r2.delete).not.toHaveBeenCalled();
      expect(prisma.orderDeliveryPhoto.delete).toHaveBeenCalledWith({ where: { id: 'ph-1' } });
    });

    it('404s an unknown / other-order photo', async () => {
      prisma.orderDeliveryPhoto.findFirst.mockResolvedValue(null);
      await expect(service.deletePhoto(order, 'ph-x')).rejects.toThrow(NotFoundException);
    });

    it('409s a photo already linked to a recorded outcome', async () => {
      prisma.orderDeliveryPhoto.findFirst.mockResolvedValue({ id: 'ph-1', outcomeId: 'outcome-1', variants: {} });
      await expect(service.deletePhoto(order, 'ph-1')).rejects.toThrow(ConflictException);
      expect(r2.delete).not.toHaveBeenCalled();
    });
  });
});
