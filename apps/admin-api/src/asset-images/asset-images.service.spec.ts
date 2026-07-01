import { Test } from '@nestjs/testing';
import { AssetImagesService } from './asset-images.service';
import { ApiClientService } from '../api-client/api-client.service';

const mockApi = {
  postMultipart: jest.fn().mockResolvedValue({ id: 'img-1' }),
  get: jest.fn().mockResolvedValue([]),
  delete: jest.fn().mockResolvedValue(undefined),
  put: jest.fn().mockResolvedValue([]),
};

const mockFile: Express.Multer.File = {
  buffer: Buffer.from('fake-image'),
  originalname: 'photo.jpg',
  mimetype: 'image/jpeg',
  size: 1000,
  fieldname: 'file',
  encoding: '7bit',
  destination: '',
  filename: '',
  path: '',
  stream: null as any,
};

describe('AssetImagesService (BFF)', () => {
  let service: AssetImagesService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AssetImagesService,
        { provide: ApiClientService, useValue: mockApi },
      ],
    }).compile();
    service = module.get(AssetImagesService);
    jest.clearAllMocks();
  });

  describe('upload', () => {
    it('builds FormData with file, assetType, entityId and calls postMultipart', async () => {
      await service.upload('dist-a', 'product-image', 'product-1', mockFile, 'token-1');

      expect(mockApi.postMultipart).toHaveBeenCalledWith(
        '/admin/distributors/dist-a/asset-images',
        'token-1',
        expect.any(FormData),
      );
    });
  });

  describe('list', () => {
    it('calls api.get with encoded query params', async () => {
      await service.list('dist-a', 'product-image', 'product-1', 'token-1');
      expect(mockApi.get).toHaveBeenCalledWith(
        '/admin/distributors/dist-a/asset-images?assetType=product-image&entityId=product-1',
        'token-1',
      );
    });
  });

  describe('delete', () => {
    it('calls api.delete with imageId', async () => {
      await service.delete('dist-a', 'img-uuid', 'token-1');
      expect(mockApi.delete).toHaveBeenCalledWith('/admin/distributors/dist-a/asset-images/img-uuid', 'token-1');
    });
  });

  describe('reorder', () => {
    it('calls api.put with correct body', async () => {
      await service.reorder('dist-a', 'product-image', 'product-1', ['id-2', 'id-1'], 'token-1');
      expect(mockApi.put).toHaveBeenCalledWith(
        '/admin/distributors/dist-a/asset-images/reorder',
        'token-1',
        { assetType: 'product-image', entityId: 'product-1', imageIds: ['id-2', 'id-1'] },
      );
    });
  });
});
