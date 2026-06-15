import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssetTypeRegistry, resolveKey } from './asset-type.registry';
import { ImageProcessingService } from './image-processing.service';
import { R2StorageService } from './r2-storage.service';
import { AssetImageRecord, UploadInput } from './asset-images.types';

@Injectable()
export class AssetImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly processing: ImageProcessingService,
    private readonly r2: R2StorageService,
  ) {}

  async upload(
    assetType: string,
    entityId: string,
    distributorId: string,
    file: UploadInput,
  ): Promise<AssetImageRecord> {
    const { config, validateOwnership } = AssetTypeRegistry.get(assetType);
    await validateOwnership(entityId, distributorId, this.prisma);

    const imageId = crypto.randomUUID();
    const processed = await this.processing.process(
      file.buffer,
      file.mimetype,
      file.size,
      config,
    );

    const variantKeys: Record<string, string> = {};
    const uploadTasks: Promise<void>[] = [];

    for (const [name, variant] of processed.variants) {
      const key = resolveKey(config.keyTemplate, {
        distributorId,
        entityId,
        imageId,
        variant: name,
      });
      variantKeys[name] = key;
      uploadTasks.push(this.r2.upload(key, variant.buffer, 'image/webp'));
    }

    await Promise.all(uploadTasks);

    const count = await this.prisma.assetImage.count({
      where: { assetType, entityId, distributorId },
    });

    const record = await this.prisma.assetImage.create({
      data: {
        id: imageId,
        assetType,
        entityId,
        distributorId,
        variants: variantKeys,
        sourceFilename: file.originalname ?? null,
        sourceMimeType: file.mimetype,
        sourceSizeBytes: file.size,
        sourceWidth: processed.sourceWidth,
        sourceHeight: processed.sourceHeight,
        sortOrder: count,
        isPrimary: count === 0,
      },
    });

    return this.formatRecord(record);
  }

  async list(
    assetType: string,
    entityId: string,
    distributorId: string,
  ): Promise<AssetImageRecord[]> {
    AssetTypeRegistry.get(assetType);

    const records = await this.prisma.assetImage.findMany({
      where: { assetType, entityId, distributorId },
      orderBy: { sortOrder: 'asc' },
    });

    return records.map((r) => this.formatRecord(r));
  }

  async delete(imageId: string, distributorId: string): Promise<void> {
    const image = await this.prisma.assetImage.findFirst({
      where: { id: imageId, distributorId },
    });

    if (!image) throw new NotFoundException('Image not found');

    const keys = Object.values(image.variants as Record<string, string>);
    await Promise.all(keys.map((key) => this.r2.delete(key)));
    await this.prisma.assetImage.delete({ where: { id: imageId } });

    if (image.isPrimary) {
      const next = await this.prisma.assetImage.findFirst({
        where: { assetType: image.assetType, entityId: image.entityId, distributorId },
        orderBy: { sortOrder: 'asc' },
      });
      if (next) {
        await this.prisma.assetImage.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }
  }

  async reorder(
    assetType: string,
    entityId: string,
    distributorId: string,
    imageIds: string[],
  ): Promise<AssetImageRecord[]> {
    AssetTypeRegistry.get(assetType);

    const existing = await this.prisma.assetImage.findMany({
      where: { assetType, entityId, distributorId },
      select: { id: true },
    });

    const existingIds = new Set(existing.map((r) => r.id));
    const invalid = imageIds.filter((id) => !existingIds.has(id));
    if (invalid.length > 0) {
      throw new NotFoundException(`Images not found: ${invalid.join(', ')}`);
    }

    await this.prisma.$transaction(
      imageIds.map((id, index) =>
        this.prisma.assetImage.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    return this.list(assetType, entityId, distributorId);
  }

  async deleteByEntity(
    assetType: string,
    entityId: string,
    distributorId: string,
  ): Promise<void> {
    const images = await this.prisma.assetImage.findMany({
      where: { assetType, entityId, distributorId },
    });

    await Promise.all(
      images.flatMap((img) =>
        Object.values(img.variants as Record<string, string>).map((key) =>
          this.r2.delete(key),
        ),
      ),
    );

    await this.prisma.assetImage.deleteMany({
      where: { assetType, entityId, distributorId },
    });
  }

  private formatRecord(record: {
    id: string;
    assetType: string;
    entityId: string;
    distributorId: string;
    variants: unknown;
    sourceFilename: string | null;
    sourceMimeType: string;
    sourceSizeBytes: number;
    sourceWidth: number | null;
    sourceHeight: number | null;
    sortOrder: number;
    isPrimary: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): AssetImageRecord {
    const keys = record.variants as Record<string, string>;
    const urls: Record<string, string> = {};
    for (const [name, key] of Object.entries(keys)) {
      urls[name] = this.r2.getPublicUrl(key);
    }
    return { ...record, variants: urls };
  }
}
