import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class R2StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  /**
   * Separate bucket for private, non-public objects (delivery proof photos).
   * Unlike `bucket`, this one has no public r2.dev / custom-domain access —
   * its objects are only ever reachable through a short-lived presigned URL.
   */
  readonly deliveryBucket: string;

  constructor(config: ConfigService) {
    const accountId = config.getOrThrow<string>('R2_ACCOUNT_ID');
    this.bucket = config.getOrThrow<string>('R2_BUCKET_NAME');
    this.deliveryBucket = config.getOrThrow<string>('R2_DELIVERY_BUCKET_NAME');
    this.publicBaseUrl = config.getOrThrow<string>('R2_PUBLIC_BASE_URL');

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.getOrThrow<string>('R2_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('R2_SECRET_ACCESS_KEY'),
      },
    });
  }

  async upload(key: string, buffer: Buffer, contentType: string, bucket?: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket ?? this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ContentLength: buffer.length,
      }),
    );
  }

  async download(key: string, bucket?: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: bucket ?? this.bucket, Key: key }),
    );
    const bytes = await result.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  async delete(key: string, bucket?: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: bucket ?? this.bucket,
        Key: key,
      }),
    );
  }

  /**
   * A time-limited URL that grants read access to a single object without
   * credentials. Used for private-bucket objects (delivery proof photos) so the
   * browser can load the bytes straight from R2 — nothing streams through the
   * API — while access stays scoped and expiring.
   */
  presignGetUrl(key: string, expiresInSeconds: number, bucket?: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: bucket ?? this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  getPublicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }
}
