export interface ImageVariantConfig {
  name: string;
  width: number;
  height: number;
  fit: 'cover' | 'inside' | 'contain';
}

export interface AssetTypeConfig {
  keyTemplate: string;
  variants: ImageVariantConfig[];
  acceptedMimeTypes: string[];
  maxSizeBytes: number;
  minDimensionPx: number;
  maxDimensionPx: number;
}

export interface ProcessedVariant {
  buffer: Buffer;
  width: number;
  height: number;
}

export interface ProcessedVariants {
  variants: Map<string, ProcessedVariant>;
  sourceWidth: number;
  sourceHeight: number;
}

export interface UploadInput {
  buffer: Buffer;
  originalname?: string;
  mimetype: string;
  size: number;
}

export interface AssetImageRecord {
  id: string;
  assetType: string;
  entityId: string;
  distributorId: string;
  variants: Record<string, string>;
  sourceFilename: string | null;
  sourceMimeType: string;
  sourceSizeBytes: number;
  sourceWidth: number | null;
  sourceHeight: number | null;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}
