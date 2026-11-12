import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import { basename, extname, join } from 'path';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import '../../../src/asset-images/branding-asset-types';
import '../../../src/admin-products/product-image.asset-config';
import { AssetTypeRegistry, resolveKey } from '../../../src/asset-images/asset-type.registry';
import { ImageProcessingService } from '../../../src/asset-images/image-processing.service';
import { R2StorageService } from '../../../src/asset-images/r2-storage.service';
import { DOCS_DISTRIBUTOR_ID } from './ids';

/**
 * Images for seeds (logo, banner, product photos), stored the way the app's upload stores
 * them: an AssetImage row whose variants point at webp files in R2.
 *
 * Each file goes to R2 once. The image id is a hash of the asset type and the file's bytes,
 * so the same file always lands on the same keys; before uploading, each key is checked and
 * only missing ones are processed and sent. Teardown and clear delete the rows, never the
 * files (they stay as a cache for the next seed). A changed source file gets a new id, so a
 * seed can never show a stale picture.
 */

export const ASSETS_DIR = join(__dirname, '..', 'assets');

/** Where the files go. The real one is the cluster's R2 bucket; tests swap in a fake. */
export interface ImageStore {
  exists(key: string): Promise<boolean>;
  upload(key: string, body: Buffer, contentType: string): Promise<void>;
}

let store: ImageStore | null = null;

/** Replaces the store (tests). Pass null to go back to the cluster's R2 bucket. */
export function setImageStore(next: ImageStore | null): void {
  store = next;
}

/**
 * The running API's own R2 settings, read from the cluster, so seeded images land in the
 * bucket the app serves them from. Never logged.
 */
function clusterR2(): ImageStore {
  const kube = (args: string[]) => execFileSync('kubectl', args, { encoding: 'utf8' }).trim();
  const settings: Record<string, string> = {};
  for (const key of ['R2_ACCOUNT_ID', 'R2_BUCKET_NAME', 'R2_DELIVERY_BUCKET_NAME', 'R2_PUBLIC_BASE_URL']) {
    settings[key] = kube(['get', 'configmap', 'wholo-api', '-o', `jsonpath={.data.${key}}`]);
  }
  for (const key of ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) {
    settings[key] = Buffer.from(kube(['get', 'secret', 'wholo-api', '-o', `jsonpath={.data.${key}}`]), 'base64').toString('utf8');
  }
  const r2 = new R2StorageService({
    getOrThrow: (key: string) => {
      if (!settings[key]) throw new Error(`The cluster's wholo-api settings have no ${key}; is R2 set up in values.local.yaml?`);
      return settings[key];
    },
  } as unknown as ConfigService);
  return { exists: (key) => r2.exists(key), upload: (key, body, type) => r2.upload(key, body, type) };
}

function imageStore(): ImageStore {
  if (!store) store = clusterR2();
  return store;
}

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

/** The id an image gets: the same for the same type and bytes, every time. */
export function seedImageId(assetType: string, bytes: Buffer): string {
  return `docs-img-${createHash('sha256').update(assetType).update(bytes).digest('hex').slice(0, 16)}`;
}

export interface SeedImage {
  /** 'distributor-logo', 'distributor-banner' or 'product-image'. */
  assetType: string;
  /** The distributor (logo, banner) or product the image belongs to. */
  entityId: string;
  /** Path under scripts/docs-scenarios/assets/. */
  file: string;
}

/** Uploads what's missing from R2 and adds the AssetImage rows. Returns how many files were uploaded. */
export async function addImages(prisma: PrismaClient, images: SeedImage[]): Promise<number> {
  const processing = new ImageProcessingService();
  let uploaded = 0;
  const countByEntity = new Map<string, number>();

  for (const image of images) {
    const { config } = AssetTypeRegistry.get(image.assetType);
    const bytes = readFileSync(join(ASSETS_DIR, image.file));
    const mimetype = MIME[extname(image.file).toLowerCase()];
    if (!mimetype) throw new Error(`Unsupported image file ${image.file}`);
    const id = seedImageId(image.assetType, bytes);

    const keys: Record<string, string> = {};
    for (const variant of config.variants) {
      keys[variant.name] = resolveKey(config.keyTemplate, {
        distributorId: DOCS_DISTRIBUTOR_ID,
        entityId: image.entityId,
        imageId: id,
        variant: variant.name,
      });
    }

    const missing: string[] = [];
    for (const [name, key] of Object.entries(keys)) {
      if (!(await imageStore().exists(key))) missing.push(name);
    }
    // Processing validates the file as an upload would (type, size, dimensions), so it runs
    // every time; it's local and quick. Only the upload is skipped.
    const processed = await processing.process(bytes, mimetype, bytes.length, config);
    for (const name of missing) {
      await imageStore().upload(keys[name], processed.variants.get(name)!.buffer, 'image/webp');
      uploaded += 1;
    }

    const entityKey = `${image.assetType}:${image.entityId}`;
    const sortOrder = countByEntity.get(entityKey) ?? 0;
    countByEntity.set(entityKey, sortOrder + 1);

    await prisma.assetImage.create({
      data: {
        id,
        assetType: image.assetType,
        entityId: image.entityId,
        distributorId: DOCS_DISTRIBUTOR_ID,
        variants: keys,
        dominantColor: config.extractDominantColor ? await dominantColor(bytes) : null,
        sourceFilename: basename(image.file),
        sourceMimeType: mimetype,
        sourceSizeBytes: bytes.length,
        sourceWidth: processed.sourceWidth,
        sourceHeight: processed.sourceHeight,
        sortOrder,
        isPrimary: sortOrder === 0,
      },
    });
  }
  return uploaded;
}

/** The banner's average colour, worked out as AssetImagesService does on upload. */
async function dominantColor(bytes: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sharp = require('sharp') as typeof import('sharp').default;
  const { data } = await sharp(bytes).resize(1, 1).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return `#${[data[0], data[1], data[2]].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Vine & Co's storefront look: its logo and banner, and a photo on each of its products that
 * has one in assets/products/ (named by SKU). Call it after adding the products.
 */
export async function addBranding(prisma: PrismaClient): Promise<number> {
  const products = await prisma.product.findMany({
    where: { distributorId: DOCS_DISTRIBUTOR_ID, deletedAt: null },
    select: { id: true, sku: true },
  });
  const photos = new Set(readdirSync(join(ASSETS_DIR, 'products')));
  const images: SeedImage[] = [
    { assetType: 'distributor-logo', entityId: DOCS_DISTRIBUTOR_ID, file: 'vine-and-co-logo.png' },
    { assetType: 'distributor-banner', entityId: DOCS_DISTRIBUTOR_ID, file: 'vine-and-co-banner.png' },
  ];
  for (const product of products) {
    const file = [...photos].find((f) => f.slice(0, -extname(f).length) === product.sku);
    if (file) images.push({ assetType: 'product-image', entityId: product.id, file: `products/${file}` });
  }
  return addImages(prisma, images);
}
