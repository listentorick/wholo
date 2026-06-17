import { ForbiddenException } from '@nestjs/common';
import './branding-asset-types';
import { AssetTypeRegistry } from './asset-type.registry';

describe('branding asset types', () => {
  describe('distributor-logo', () => {
    const entry = AssetTypeRegistry.get('distributor-logo');

    it('is registered', () => {
      expect(entry).toBeDefined();
    });

    it('has thumb and full variants', () => {
      const names = entry.config.variants.map((v) => v.name);
      expect(names).toContain('thumb');
      expect(names).toContain('full');
    });

    it('does not extract dominant color', () => {
      expect(entry.config.extractDominantColor).toBeFalsy();
    });

    describe('validateOwnership', () => {
      it('passes when entityId equals distributorId', async () => {
        await expect(entry.validateOwnership('dist-1', 'dist-1', null as never)).resolves.toBeUndefined();
      });

      it('throws ForbiddenException when entityId does not match distributorId', async () => {
        await expect(entry.validateOwnership('dist-1', 'dist-2', null as never)).rejects.toThrow(ForbiddenException);
      });
    });
  });

  describe('distributor-banner', () => {
    const entry = AssetTypeRegistry.get('distributor-banner');

    it('is registered', () => {
      expect(entry).toBeDefined();
    });

    it('has mobile and desktop variants', () => {
      const names = entry.config.variants.map((v) => v.name);
      expect(names).toContain('mobile');
      expect(names).toContain('desktop');
    });

    it('extracts dominant color', () => {
      expect(entry.config.extractDominantColor).toBe(true);
    });

    describe('validateOwnership', () => {
      it('passes when entityId equals distributorId', async () => {
        await expect(entry.validateOwnership('dist-1', 'dist-1', null as never)).resolves.toBeUndefined();
      });

      it('throws ForbiddenException when entityId does not match distributorId', async () => {
        await expect(entry.validateOwnership('dist-1', 'dist-2', null as never)).rejects.toThrow(ForbiddenException);
      });
    });
  });
});
