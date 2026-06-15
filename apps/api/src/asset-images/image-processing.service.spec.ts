import { PayloadTooLargeException, UnprocessableEntityException, UnsupportedMediaTypeException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: typeof import('sharp').default = require('sharp');
import { ImageProcessingService } from './image-processing.service';
import { AssetTypeConfig } from './asset-images.types';

const TEST_CONFIG: AssetTypeConfig = {
  keyTemplate: 'test/{variant}.webp',
  variants: [
    { name: 'thumb',     width: 100, height: 100, fit: 'cover'  },
    { name: 'catalogue', width: 300, height: 300, fit: 'inside' },
  ],
  acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  maxSizeBytes: 5 * 1024 * 1024,
  minDimensionPx: 50,
  maxDimensionPx: 5000,
};

describe('ImageProcessingService', () => {
  let service: ImageProcessingService;
  let png200: Buffer;
  let png30: Buffer;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [ImageProcessingService],
    }).compile();
    service = module.get(ImageProcessingService);

    png200 = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 100, g: 150, b: 200 } },
    })
      .png()
      .toBuffer();

    png30 = await sharp({
      create: { width: 30, height: 30, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
  });

  it('processes a valid PNG into WebP variants', async () => {
    const result = await service.process(png200, 'image/png', png200.length, TEST_CONFIG);

    expect(result.variants.size).toBe(2);
    expect(result.sourceWidth).toBe(200);
    expect(result.sourceHeight).toBe(200);

    const thumb = result.variants.get('thumb')!;
    expect(thumb.buffer).toBeInstanceOf(Buffer);
    expect(thumb.buffer.length).toBeGreaterThan(0);
    expect(thumb.width).toBe(100);
    expect(thumb.height).toBe(100);

    const catalogue = result.variants.get('catalogue')!;
    expect(catalogue.width).toBeLessThanOrEqual(300);
  });

  it('respects withoutEnlargement — catalogue variant not enlarged beyond source', async () => {
    const result = await service.process(png200, 'image/png', png200.length, TEST_CONFIG);
    const catalogue = result.variants.get('catalogue')!;
    // source is 200x200, catalogue max is 300x300 — should stay at 200x200
    expect(catalogue.width).toBeLessThanOrEqual(200);
    expect(catalogue.height).toBeLessThanOrEqual(200);
  });

  it('processes a WebP input successfully', async () => {
    const webpBuffer = await sharp(png200).webp().toBuffer();
    const result = await service.process(webpBuffer, 'image/webp', webpBuffer.length, TEST_CONFIG);
    expect(result.variants.size).toBe(2);
  });

  it('throws UnsupportedMediaTypeException for image/gif', async () => {
    await expect(
      service.process(png200, 'image/gif', png200.length, TEST_CONFIG),
    ).rejects.toThrow(UnsupportedMediaTypeException);
  });

  it('throws UnsupportedMediaTypeException for image/svg+xml', async () => {
    await expect(
      service.process(png200, 'image/svg+xml', png200.length, TEST_CONFIG),
    ).rejects.toThrow(UnsupportedMediaTypeException);
  });

  it('throws UnsupportedMediaTypeException for image/heic', async () => {
    await expect(
      service.process(png200, 'image/heic', png200.length, TEST_CONFIG),
    ).rejects.toThrow(UnsupportedMediaTypeException);
  });

  it('throws PayloadTooLargeException when file exceeds max size', async () => {
    await expect(
      service.process(png200, 'image/png', TEST_CONFIG.maxSizeBytes + 1, TEST_CONFIG),
    ).rejects.toThrow(PayloadTooLargeException);
  });

  it('throws UnprocessableEntityException for image below minDimensionPx', async () => {
    await expect(
      service.process(png30, 'image/png', png30.length, TEST_CONFIG),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('includes correct variant names from config', async () => {
    const result = await service.process(png200, 'image/png', png200.length, TEST_CONFIG);
    expect(result.variants.has('thumb')).toBe(true);
    expect(result.variants.has('catalogue')).toBe(true);
  });
});
