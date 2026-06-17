import { ForbiddenException } from '@nestjs/common';
import { AssetTypeRegistry } from './asset-type.registry';

AssetTypeRegistry.register('distributor-logo', {
  config: {
    keyTemplate: 'distributors/{distributorId}/branding/logo/{imageId}/{variant}.webp',
    variants: [
      { name: 'thumb', width: 200, height: 200, fit: 'cover' },
      { name: 'full',  width: 400, height: 400, fit: 'cover' },
    ],
    acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 5 * 1024 * 1024,
    minDimensionPx: 50,
    maxDimensionPx: 8000,
  },
  validateOwnership: async (entityId, distributorId) => {
    if (entityId !== distributorId) throw new ForbiddenException('Not authorised');
  },
});

AssetTypeRegistry.register('distributor-banner', {
  config: {
    keyTemplate: 'distributors/{distributorId}/branding/banner/{imageId}/{variant}.webp',
    variants: [
      { name: 'mobile',   width: 900,  height: 320, fit: 'cover' },
      { name: 'desktop', width: 1920, height: 480, fit: 'cover' },
    ],
    acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 10 * 1024 * 1024,
    minDimensionPx: 200,
    maxDimensionPx: 8000,
    extractDominantColor: true,
  },
  validateOwnership: async (entityId, distributorId) => {
    if (entityId !== distributorId) throw new ForbiddenException('Not authorised');
  },
});
