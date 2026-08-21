import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { R2StorageService } from '../../asset-images/r2-storage.service';
import { ImageProcessingService } from '../../asset-images/image-processing.service';

const DISTRIBUTOR_LOGO_ASSET_TYPE = 'distributor-logo';

@Injectable()
export class ManifestLogoService {
  private readonly logger = new Logger(ManifestLogoService.name);

  constructor(
    private prisma: PrismaService,
    private r2: R2StorageService,
    private imageProcessing: ImageProcessingService,
  ) {}

  // Never throws — a logo problem (missing upload, R2 blip, bad image) must
  // not fail manifest generation. Bypasses AssetImagesService.list(), which
  // returns public URLs rather than the raw R2 key a direct S3 download needs.
  async getLogoPng(distributorId: string): Promise<Buffer | null> {
    const record = await this.prisma.assetImage.findFirst({
      where: {
        assetType: DISTRIBUTOR_LOGO_ASSET_TYPE,
        entityId: distributorId,
        distributorId,
      },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    });
    if (!record) return null;

    const variants = record.variants as Record<string, string>;
    const key = variants.full ?? variants.thumb;
    if (!key) return null;

    try {
      const webp = await this.r2.download(key);
      return await this.imageProcessing.toPng(webp);
    } catch (err) {
      this.logger.warn(`Failed to fetch/convert distributor logo for manifest (distributorId=${distributorId}): ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }
}
