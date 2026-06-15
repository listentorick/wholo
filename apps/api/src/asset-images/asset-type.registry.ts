import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssetTypeConfig } from './asset-images.types';

export type OwnershipValidator = (
  entityId: string,
  distributorId: string,
  prisma: PrismaService,
) => Promise<void>;

export interface AssetTypeEntry {
  config: AssetTypeConfig;
  validateOwnership: OwnershipValidator;
}

export class AssetTypeRegistry {
  private static entries = new Map<string, AssetTypeEntry>();

  static register(assetType: string, entry: AssetTypeEntry): void {
    this.entries.set(assetType, entry);
  }

  static get(assetType: string): AssetTypeEntry {
    const entry = this.entries.get(assetType);
    if (!entry) throw new BadRequestException(`Unknown asset type: ${assetType}`);
    return entry;
  }

  static has(assetType: string): boolean {
    return this.entries.has(assetType);
  }
}

export function resolveKey(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replace(`{${k}}`, v),
    template,
  );
}
