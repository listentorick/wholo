import { Test, TestingModule } from '@nestjs/testing';
import { ManifestLogoService } from './logo.service';
import { PrismaService } from '../../prisma/prisma.service';
import { R2StorageService } from '../../asset-images/r2-storage.service';
import { ImageProcessingService } from '../../asset-images/image-processing.service';

describe('ManifestLogoService', () => {
  let service: ManifestLogoService;
  let prisma: { assetImage: { findFirst: jest.Mock } };
  let r2: { download: jest.Mock };
  let imageProcessing: { toPng: jest.Mock };

  beforeEach(async () => {
    prisma = { assetImage: { findFirst: jest.fn() } };
    r2 = { download: jest.fn() };
    imageProcessing = { toPng: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ManifestLogoService,
        { provide: PrismaService, useValue: prisma },
        { provide: R2StorageService, useValue: r2 },
        { provide: ImageProcessingService, useValue: imageProcessing },
      ],
    }).compile();

    service = module.get(ManifestLogoService);
  });

  it('returns null when the distributor has no logo uploaded', async () => {
    prisma.assetImage.findFirst.mockResolvedValue(null);
    const result = await service.getLogoPng('dist-1');
    expect(result).toBeNull();
    expect(r2.download).not.toHaveBeenCalled();
  });

  it('downloads the full variant and converts it to PNG', async () => {
    prisma.assetImage.findFirst.mockResolvedValue({
      variants: { full: 'distributors/dist-1/branding/logo/img-1/full.webp', thumb: 'distributors/dist-1/branding/logo/img-1/thumb.webp' },
    });
    const webpBuffer = Buffer.from('webp-bytes');
    const pngBuffer = Buffer.from('png-bytes');
    r2.download.mockResolvedValue(webpBuffer);
    imageProcessing.toPng.mockResolvedValue(pngBuffer);

    const result = await service.getLogoPng('dist-1');

    expect(r2.download).toHaveBeenCalledWith('distributors/dist-1/branding/logo/img-1/full.webp');
    expect(imageProcessing.toPng).toHaveBeenCalledWith(webpBuffer);
    expect(result).toBe(pngBuffer);
  });

  it('falls back to the thumb variant when full is unavailable', async () => {
    prisma.assetImage.findFirst.mockResolvedValue({ variants: { thumb: 'thumb-key' } });
    r2.download.mockResolvedValue(Buffer.from('x'));
    imageProcessing.toPng.mockResolvedValue(Buffer.from('y'));

    await service.getLogoPng('dist-1');

    expect(r2.download).toHaveBeenCalledWith('thumb-key');
  });

  it('returns null instead of throwing when the R2 download fails', async () => {
    prisma.assetImage.findFirst.mockResolvedValue({ variants: { full: 'key' } });
    r2.download.mockRejectedValue(new Error('network blip'));

    const result = await service.getLogoPng('dist-1');

    expect(result).toBeNull();
  });

  it('returns null instead of throwing when PNG conversion fails', async () => {
    prisma.assetImage.findFirst.mockResolvedValue({ variants: { full: 'key' } });
    r2.download.mockResolvedValue(Buffer.from('x'));
    imageProcessing.toPng.mockRejectedValue(new Error('bad image'));

    const result = await service.getLogoPng('dist-1');

    expect(result).toBeNull();
  });
});
