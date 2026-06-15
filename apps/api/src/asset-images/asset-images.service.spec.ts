import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AssetImagesService } from './asset-images.service';
import { ImageProcessingService } from './image-processing.service';
import { R2StorageService } from './r2-storage.service';
import { AssetTypeRegistry } from './asset-type.registry';
import { PrismaService } from '../prisma/prisma.service';

const DIST_A = 'dist-a-id';
const ENTITY_ID = 'entity-id-1';
const IMAGE_ID = 'test-image-uuid';

const mockConfig = {
  keyTemplate: 'distributors/{distributorId}/entities/{entityId}/images/{imageId}/{variant}.webp',
  variants: [
    { name: 'thumb',     width: 100, height: 100, fit: 'cover'  as const },
    { name: 'catalogue', width: 300, height: 300, fit: 'inside' as const },
  ],
  acceptedMimeTypes: ['image/png'],
  maxSizeBytes: 5 * 1024 * 1024,
  minDimensionPx: 50,
  maxDimensionPx: 5000,
};

const mockOwnershipValidator = jest.fn().mockResolvedValue(undefined);

describe('AssetImagesService', () => {
  let service: AssetImagesService;
  let prisma: jest.Mocked<PrismaService>;
  let processing: jest.Mocked<ImageProcessingService>;
  let r2: jest.Mocked<R2StorageService>;

  const mockVariants = new Map([
    ['thumb',     { buffer: Buffer.from('thumb'),     width: 100, height: 100 }],
    ['catalogue', { buffer: Buffer.from('catalogue'), width: 200, height: 200 }],
  ]);

  beforeAll(() => {
    AssetTypeRegistry.register('test-asset', {
      config: mockConfig,
      validateOwnership: mockOwnershipValidator,
    });
  });

  beforeEach(async () => {
    mockOwnershipValidator.mockResolvedValue(undefined);

    const module = await Test.createTestingModule({
      providers: [
        AssetImagesService,
        {
          provide: PrismaService,
          useValue: {
            assetImage: {
              count: jest.fn(),
              create: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
              delete: jest.fn(),
              deleteMany: jest.fn(),
              update: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
        {
          provide: ImageProcessingService,
          useValue: {
            process: jest.fn().mockResolvedValue({
              variants: mockVariants,
              sourceWidth: 400,
              sourceHeight: 400,
            }),
          },
        },
        {
          provide: R2StorageService,
          useValue: {
            upload: jest.fn().mockResolvedValue(undefined),
            delete: jest.fn().mockResolvedValue(undefined),
            getPublicUrl: jest.fn((key: string) => `https://cdn.example.com/${key}`),
          },
        },
      ],
    }).compile();

    service = module.get(AssetImagesService);
    prisma = module.get(PrismaService);
    processing = module.get(ImageProcessingService);
    r2 = module.get(R2StorageService);
  });

  describe('upload', () => {
    const file = { buffer: Buffer.from('img'), originalname: 'test.png', mimetype: 'image/png', size: 1024 };

    const mockRecord = {
      id: IMAGE_ID,
      assetType: 'test-asset',
      entityId: ENTITY_ID,
      distributorId: DIST_A,
      variants: { thumb: 'key/thumb.webp', catalogue: 'key/catalogue.webp' },
      sourceFilename: 'test.png',
      sourceMimeType: 'image/png',
      sourceSizeBytes: 1024,
      sourceWidth: 400,
      sourceHeight: 400,
      sortOrder: 0,
      isPrimary: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      (prisma.assetImage.count as jest.Mock).mockResolvedValue(0);
      (prisma.assetImage.create as jest.Mock).mockResolvedValue(mockRecord);
    });

    it('throws BadRequestException for unknown assetType', async () => {
      await expect(service.upload('unknown-type', ENTITY_ID, DIST_A, file))
        .rejects.toThrow(BadRequestException);
    });

    it('calls validateOwnership with correct args', async () => {
      await service.upload('test-asset', ENTITY_ID, DIST_A, file);
      expect(mockOwnershipValidator).toHaveBeenCalledWith(ENTITY_ID, DIST_A, prisma);
    });

    it('throws NotFoundException when ownership validation fails', async () => {
      mockOwnershipValidator.mockRejectedValueOnce(new NotFoundException('not found'));
      await expect(service.upload('test-asset', ENTITY_ID, DIST_A, file))
        .rejects.toThrow(NotFoundException);
    });

    it('calls processing.process with file data and config', async () => {
      await service.upload('test-asset', ENTITY_ID, DIST_A, file);
      expect(processing.process).toHaveBeenCalledWith(
        file.buffer, file.mimetype, file.size, mockConfig,
      );
    });

    it('uploads all variants in parallel to R2', async () => {
      await service.upload('test-asset', ENTITY_ID, DIST_A, file);
      expect(r2.upload).toHaveBeenCalledTimes(2);
      expect(r2.upload).toHaveBeenCalledWith(
        expect.stringContaining('thumb'), mockVariants.get('thumb')!.buffer, 'image/webp',
      );
      expect(r2.upload).toHaveBeenCalledWith(
        expect.stringContaining('catalogue'), mockVariants.get('catalogue')!.buffer, 'image/webp',
      );
    });

    it('sets isPrimary true and sortOrder 0 for first image', async () => {
      (prisma.assetImage.count as jest.Mock).mockResolvedValue(0);
      await service.upload('test-asset', ENTITY_ID, DIST_A, file);
      expect(prisma.assetImage.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isPrimary: true, sortOrder: 0 }) }),
      );
    });

    it('sets isPrimary false and correct sortOrder for subsequent images', async () => {
      (prisma.assetImage.count as jest.Mock).mockResolvedValue(3);
      (prisma.assetImage.create as jest.Mock).mockResolvedValue({ ...mockRecord, isPrimary: false, sortOrder: 3 });
      await service.upload('test-asset', ENTITY_ID, DIST_A, file);
      expect(prisma.assetImage.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isPrimary: false, sortOrder: 3 }) }),
      );
    });

    it('stores variant keys (not URLs) in DB', async () => {
      await service.upload('test-asset', ENTITY_ID, DIST_A, file);
      const createCall = (prisma.assetImage.create as jest.Mock).mock.calls[0][0];
      const variants = createCall.data.variants;
      expect(Object.values(variants as Record<string, string>).every(v => !v.startsWith('https://'))).toBe(true);
    });

    it('returns record with URLs (not keys) in variants', async () => {
      const result = await service.upload('test-asset', ENTITY_ID, DIST_A, file);
      expect(result.variants['thumb']).toContain('https://cdn.example.com/');
    });
  });

  describe('delete', () => {
    const image = {
      id: IMAGE_ID,
      assetType: 'test-asset',
      entityId: ENTITY_ID,
      distributorId: DIST_A,
      variants: { thumb: 'key/thumb.webp', catalogue: 'key/catalogue.webp' },
      isPrimary: false,
      sortOrder: 1,
    };

    beforeEach(() => {
      (prisma.assetImage.findFirst as jest.Mock).mockResolvedValue(image);
      (prisma.assetImage.delete as jest.Mock).mockResolvedValue(image);
    });

    it('throws NotFoundException when image not found', async () => {
      (prisma.assetImage.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(service.delete(IMAGE_ID, DIST_A)).rejects.toThrow(NotFoundException);
    });

    it('deletes all variant keys from R2', async () => {
      await service.delete(IMAGE_ID, DIST_A);
      expect(r2.delete).toHaveBeenCalledTimes(2);
      expect(r2.delete).toHaveBeenCalledWith('key/thumb.webp');
      expect(r2.delete).toHaveBeenCalledWith('key/catalogue.webp');
    });

    it('deletes DB record after R2 deletion', async () => {
      await service.delete(IMAGE_ID, DIST_A);
      expect(prisma.assetImage.delete).toHaveBeenCalledWith({ where: { id: IMAGE_ID } });
    });

    it('promotes next image to primary when deleted image was primary', async () => {
      (prisma.assetImage.findFirst as jest.Mock)
        .mockResolvedValueOnce({ ...image, isPrimary: true })
        .mockResolvedValueOnce({ id: 'next-id', isPrimary: false });
      await service.delete(IMAGE_ID, DIST_A);
      expect(prisma.assetImage.update).toHaveBeenCalledWith({
        where: { id: 'next-id' },
        data: { isPrimary: true },
      });
    });

    it('does not promote when deleted image was not primary', async () => {
      await service.delete(IMAGE_ID, DIST_A);
      expect(prisma.assetImage.update).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('throws BadRequestException for unknown assetType', async () => {
      await expect(service.list('unknown-type', ENTITY_ID, DIST_A))
        .rejects.toThrow(BadRequestException);
    });

    it('returns images ordered by sortOrder', async () => {
      const records = [
        { id: '1', assetType: 'test-asset', entityId: ENTITY_ID, distributorId: DIST_A, variants: {}, sourceFilename: null, sourceMimeType: 'image/png', sourceSizeBytes: 100, sourceWidth: 200, sourceHeight: 200, sortOrder: 0, isPrimary: true, createdAt: new Date(), updatedAt: new Date() },
      ];
      (prisma.assetImage.findMany as jest.Mock).mockResolvedValue(records);
      const result = await service.list('test-asset', ENTITY_ID, DIST_A);
      expect(prisma.assetImage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { assetType: 'test-asset', entityId: ENTITY_ID, distributorId: DIST_A }, orderBy: { sortOrder: 'asc' } }),
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('reorder', () => {
    it('throws NotFoundException when imageIds include foreign images', async () => {
      (prisma.assetImage.findMany as jest.Mock).mockResolvedValue([{ id: 'known-id' }]);
      await expect(service.reorder('test-asset', ENTITY_ID, DIST_A, ['known-id', 'unknown-id']))
        .rejects.toThrow(NotFoundException);
    });

    it('updates sortOrder for each image in given order', async () => {
      (prisma.assetImage.findMany as jest.Mock)
        .mockResolvedValueOnce([{ id: 'id-1' }, { id: 'id-2' }]) // ownership check
        .mockResolvedValueOnce([]); // list after reorder
      (prisma.$transaction as jest.Mock).mockResolvedValue([]);
      await service.reorder('test-asset', ENTITY_ID, DIST_A, ['id-2', 'id-1']);
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });
});
