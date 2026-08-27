import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { R2StorageService } from './r2-storage.service';

jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({
      send: jest.fn().mockResolvedValue({}),
    })),
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed.example.com/object?sig=abc'),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner') as { getSignedUrl: jest.Mock };

const mockConfig = {
  getOrThrow: jest.fn((key: string) => {
    const values: Record<string, string> = {
      R2_ACCOUNT_ID: 'test-account',
      R2_BUCKET_NAME: 'test-bucket',
      R2_DELIVERY_BUCKET_NAME: 'test-delivery-bucket',
      R2_PUBLIC_BASE_URL: 'https://cdn.example.com',
      R2_ACCESS_KEY_ID: 'key-id',
      R2_SECRET_ACCESS_KEY: 'secret-key',
    };
    return values[key];
  }),
};

describe('R2StorageService', () => {
  let service: R2StorageService;
  let mockSend: jest.Mock;

  beforeEach(async () => {
    getSignedUrl.mockClear();
    const module = await Test.createTestingModule({
      providers: [
        R2StorageService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get(R2StorageService);
    const clientInstance = (S3Client as jest.Mock).mock.results[
      (S3Client as jest.Mock).mock.results.length - 1
    ].value;
    mockSend = clientInstance.send;
  });

  it('upload sends PutObjectCommand with correct params', async () => {
    const buffer = Buffer.from('fake-image');
    await service.upload('test/key.webp', buffer, 'image/webp');

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ input: expect.objectContaining({
        Bucket: 'test-bucket',
        Key: 'test/key.webp',
        Body: buffer,
        ContentType: 'image/webp',
        ContentLength: buffer.length,
      })}),
    );
  });

  it('upload targets an explicit bucket when one is given', async () => {
    const buffer = Buffer.from('fake-image');
    await service.upload('test/key.webp', buffer, 'image/webp', service.deliveryBucket);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ input: expect.objectContaining({
        Bucket: 'test-delivery-bucket',
        Key: 'test/key.webp',
      })}),
    );
  });

  it('delete sends DeleteObjectCommand with correct key', async () => {
    await service.delete('test/key.webp');

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ input: expect.objectContaining({
        Bucket: 'test-bucket',
        Key: 'test/key.webp',
      })}),
    );
  });

  it('delete honours an explicit bucket override', async () => {
    await service.delete('test/key.webp', service.deliveryBucket);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ input: expect.objectContaining({
        Bucket: 'test-delivery-bucket',
        Key: 'test/key.webp',
      })}),
    );
  });

  it('presignGetUrl signs a GET for the given key/bucket and expiry', async () => {
    const url = await service.presignGetUrl('deliveries/x/full.webp', 900, service.deliveryBucket);

    expect(url).toBe('https://signed.example.com/object?sig=abc');
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ input: expect.objectContaining({
        Bucket: 'test-delivery-bucket',
        Key: 'deliveries/x/full.webp',
      })}),
      { expiresIn: 900 },
    );
  });

  it('deliveryBucket is read from R2_DELIVERY_BUCKET_NAME', () => {
    expect(service.deliveryBucket).toBe('test-delivery-bucket');
  });

  it('getPublicUrl returns correct URL', () => {
    const url = service.getPublicUrl('distributors/abc/products/def/images/ghi/thumb.webp');
    expect(url).toBe('https://cdn.example.com/distributors/abc/products/def/images/ghi/thumb.webp');
  });
});
