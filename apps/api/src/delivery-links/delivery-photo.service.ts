import * as crypto from 'crypto';
import { ConflictException, GoneException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImageProcessingService } from '../asset-images/image-processing.service';
import { R2StorageService } from '../asset-images/r2-storage.service';
import { AssetTypeConfig } from '../asset-images/asset-images.types';

const MAX_PHOTOS_PER_DELIVERY = 10;

// Delivery proof photos can contain PII (people, premises, parcel labels), so
// they live in a private bucket and are only ever handed out as short-lived
// presigned URLs — long enough to view a delivery once, short enough that a
// copied link stops working quickly.
const PHOTO_URL_TTL_SECONDS = 900;

// Reuses the shared sharp pipeline (ImageProcessingService.process) for MIME /
// size / dimension validation + webp variant generation. keyTemplate is unused
// here — this service resolves R2 keys itself.
const DELIVERY_PHOTO_CONFIG: AssetTypeConfig = {
  keyTemplate: '',
  acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  maxSizeBytes: 12 * 1024 * 1024,
  minDimensionPx: 100,
  maxDimensionPx: 12000,
  variants: [
    { name: 'full', width: 1600, height: 1600, fit: 'inside' },
    { name: 'thumb', width: 400, height: 400, fit: 'cover' },
  ],
};

export interface DeliveryPhotoDto {
  id: string;
  thumbnailUrl: string;
}

interface OrderContext {
  id: string;
  distributorId: string;
}

@Injectable()
export class DeliveryPhotoService {
  constructor(
    private prisma: PrismaService,
    private imageProcessing: ImageProcessingService,
    private r2: R2StorageService,
  ) {}

  async uploadPhoto(order: OrderContext, buffer: Buffer, mimetype: string, size: number): Promise<DeliveryPhotoDto> {
    // Once the outcome is recorded the delivery is closed — mirrors the
    // read-only rule the QR page enforces after submission.
    const existingOutcome = await this.prisma.orderDeliveryOutcome.findUnique({
      where: { orderId: order.id },
      select: { id: true },
    });
    if (existingOutcome) throw new GoneException();

    const count = await this.prisma.orderDeliveryPhoto.count({ where: { orderId: order.id } });
    if (count >= MAX_PHOTOS_PER_DELIVERY) {
      throw new UnprocessableEntityException(`A delivery can have at most ${MAX_PHOTOS_PER_DELIVERY} photos`);
    }

    const processed = await this.imageProcessing.process(buffer, mimetype, size, DELIVERY_PHOTO_CONFIG);

    // R2 layout mirrors the branding/products convention — one new folder
    // `deliveries/` at the same level, then partitioned by order then photo so
    // an order's proof (or a whole distributor's) can be swept by key prefix:
    //   distributors/{distributorId}/deliveries/{orderId}/{photoId}/{variant}.webp
    const photoId = crypto.randomUUID();
    const variantKeys: Record<string, string> = {};
    await Promise.all(
      [...processed.variants.entries()].map(async ([name, variant]) => {
        const key = `distributors/${order.distributorId}/deliveries/${order.id}/${photoId}/${name}.webp`;
        variantKeys[name] = key;
        await this.r2.upload(key, variant.buffer, 'image/webp', this.r2.deliveryBucket);
      }),
    );

    await this.prisma.orderDeliveryPhoto.create({
      data: {
        id: photoId,
        orderId: order.id,
        distributorId: order.distributorId,
        variants: variantKeys,
        sourceMimeType: mimetype,
        sourceSizeBytes: size,
        sourceWidth: processed.sourceWidth,
        sourceHeight: processed.sourceHeight,
        sortOrder: count,
      },
    });

    return {
      id: photoId,
      thumbnailUrl: await this.r2.presignGetUrl(variantKeys.thumb, PHOTO_URL_TTL_SECONDS, this.r2.deliveryBucket),
    };
  }

  async deletePhoto(order: OrderContext, photoId: string): Promise<void> {
    // Scope the lookup to this token's order — a token can only ever touch its
    // own order's photos, never another's.
    const photo = await this.prisma.orderDeliveryPhoto.findFirst({
      where: { id: photoId, orderId: order.id },
      select: { id: true, outcomeId: true, variants: true },
    });
    if (!photo) throw new NotFoundException();
    if (photo.outcomeId) throw new ConflictException('This photo is already part of a recorded delivery');

    // R2 keys come only from the row we just loaded (written by uploadPhoto from
    // server-controlled ids), never from the request. Belt-and-braces: refuse to
    // delete anything outside this order's own prefix, and delete objects one by
    // one — R2/S3 DeleteObject is single-key, there is no recursive/prefix
    // delete anywhere in this codepath.
    const prefix = `distributors/${order.distributorId}/deliveries/${order.id}/`;
    const keys = Object.values(photo.variants as Record<string, string>).filter(
      (key) => typeof key === 'string' && key.startsWith(prefix),
    );
    await Promise.all(keys.map((key) => this.r2.delete(key, this.r2.deliveryBucket)));
    await this.prisma.orderDeliveryPhoto.delete({ where: { id: photo.id } });
  }
}
