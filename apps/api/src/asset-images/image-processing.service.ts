import { Injectable, PayloadTooLargeException, UnprocessableEntityException, UnsupportedMediaTypeException } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: typeof import('sharp').default = require('sharp');
import { AssetTypeConfig, ProcessedVariants } from './asset-images.types';

@Injectable()
export class ImageProcessingService {
  async process(
    buffer: Buffer,
    mimetype: string,
    sizeBytes: number,
    config: AssetTypeConfig,
  ): Promise<ProcessedVariants> {
    if (!config.acceptedMimeTypes.includes(mimetype)) {
      throw new UnsupportedMediaTypeException(
        `File type '${mimetype}' is not supported. Accepted types: ${config.acceptedMimeTypes.join(', ')}`,
      );
    }

    if (sizeBytes > config.maxSizeBytes) {
      throw new PayloadTooLargeException(
        `File size ${sizeBytes} bytes exceeds maximum of ${config.maxSizeBytes} bytes`,
      );
    }

    const metadata = await sharp(buffer).metadata();
    const sourceWidth = metadata.width ?? 0;
    const sourceHeight = metadata.height ?? 0;

    if (
      sourceWidth < config.minDimensionPx ||
      sourceHeight < config.minDimensionPx
    ) {
      throw new UnprocessableEntityException(
        `Image dimensions ${sourceWidth}x${sourceHeight} are below the minimum of ${config.minDimensionPx}px`,
      );
    }

    if (
      sourceWidth > config.maxDimensionPx ||
      sourceHeight > config.maxDimensionPx
    ) {
      throw new UnprocessableEntityException(
        `Image dimensions ${sourceWidth}x${sourceHeight} exceed the maximum of ${config.maxDimensionPx}px`,
      );
    }

    const variantMap = new Map<string, { buffer: Buffer; width: number; height: number }>();

    await Promise.all(
      config.variants.map(async (variant) => {
        const { data, info } = await sharp(buffer)
          .resize(variant.width, variant.height, {
            fit: variant.fit,
            withoutEnlargement: true,
          })
          .webp({ quality: 85 })
          .toBuffer({ resolveWithObject: true });

        variantMap.set(variant.name, {
          buffer: data,
          width: info.width,
          height: info.height,
        });
      }),
    );

    return {
      variants: variantMap,
      sourceWidth,
      sourceHeight,
    };
  }
}
