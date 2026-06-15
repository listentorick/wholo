import { NotFoundException } from '@nestjs/common';
import { AssetTypeRegistry } from '../asset-images/asset-type.registry';

AssetTypeRegistry.register('product-image', {
  config: {
    keyTemplate:
      'distributors/{distributorId}/products/{entityId}/images/{imageId}/{variant}.webp',
    variants: [
      { name: 'thumb',     width: 200,  height: 200,  fit: 'cover'  },
      { name: 'catalogue', width: 600,  height: 600,  fit: 'inside' },
      { name: 'large',     width: 1200, height: 1200, fit: 'inside' },
    ],
    acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 10 * 1024 * 1024,
    minDimensionPx: 100,
    maxDimensionPx: 8000,
  },
  validateOwnership: async (entityId, distributorId, prisma) => {
    const product = await prisma.product.findFirst({
      where: { id: entityId, distributorId, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Product not found');
  },
});
